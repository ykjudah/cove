const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
test('moderation logs snapshot DM recipients and group names with admin-only access',async()=>{
  const {db,room,user}=await require('./live-backend.cjs').create();
  try {
    await user(0);
    const dm=(await db.query("select start_dm('bobby') id")).rows[0].id;
    const message=(await db.query("insert into messages(room_id,body) values($1,'private content') returning id",[dm])).rows[0].id;
    await db.query("insert into messages(room_id,body) values($1,'group content')",[room]);
    const logs=(await db.query('select * from moderation_logs()')).rows;
    assert.equal(logs.find(l=>l.object_id===message).destination,'bobby');
    assert.equal(logs.find(l=>l.object_id===message).destination_kind,'dm');
    assert.equal(logs.find(l=>l.room_id===room&&l.action==='Sent a message').destination,'Call test');
    assert.ok(!JSON.stringify(logs).includes('private content'));
    assert.ok(!logs.some(l=>l.action==='Chat update'),'room activity bookkeeping does not create noisy logs');
    await user(1);
    await db.exec("reset role");
    await db.query("update profiles set username='renamed_bobby' where id=auth.uid()");
    await user(1);
    await assert.rejects(db.query('select * from moderation_logs()'),/Admin access/);
    await user(0);
    assert.equal((await db.query('select * from moderation_logs()')).rows.find(l=>l.object_id===message).destination,'bobby');
    await db.exec('reset role');
    const migration=fs.readFileSync(require.resolve('../supabase/upgrade-log-destinations.sql'),'utf8');
    await db.exec(migration);await db.exec(migration);
    await user(0);
    assert.equal((await db.query('select * from moderation_logs()')).rows.find(l=>l.object_id===message).destination,'bobby');
  }finally{await db.close();}
});
