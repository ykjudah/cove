const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const {create}=require('./live-backend.cjs');
test('account names, trusted group notices, and private opt-in receipts',async()=>{
 const f=await create(),{db,ids,room,user}=f;
 try{
 await db.exec('reset role');await db.exec(fs.readFileSync(require.resolve('../supabase/upgrade-account-social.sql'),'utf8'));
 await user(0);await db.query('update profiles set display_name=$1 where id=$2',['Judah',ids[0]]);
 assert.equal((await db.query('select display_name from profiles where id=$1',[ids[0]])).rows[0].display_name,'Judah');
 await db.query('update profiles set display_name=$1 where id=$2',['Spoof',ids[1]]);assert.equal((await db.query('select display_name from profiles where id=$1',[ids[1]])).rows[0].display_name,'');
 await db.query('update rooms set name=$1 where id=$2',['Renamed',room]);
 const notices=(await db.query('select sender_id,system_event from messages where room_id=$1 and system_event is not null',[room])).rows;assert.equal(notices.length,1);assert.equal(notices[0].sender_id,ids[0]);assert.equal(notices[0].system_event.name,'Renamed');
 await assert.rejects(db.query("insert into messages(room_id,body,system_event) values($1,'fake','{}')",[room]));
 assert.equal((await db.query('select read_receipts_enabled() enabled')).rows[0].enabled,false);
 await db.query('select * from chat_read_receipts($1,true)',[room]);assert.equal((await db.query('select * from chat_read_receipts($1,false)',[room])).rows.length,0);
 await db.query('select set_read_receipts(true)');await db.query('select * from chat_read_receipts($1,true)',[room]);
 await user(1);assert.equal((await db.query('select * from chat_read_receipts($1,false)',[room])).rows[0].user_id,ids[0]);
 await user(3);await assert.rejects(db.query('select * from chat_read_receipts($1,false)',[room]));
 await user(0);await db.query('select set_read_receipts(false)');assert.equal((await db.query('select * from chat_read_receipts($1,false)',[room])).rows.length,0);
 await db.exec('reset role');await db.query('update auth.users set email=$1 where id=$2',['alice_new@users.example.com',ids[0]]);assert.equal((await db.query('select username from profiles where id=$1',[ids[0]])).rows[0].username,'alice_new');
 await assert.rejects(db.query('update auth.users set email=$1 where id=$2',['bobby@users.example.com',ids[0]]));assert.equal((await db.query('select email from auth.users where id=$1',[ids[0]])).rows[0].email,'alice_new@users.example.com');
 }finally{await db.close()}
});
