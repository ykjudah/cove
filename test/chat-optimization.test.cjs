const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const source=path.join(__dirname,'../src/chat-window.mjs');
const app=fs.readFileSync(path.join(__dirname,'../src/app.js'),'utf8');

async function helpers(){return import(pathToFileURL(source).href);}

test('messages are ordered by timestamp then ID without dropping ties',async()=>{
 const {CHAT_PAGE_SIZE,CHAT_CATCHUP_SIZE,compareMessageCursor,newestMessage,olderMessage}=await helpers();
 assert.equal(CHAT_PAGE_SIZE,50);
 assert.equal(CHAT_CATCHUP_SIZE,100);
 const first={id:'00000000-0000-0000-0000-000000000001',created_at:'2026-11-11T12:00:00Z'};
 const second={...first,id:'00000000-0000-0000-0000-000000000002'};
 const newer={...first,created_at:'2026-11-11T12:00:01Z'};
 assert.ok(compareMessageCursor(first,second)<0);
 assert.ok(compareMessageCursor(second,newer)<0);
 assert.equal(newestMessage([first,newer,second]),newer);
 assert.equal(olderMessage(newer,first),first);
 assert.equal(olderMessage(null,first),first);
 assert.equal(newestMessage([]),null);
});

test('cursor catch-up recovers 235 missed messages including timestamp ties',async()=>{
 const {fetchMissedMessages,compareMessageCursor}=await helpers();
 const original={id:'m000',room_id:'room',created_at:'2026-11-12T13:00:00Z'};
 const newer=Array.from({length:235},(_,i)=>({
   ...original,id:'m'+String(i+1).padStart(3,'0'),
   created_at:i<120?'2026-11-12T13:00:00Z':'2026-11-12T13:00:01Z'
 }));
 const collected=new Map([[original.id,original]]);
 let pages=0;
 const fetched=await fetchMissedMessages(original,
   async(cursor,limit)=>{
     pages++;
     return newer.filter(x=>compareMessageCursor(x,cursor)>0).slice(0,limit);
   },
   async rows=>{for(const row of rows)collected.set(row.id,row);},()=>true);
 assert.equal(fetched,235);
 assert.equal(collected.size,236);
 assert.equal(pages,3);
 assert.equal(collected.get('m235').created_at,'2026-11-12T13:00:01Z');
 const after=newer.at(-1);
 assert.equal(await fetchMissedMessages(after,async()=>[],async()=>{},()=>true),0);
});

test('cursor catch-up stops when the conversation is switched',async()=>{
 const {fetchMissedMessages}=await helpers();
 let active=true,count=0;
 const result=await fetchMissedMessages({id:'a',created_at:'2026-11-12T13:00:00Z'},
   async()=>{count++;active=false;return [{id:'b',created_at:'2026-11-12T13:00:01Z'}];},
   async()=>{throw Error('stale conversations must not be mutated');},()=>active);
 assert.equal(result,0);
 assert.equal(count,1);
});

test('cursor catch-up rejects nonadvancing pages rather than looping forever',async()=>{
 const {fetchMissedMessages}=await helpers();
 const cursor={id:'b',created_at:'2026-11-12T13:00:00Z'};
 await assert.rejects(fetchMissedMessages(cursor,async()=>[cursor],async()=>{},()=>true),/Non-advancing/);
});

test('group avatars are fetched separately and refreshed only when needed',async()=>{
 const {groupAvatarsToRefresh}=await helpers();
 const rooms=[{id:'dm',kind:'dm'},{id:'groupA',kind:'group'},{id:'groupB',kind:'group'},{id:'groupC',kind:'group'}];
 const cache=new Map([
  ['groupA',{value:'image',at:1000000}],
  ['groupB',{value:null,at:1000000-600001}]
 ]);
 assert.deepEqual(groupAvatarsToRefresh(rooms,cache,1000000),['groupB','groupC']);
 cache.set('groupB',{value:'new image',at:1000000});
 cache.set('groupC',{value:null,at:1000000});
 assert.deepEqual(groupAvatarsToRefresh(rooms,cache,1000000),[]);
 assert.deepEqual(groupAvatarsToRefresh(rooms,cache,1600001),['groupA','groupB','groupC']);
});

test('joined Imposter games keep original fast auto-open polling',async()=>{
 const {imposterDiscoveryInterval}=await helpers();
 assert.equal(imposterDiscoveryInterval([{joined:true,phase:'lobby'}]),2500);
 assert.equal(imposterDiscoveryInterval([{joined:true,phase:'finished'}]),2500);
 assert.equal(imposterDiscoveryInterval([{joined:false,phase:'lobby'}]),8000);
 assert.equal(imposterDiscoveryInterval([]),8000);
 assert.equal(imposterDiscoveryInterval([],10000,9000),2500,'recently joined games keep fast polling');
 assert.equal(imposterDiscoveryInterval([],10000,10000),8000,'fast hint eventually expires');
});

test('reconnecting does not discard older message pagination',async()=>{
 const {hasOlderMessages,needsGameCardReconcile}=await helpers();
 const cached={id:'m20',created_at:'2026-11-11T12:00:00Z'};
 assert.equal(hasOlderMessages(false,cached,10,true),true,'recent data must not hide older cached pages');
 assert.equal(hasOlderMessages(false,cached,10,false),false,'a short refresh cannot create imaginary older pages');
 assert.equal(hasOlderMessages(false,null,50,false),true,'initial full page indicates earlier history may exist');
 assert.equal(hasOlderMessages(false,null,10,true),false,'initial partial page ends history');
 assert.equal(hasOlderMessages(true,null,0,true),false,'empty older page ends pagination');
 assert.equal(needsGameCardReconcile(false,false,5000,6000),false,'idle cards are not re-polled at 10s');
 assert.equal(needsGameCardReconcile(false,false,5000,51000),true,'idle safety check still happens');
 assert.equal(needsGameCardReconcile(true,false,5000,6000),true,'active games are always checked');
 assert.equal(needsGameCardReconcile(false,true,5000,6000),true,'finish transitions are checked immediately');
});

test('recent conversation cache evicts least recently used and never uses disk',async()=>{
 const {createConversationCache}=await helpers();
 const cache=createConversationCache(2);
 cache.set('room1',{messages:new Map([['m1',{id:'m1'}]]),parents:new Map(),reactions:new Map()});
 cache.set('room2',{messages:new Map([['m2',{id:'m2'}]]),parents:new Map(),reactions:new Map()});
 assert.ok(cache.get('room1'));
 cache.set('room3',{messages:new Map(),parents:new Map(),reactions:new Map()});
 assert.equal(cache.size,2);
 assert.equal(cache.get('room2'),null);
 assert.ok(cache.get('room1'));
 cache.clear();
 assert.equal(cache.size,0);
});

test('cached message edits and reactions update without opening a room',async()=>{
 const {createConversationCache}=await helpers();
 const cache=createConversationCache(2);
 const original={id:'m',room_id:'room',body:'before',created_at:'2026-11-11T00:00:00Z'};
 const entry={messages:new Map([['m',original]]),parents:new Map([['m',original]]),reactions:new Map()};
 cache.set('room',entry);
 cache.updateMessage({...original,body:'after',deleted_at:'2026-11-11T03:00:00Z'});
 assert.equal(cache.get('room').messages.get('m').body,'after');
 assert.equal(cache.get('room').parents.get('m').deleted_at,'2026-11-11T03:00:00Z');
 cache.updateReaction({message_id:'m',user_id:'user',emoji:'👍',active:true,updated_at:'2026-11-11T03:00:01Z'});
 cache.updateReaction({message_id:'m',user_id:'user',emoji:'👍',active:false,updated_at:'2026-11-11T03:00:00Z'});
 assert.equal(cache.get('room').reactions.get('m:user:👍').active,true,'older events cannot overwrite new reaction status');
});

test('live inserts keep inactive chats current without unbounded memory',async()=>{
 const {createConversationCache}=await helpers();
 const cache=createConversationCache(2);
 const entry={messages:new Map(),parents:new Map(),reactions:new Map(),oldest:null,hasOlder:false};
 cache.set('room',entry);
 for(let i=0;i<220;i++)cache.appendMessage({id:'m'+String(i).padStart(3,'0'),
   room_id:'room',body:'message '+i,created_at:'2026-11-11T12:00:00Z'});
 assert.equal(entry.messages.size,200);
 assert.equal(entry.messages.has('m000'),false);
 assert.equal(entry.messages.has('m219'),true);
 assert.equal(entry.oldest.id,'m020');
 assert.equal(entry.hasOlder,true);
});

test('coalescing multiple simultaneous refresh requests performs one trailing retry',async()=>{
 const {createSerialRefresh}=await helpers();
 let releaseFirst, calls=0;
 const started=new Promise(resolve=>{releaseFirst=resolve;});
 const refresh=createSerialRefresh(async()=>{calls++;if(calls===1)await started;});
 const first=refresh(),second=refresh(),third=refresh();
 assert.equal(first,second);
 assert.equal(second,third);
 assert.equal(calls,1);
 releaseFirst();
 await first;
 assert.equal(calls,2,'bursts perform one extra fetch, not one per event');
 await refresh();
 assert.equal(calls,3,'new events can refresh after completion');
});

test('Cove UI pages 50 messages, catches up after reconnect and preserves 3D multiplayer',()=>{
 assert.match(app,/\.limit\(recentLimit\)/);
 assert.match(app,/renderMessages\(!older && jumpToBottom, older\)/);
 assert.match(app,/hasOlderMessages\(older, cachedNewest, rows\.length, hasOlder\)/);
 assert.match(app,/needsGameCardReconcile\(hasActive,wasActive,lastCheck,Date\.now\(\)\)/);
 assert.match(app,/imposterDiscoveryInterval\(rows,impInviteFastUntil\)/);
 assert.match(app,/impInviteFastUntil=Date\.now\(\)\+30000/);
 assert.match(app,/impInviteTimer=setTimeout\(impInviteCount,interval\)/);
 assert.match(app,/\.limit\(CHAT_CATCHUP_SIZE\)/);
 assert.match(app,/fetchMissedMessages\(cachedNewest/);
 assert.match(app,/loadHistory\(true\)/);
 assert.match(app,/newestMessage\(messages\.values\(\)\)/);
 assert.match(app,/queueChatReconcile\(\)/);
 assert.match(app,/conversationCache\.clear\(\)/);
 assert.match(app,/createSerialRefresh\(refreshRoomsOnce\)/);
 assert.match(app,/createSerialRefresh\(refreshSocialOnce\)/);
 assert.match(app,/room_members\(user_id\)'\)/);
 assert.match(app,/groupAvatarsToRefresh\(visible,roomAvatarCache\)/);
 assert.match(app,/\.select\('id,avatar_data'\)\.in\('id',unknownAvatars\)/);
 assert.match(app,/roomAvatarCache\.set\(event\.new\.id/);
 assert.doesNotMatch(app,/\.select\('id,name,kind,avatar_data,created_at,last_activity_at,room_members/);
 assert.match(app,/conversationCache\.appendMessage\(m\)/);
 assert.match(app,/Date\.now\(\)-cached\.savedAt>15000/);
 assert.match(app,/document\.visibilityState !== 'visible'/);
 assert.match(app,/globalThis\.CoveImposter3D\?\.mountImposter/);
 assert.match(app,/bridgeImposterRpc/);
});
