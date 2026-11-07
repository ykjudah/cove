const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { randomUUID } = require('node:crypto');
const { username, emailFor, backend } = require('../src/validation.cjs');

test('usernames and public backend configuration are validated', () => {
  assert.equal(username('  Alex_12 '), 'alex_12');
  assert.equal(emailFor('Alex'), 'alex@users.example.com');
  for (const value of ['a', 'hello world', 'a@b', '<script>', 'a'.repeat(25)]) assert.throws(() => username(value));
  assert.equal(backend('https://my-project.supabase.co', 'sb_publishable_test').url, 'https://my-project.supabase.co');
  for (const url of ['http://my.supabase.co', 'https://evil.com', 'https://my.supabase.co.evil.com', 'https://my.supabase.co/a', 'https://u:p@my.supabase.co'])
    assert.throws(() => backend(url, 'sb_publishable_test'));
  assert.throws(() => backend('https://my.supabase.co', 'sb_secret_test'));
  const jwt = role => 'eyJ.' + Buffer.from(JSON.stringify({ role })).toString('base64url') + '.signature';
  assert.throws(() => backend('https://my.supabase.co', jwt('service_role')));
  assert.ok(backend('https://my.supabase.co', jwt('anon')));
});

test('actual PostgreSQL enforces room privacy, authentication, and sender identity', async () => {
  const { PGlite } = require(process.env.PGLITE_TEST_PATH || '@electric-sql/pglite');
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub',true), '')::uuid $$;
      create schema realtime;create table realtime.messages(topic text,extension text,payload jsonb);alter table realtime.messages enable row level security;
      create function realtime.topic() returns text language sql stable as $$select current_setting('request.jwt.claim.topic',true)$$;
      grant usage on schema auth,realtime to authenticated, anon;
      grant execute on function auth.uid(),realtime.topic() to authenticated, anon;
      grant select,insert on realtime.messages to authenticated;
      create publication supabase_realtime;
    `);
    await db.exec(readFileSync(require.resolve('../supabase/setup.sql'), 'utf8'));
    await db.exec(readFileSync(require.resolve('../supabase/upgrade-1.1.sql'), 'utf8'));
    await db.exec(readFileSync(require.resolve('../supabase/upgrade-1.1.sql'), 'utf8')); // Rerunning the migration preserves existing data.
    await db.exec(readFileSync(require.resolve('../supabase/upgrade-1.1.1.sql'), 'utf8'));
    await db.exec(readFileSync(require.resolve('../supabase/upgrade-1.1.1.sql'), 'utf8'));
    const alice = randomUUID(), bob = randomUUID(), eve = randomUUID();
    for (const [id, name] of [[alice, 'alice'], [bob, 'bob'], [eve, 'eve']])
      await db.query('insert into auth.users values ($1,$2,$3)', [id, emailFor(name), JSON.stringify({ username: name })]);
    await assert.rejects(db.query('insert into auth.users values ($1,$2,$3)', [randomUUID(), 'wrong@example.com', JSON.stringify({ username: 'wrong' })]));
    const asUser = async id => {
      await db.exec('reset role');
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id || '']);
      await db.exec('set role authenticated');
    };
    await asUser(alice);
    const dm = (await db.query("select public.start_dm('bob') as id")).rows[0].id;
    assert.equal((await db.query("select public.start_dm('bob') as id")).rows[0].id, dm);
    await assert.rejects(db.query("select public.start_dm('alice')"));
    await assert.rejects(db.query("select public.start_dm('missing')"));
    const messageId = randomUUID();
    await db.query('insert into public.messages(id,room_id,body) values($1,$2,$3)', [messageId, dm, 'hello']);
    assert.equal((await db.query('select sender_id from public.messages')).rows[0].sender_id, alice);
    await assert.rejects(db.query('insert into public.messages(room_id,sender_id,body) values($1,$2,$3)', [dm, bob, 'forged']));
    await assert.rejects(db.query("insert into public.messages(room_id,created_at,body) values($1,now(),'fake date')", [dm]));
    await assert.rejects(db.query("insert into public.messages(room_id,body) values($1,'   ')", [dm]));
    await assert.rejects(db.query('insert into public.messages(room_id,body) values($1,$2)', [dm, 'x'.repeat(4001)]));
    await assert.rejects(db.query('insert into public.room_members(room_id,user_id) values($1,$2)', [dm, eve]));
    const group = (await db.query("select public.create_group('Crew',array['bob']) as id")).rows[0].id;
    await assert.rejects(db.query("select public.create_group('Crew',array['nobody'])"));
    await assert.rejects(db.query("select public.create_group('Crew',array[]::text[])"));
    await assert.rejects(db.query("select public.create_group('Crew',array['alice'])"));
    await asUser(bob);
    assert.equal((await db.query("select public.start_dm('alice') as id")).rows[0].id, dm);
    assert.equal((await db.query('select * from public.messages where room_id=$1', [dm])).rows.length, 1);
    assert.equal((await db.query('select * from public.room_members where room_id=$1', [group])).rows.length, 2);
    await db.query("insert into public.messages(room_id,body) values($1,'hi back')", [dm]);
    await asUser(eve);
    assert.equal((await db.query('select * from public.messages')).rows.length, 0);
    assert.equal((await db.query('select * from public.rooms')).rows.length, 0);
    assert.equal((await db.query('select * from public.room_members')).rows.length, 0);
    await assert.rejects(db.query("insert into public.messages(room_id,body) values($1,'intrusion')", [dm]));
    await assert.rejects(db.query("insert into public.messages(room_id,body) values($1,'intrusion')", [group]));
    await assert.rejects(db.query('select * from public.toggle_reaction($1,$2)', [messageId,'👍']));
    await assert.rejects(db.query('select * from public.delete_message($1)', [messageId]));
    assert.equal((await db.query('select * from public.message_reactions')).rows.length,0);
    await db.exec('reset role');
    await db.exec(readFileSync(require.resolve('../supabase/upgrade-1.1.sql'), 'utf8'));
    await db.exec(readFileSync(require.resolve('../supabase/upgrade-1.1.1.sql'), 'utf8'));
    await db.exec(readFileSync(require.resolve('../supabase/upgrade-emojis.sql'),'utf8'));
    await asUser(alice);
    assert.equal((await db.query('select body from public.messages where id=$1',[messageId])).rows[0].body,'hello');
    const groupMessageId=randomUUID(), replyId=randomUUID();
    await db.query('insert into public.messages(id,room_id,body) values($1,$2,$3)',[groupMessageId,group,'group only']);
    await db.query('insert into public.messages(id,room_id,body,reply_to) values($1,$2,$3,$4)',[replyId,dm,'a reply',messageId]);
    await assert.rejects(db.query('insert into public.messages(room_id,body,reply_to) values($1,$2,$3)',[group,'cross-room reply',messageId]));
    const firstReaction=(await db.query('select * from public.toggle_reaction($1,$2)',[messageId,'👍'])).rows[0];
    assert.equal(firstReaction.user_id,alice); assert.equal(firstReaction.active,true);
    assert.equal((await db.query('select * from public.toggle_reaction($1,$2)',[messageId,'👍'])).rows[0].active,false);
    assert.equal((await db.query('select * from public.toggle_reaction($1,$2)',[messageId,'👍'])).rows[0].active,true);
    for (const [emoji] of Object.values(require('../src/emoji.cjs')).flat()) {
      const result = (await db.query('select * from public.toggle_reaction($1,$2)', [messageId, emoji])).rows[0];
      assert.equal(result.emoji, emoji);
      if (result.active) await db.query('select * from public.toggle_reaction($1,$2)', [messageId, emoji]);
    }
    await db.query('select * from public.toggle_reaction($1,$2)', [messageId, '👍']);
    await assert.rejects(db.query('select * from public.toggle_reaction($1,$2)',[messageId,'arbitrary text']));
    await assert.rejects(db.query('insert into public.message_reactions(message_id,user_id,emoji) values($1,$2,$3)',[messageId,bob,'👍']));
    await assert.rejects(db.query('update public.messages set body=$1 where id=$2',['edited',messageId]));
    await asUser(bob);
    await assert.rejects(db.query('select * from public.delete_message($1)',[messageId]));
    assert.equal((await db.query('select * from public.toggle_reaction($1,$2)',[messageId,'👍'])).rows[0].active,true);
    assert.equal((await db.query('select * from public.message_reactions where message_id=$1 and active',[messageId])).rows.length,2);
    await asUser(eve);
    assert.equal((await db.query('select * from public.message_reactions')).rows.length,0);
    await assert.rejects(db.query('insert into public.messages(room_id,body,reply_to) values($1,$2,$3)',[dm,'unauthorized reply',messageId]));
    await asUser(alice);
    const tombstone=(await db.query('select * from public.delete_message($1)',[messageId])).rows[0];
    assert.equal(tombstone.body,''); assert.ok(tombstone.deleted_at);
    assert.equal((await db.query('select * from public.messages where id=$1',[replyId])).rows[0].reply_to,messageId);
    await assert.rejects(db.query('select * from public.toggle_reaction($1,$2)',[messageId,'👍']));
    await assert.rejects(db.query('insert into public.messages(room_id,body,reply_to) values($1,$2,$3)',[dm,'reply to deleted',messageId]));
    assert.equal((await db.query('select * from public.delete_message($1)',[messageId])).rows[0].deleted_at.getTime(),tombstone.deleted_at.getTime());
    await db.exec('reset role; set role anon');
    await assert.rejects(db.query('select * from public.messages'));
    await assert.rejects(db.query("select public.start_dm('alice')"));
    await asUser('');
    await assert.rejects(db.query("select public.start_dm('alice')"));
  } finally { await db.close(); }
});
