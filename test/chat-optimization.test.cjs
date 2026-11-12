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
 assert.match(app,/\.limit\(CHAT_PAGE_SIZE\)/);
 assert.match(app,/\.limit\(CHAT_CATCHUP_SIZE\)/);
 assert.match(app,/loadHistory\(true\)/);
 assert.match(app,/newestMessage\(messages\.values\(\)\)/);
 assert.match(app,/queueChatReconcile\(\)/);
 assert.match(app,/conversationCache\.clear\(\)/);
 assert.match(app,/createSerialRefresh\(refreshRoomsOnce\)/);
 assert.match(app,/createSerialRefresh\(refreshSocialOnce\)/);
 assert.match(app,/document\.visibilityState !== 'visible'/);
 assert.match(app,/globalThis\.CoveImposter3D\?\.mountImposter/);
 assert.match(app,/bridgeImposterRpc/);
});
