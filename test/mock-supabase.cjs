const Golf=require('../src/mini-golf.cjs');const golfGames=[];
globalThis.__acceptGolf=()=>{const g=golfGames.at(-1);g.player2=bob;g.state=Golf.initial([bob,alice],123,g.hole_count||3);};
const Pool=require('../src/eight-ball.cjs');
const ChessGame=require('../src/chess-game.cjs');
const chessGames=[];
globalThis.__acceptChess=()=>{const g=chessGames.at(-1);g.player2=bob;g.status='active';g.state=ChessGame.initial({w:alice,b:bob},g.seconds,Date.now());g.revision++;};
const impMatches=new Map();
const games=[];
globalThis.__acceptPool=()=>{const g=games.at(-1);g.player2=bob;g.state=Pool.initial([bob,alice]);};
// UI testing only. Production builds do NOT import this module.
const alice = '11111111-1111-4111-8111-111111111111', bob = '22222222-2222-4222-8222-222222222222';
const group = '33333333-3333-4333-8333-333333333333';
const charlie = '44444444-4444-4444-8444-444444444444', dana = '55555555-5555-4555-8555-555555555555';
const frank='66666666-6666-4666-8666-666666666666';
const profiles=[{id:alice,username:'judah',avatar_data:null,about_me:''},{id:bob,username:'alex',avatar_data:null,about_me:'Always up for a walk.'},{id:group,username:'sam',avatar_data:null,about_me:''},{id:charlie,username:'charlie',avatar_data:null,about_me:''},{id:dana,username:'dana',avatar_data:null,about_me:''},{id:frank,username:'frank',avatar_data:null,about_me:''}];
Object.assign(profiles[0],JSON.parse(localStorage.getItem('mock-profile')||'{}'));
const media=[];const mediaFiles=new Map();
const friendships=[{sender_id:group,recipient_id:alice,status:'pending'}],blocks=[];
const hiddenRooms=[];
const member = (id, name) => ({ user_id: id, profiles: profiles.find(p=>p.id===id) });
const rooms = [
  { id: 'crew', name: 'The usual crew', kind: 'group', avatar_data:null, room_members: [member(alice, 'judah'), member(bob, 'alex'), member(group, 'sam'), member(charlie, 'charlie'), member(dana, 'dana')] },
  { id: 'alex', name: 'Direct message', kind: 'dm', avatar_data:null, room_members: [member(alice, 'judah'), member(bob, 'alex')] },
  { id: 'weekend', name: 'Weekend plans', kind: 'group', avatar_data:null, room_members: [member(alice, 'judah'), member(bob, 'alex')] }
];
const messages = [
  ['alex', 'Anyone around later?', bob],
  ['judah', 'Yeah, I should be free after 6.', alice],
  ['sam', 'Perfect. Same plan as last time?', group],
  ['alex', 'Works for me. Also this is way easier than keeping five different chats open.', bob],
  ['judah', 'That was the idea 😄', alice]
].map((m, i) => ({ id: 'sample-' + i, room_id: 'crew', sender_id: m[2], body: m[1], created_at: new Date(Date.UTC(2026, 9, 23, 17, 10 + i)).toISOString() }));
const reactions = [];
const moderationRows=[
  {account_id:alice,username:'judah',account_created_at:'2026-10-01T00:00:00Z',last_seen_at:null,last_ip:null,possible_matches:[]},
  {account_id:bob,username:'alex',account_created_at:'2026-10-01T00:00:00Z',last_seen_at:'2026-10-24T12:00:00Z',last_ip:'192.0.2.20',possible_matches:[{account_id:group,username:'sam-alt',last_seen_at:'2026-10-24T11:00:00Z'}]},
  {account_id:frank,username:'frank',account_created_at:'2026-10-02T00:00:00Z',last_seen_at:null,last_ip:null,possible_matches:[]}
];
const mockChannels=[];
globalThis.__pocketchatMockChannels=mockChannels;
function createClient(url,key,options) {
 const authKey=options?.auth?.storageKey||'mock-auth',remember=()=>{if(options?.auth?.persistSession)localStorage.setItem(authKey,JSON.stringify({user:{id:alice}}));};
  return {
    auth: {
      async getSession(){return {data:{session:JSON.parse(localStorage.getItem(authKey)||'null')},error:null};},
      onAuthStateChange() {},
      async signInWithPassword() { remember();return { data: { user: { id: alice }, session: {} }, error: null }; },
      async signUp() { remember();return { data: { user: { id: alice }, session: {} }, error: null }; },
      async signOut() {localStorage.removeItem(authKey);return { error: null }; }
    },
    storage:{from(){return {async upload(path,blob){mediaFiles.set(path,await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.readAsDataURL(blob);}));return {data:{path},error:null};},async createSignedUrls(paths){return {data:paths.map(path=>({path,signedUrl:mediaFiles.get(path)})),error:null};},async createSignedUrl(path){return mediaFiles.has(path)?{data:{signedUrl:mediaFiles.get(path)},error:null}:{data:null,error:{message:'Missing image'}};}};}},
    from(table) {
      let filters = {}, inserted, included = {}, updated, deleting=false; 
      const q = { range(){return q;},
        update(value) { updated=value;return q; },
        delete() { deleting=true;return q; },
        select() { return q; }, order() { return q; }, limit() { return q; }, or() { return q; },
        in(key, values) { included[key] = values; return q; },
        eq(key, value) { filters[key] = value; return q; },
        insert(value) { if(table==='chat_media'){inserted={archived:false,...value};media.push(inserted);}else if(table==='hidden_rooms'){if(!hiddenRooms.some(r=>r.room_id===value.room_id))hiddenRooms.push({...value});inserted=value;}else{inserted = { ...value, sender_id: alice, created_at: new Date().toISOString() }; messages.push(inserted);}return q; },
        single() { const person=profiles.find(p=>p.id===filters.id),room=rooms.find(r=>r.id===filters.id);if(updated&&person){Object.assign(person,updated);if(person.id===alice)localStorage.setItem('mock-profile',JSON.stringify(person));}if(updated&&room)Object.assign(room,updated);return Promise.resolve({ data: table==='golf_games'?golfGames.find(g=>g.id===filters.id):table==='chat_media'?inserted||media.find(m=>m.id===filters.id):table==='chat_games'?games.find(g=>g.id===filters.id):table === 'profiles' ? person : table==='rooms'?room:inserted || messages.find(m => m.id === filters.id), error: null }); },
        then(resolve) {
          let data;
          if(table==='golf_games')data=golfGames.filter(g=>!filters.room_id||g.room_id===filters.room_id);
          else if(table==='chat_media'){if(updated)for(const m of media.filter(m=>m.id===filters.id))Object.assign(m,updated);data=media.filter(m=>Object.entries(filters).every(([k,v])=>m[k]===v));}
          else if(table==='chat_games')data=games.filter(g=>!filters.room_id||g.room_id===filters.room_id);
          else if(table==='profiles')data=profiles.filter(p=>!included.id||included.id.includes(p.id));
          else if(table==='friendships')data=friendships;
          else if(table==='user_blocks')data=blocks;
          else if(table==='rooms')data=rooms;
          else if(table==='hidden_rooms'){if(deleting){for(let i=hiddenRooms.length-1;i>=0;i--)if(!filters.room_id||hiddenRooms[i].room_id===filters.room_id)hiddenRooms.splice(i,1);data=null;}else data=hiddenRooms;}
          else if(table==='messages')data=messages.filter(m => !filters.room_id || m.room_id === filters.room_id).filter(m => !included.id || included.id.includes(m.id)).slice().reverse();
          else if(table==='message_reactions')data=reactions.filter(r => !included.message_id || included.message_id.includes(r.message_id));
          else data=[];
          return Promise.resolve({ data, error: null }).then(resolve);
        }
      };
      return q;
    },
    channel(topic, options) {
      const handlers=[],record={topic,options,sent:[],subscribed:false,emit(kind,payload){for(const h of handlers)if(h.kind===kind&&(!h.filter?.event||h.filter.event==='*'||h.filter.event===payload?.event))h.callback(payload);}};
      const ch={on(kind,filter,callback){handlers.push({kind,filter,callback});return ch;},subscribe(cb){queueMicrotask(()=>{record.subscribed=true;cb('SUBSCRIBED');});return ch;},send(payload){record.sent.push(payload);return Promise.resolve('ok');}};
      record.channel=ch;mockChannels.push(record);return ch;
    },
    async removeChannel(ch) { const i=mockChannels.findIndex(x=>x.channel===ch);if(i>=0)mockChannels.splice(i,1); },
    functions:{async invoke(){return {data:{recorded:true},error:null};}},
    rpc(name,args) {
      if(name==='imp_list')return Promise.resolve({data:[...impMatches.values()].map(d=>({...d.game,players:4,joined:true}))});
      if(name==='imp_create'){
        const id=crypto.randomUUID(),players=[alice,bob,charlie,dana].map((uid,i)=>({uid,joined:true,alive:true,room:0,suit:i,hat:'none'}));
        impMatches.set(id,{game:{id,host:alice,map:args.map_name,imposters:args.imposters,tasks:args.task_count,cooldown:args.cooldown,vote_seconds:args.vote_seconds,phase:'lobby'},me:{uid:alice,move_rev:0,suit:0,hat:'none',alive:true,role:'Innocent',todo:[1,2],done:[],room:0},players,chat:[],progress:0,total:6});
        return Promise.resolve({data:id});
      }
      if(name==='imp_nearby')return Promise.resolve({data:impMatches.get(args.game_id).players});
      if(name==='imp_steps'){const s=impMatches.get(args.game_id).me;if(args.revision===s.move_rev){for(const [dx,dy] of args.steps){s.x+=dx;s.y+=dy;}s.move_rev++;s.room=s.x<283?-1:0;}return Promise.resolve({data:{x:s.x,y:s.y,revision:s.move_rev}});}
      if(name==='imp_walk'){const state=impMatches.get(args.game_id);Object.assign(state.me,{x:args.px,y:args.py,room:args.px<283?-1:0});return Promise.resolve({data:{x:args.px,y:args.py}});}
      if(name==='imp_action'){const state=impMatches.get(args.game_id);if(args.act==='cosmetic'){const look=JSON.parse(args.arg);Object.assign(state.me,look);Object.assign(state.players[0],look);}if(args.act==='start'){state.game.phase='play';Object.assign(state.me,{x:350,y:94});state.players.forEach((p,i)=>Object.assign(p,{x:350+i*8,y:94+i*2}));}if(args.act==='move')state.me.room=+args.arg;return Promise.resolve({data:state});}
      if(name==='joinable_chat_calls')return Promise.resolve({data:[{room_id:'crew',video:false,joined:2}]});
      if(name==='head_to_head')return Promise.resolve({data:[{mode:'four',wins:2,losses:1}]});
      if(name==='create_four_game'){
        const id=crypto.randomUUID();
        messages.push({id,room_id:args.target_room,sender_id:alice,body:'Four in a Row',system_event:{kind:'four',board:'.'.repeat(42),players:[alice],revision:0},created_at:new Date().toISOString()});
        return Promise.resolve({data:id});
      }
      if(name==='poll_live_calls')return Promise.resolve({data:null});
      if(name==='is_app_admin')return Promise.resolve({data:true});
      if(name==='moderation_logs'||name==='list_app_admins')return Promise.resolve({data:[]});
      if(name==='my_custom_emojis')return Promise.resolve({data:media.filter(m=>m.kind==='emoji'&&!m.archived)});
      if(name==='remove_custom_emoji'){media.find(m=>m.id===args.emoji_id).archived=true;return Promise.resolve({data:null});}

      if(name==='poll_calls')return Promise.resolve({data:null,error:null});
      if(name==='add_group_member'){const room=rooms.find(r=>r.id===args.target_room),p=profiles.find(p=>p.username===args.other_username);if(!room||!p)return Promise.resolve({error:{message:'User unavailable'},data:null});if(!room.room_members.some(m=>m.user_id===p.id))room.room_members.push(member(p.id));return Promise.resolve({data:null,error:null});}
      if(name==='create_golf_game'){const g={id:'99999999-9999-4999-8999-999999999999',hole_count:args.holes||3,room_id:args.target_room,player1:alice,player2:null,state:null,revision:0};golfGames.push(g);messages.push({id:crypto.randomUUID(),room_id:g.room_id,sender_id:alice,body:'[[sahur-golf:v1]]'+g.id,created_at:new Date().toISOString()});return Promise.resolve({data:g,error:null});}
      if(name==='submit_golf_shot'){const g=golfGames.find(g=>g.id===args.game_id);g.state=args.end_state;g.shot=args.shot_data;g.revision++;return Promise.resolve({data:g,error:null});}

      if(name==='owner_sudo'){const m={id:args.request_id,room_id:args.target_room,sender_id:profiles.find(p=>p.username===args.target_username)?.id,body:args.message_text,created_at:new Date().toISOString()};messages.push(m);return Promise.resolve({data:m,error:null});}
      if(name==='touch_presence')return Promise.resolve({data:null,error:null});
      if(name==='presence_status')return Promise.resolve({data:args.player_ids.map(id=>({player_id:id,online:id===alice})),error:null});
      if(name==='active_chat_games')return Promise.resolve({data:[...games.filter(g=>g.room_id===args.target_room&&!g.state?.winner).map(g=>({game_id:g.id,mode:'pool',label:'8-ball',turn_id:g.state?.turn})),...chessGames.filter(g=>g.room_id===args.target_room&&['active','pending'].includes(g.status)).map(g=>({game_id:g.id,mode:'chess',label:'Chess',turn_id:g.state?.players[g.state?.turn]}))],error:null});
      if(name==='game_win_totals')return Promise.resolve({data:args.player_ids.flatMap(id=>[{player_id:id,mode:'pool',wins:id===alice?3:6},{player_id:id,mode:'chess',wins:id===alice?2:1},{player_id:id,mode:'golf',wins:id===alice?1:2}]),error:null});
      if(name==='game_leaderboard'){const data=args.game_mode==='pool'?[{player_id:bob,username:'alex',wins:6,place:1},{player_id:alice,username:'judah',wins:3,place:2}]:[{player_id:alice,username:'judah',wins:2,place:1},{player_id:bob,username:'alex',wins:1,place:2}];return Promise.resolve({data,error:null});}

      if(name==='create_chess_game'){const g={id:'88888888-8888-4888-8888-888888888888',room_id:args.target_room,player1:alice,player2:null,seconds:args.time_control,declined:[],status:'pending',state:null,revision:0};chessGames.push(g);messages.push({id:crypto.randomUUID(),room_id:g.room_id,sender_id:alice,body:'[[tungchat-chess:v1]]'+g.id+':'+g.seconds,created_at:new Date().toISOString()});return Promise.resolve({data:{...g,serverNow:Date.now()},error:null});}
      if(name==='read_chess_game')return Promise.resolve({data:{...chessGames.find(g=>g.id===args.game_id),serverNow:Date.now()},error:null});
      if(name==='chess_action'){const g=chessGames.find(g=>g.id===args.game_id);if(args.action==='move')g.state=args.end_state;if(args.action==='cancel')g.status='cancelled';if(args.action==='resign'){g.state.result={winner:'b',reason:'resignation'};g.status='finished';}g.revision++;return Promise.resolve({data:{...g,serverNow:Date.now()},error:null});}

      if(name==='create_pool_game'){const g={id:'77777777-7777-4777-8777-777777777777',room_id:args.target_room,player1:alice,player2:null,state:null,revision:0};games.push(g);messages.push({id:crypto.randomUUID(),room_id:g.room_id,sender_id:alice,body:'[[tungchat-pool:v1]]'+g.id,created_at:new Date().toISOString()});return Promise.resolve({data:g,error:null});}
      if(name==='submit_pool_shot'){const g=games.find(g=>g.id===args.game_id);Object.assign(g,{state:args.end_state,shot:args.shot_data,revision:g.revision+1});return Promise.resolve({data:g,error:null});}

      let data;
      if(name==='social_action') {
        const target=profiles.find(p=>p.username===args.other_username);if(!target)return {then:resolve=>Promise.resolve({data:null,error:{message:'That username has not signed up yet'}}).then(resolve)};
        let rel=friendships.find(r=>r.sender_id===target.id||r.recipient_id===target.id);
        if(args.action==='request') { if(rel){rel.sender_id=alice;rel.recipient_id=target.id;rel.status='pending';}else friendships.push({sender_id:alice,recipient_id:target.id,status:'pending'}); }
        if(args.action==='accept')rel.status='accepted';
        if(['remove','decline','cancel'].includes(args.action))rel.status='removed';
        if(args.action==='block'){let block=blocks.find(b=>b.blocked_id===target.id);if(block)block.active=true;else blocks.push({blocked_id:target.id,active:true});if(rel)rel.status='removed';}
        if(args.action==='unblock')blocks.find(b=>b.blocked_id===target.id).active=false;
        data=null;
      } else if(name==='delete_message') { data=messages.find(m=>m.id===args.target_message); data.body=''; data.deleted_at=new Date().toISOString(); }
      else if(name==='toggle_reaction') {
        data=reactions.find(r=>r.message_id===args.target_message&&r.user_id===alice&&r.emoji===args.reaction);
        if(data) {data.active=!data.active;data.updated_at=new Date().toISOString();}
        else {data={message_id:args.target_message,user_id:alice,emoji:args.reaction,active:true,updated_at:new Date().toISOString()};reactions.push(data);}
      } else if(name==='leave_group'){const i=rooms.findIndex(r=>r.id===args.target_room);if(i>=0)rooms.splice(i,1);data=null;}
      else if(name==='moderation_delete_account'){const i=moderationRows.findIndex(row=>row.account_id===args.target_user);if(i>=0)moderationRows.splice(i,1);data=null;}
      else if(name==='is_app_owner')data=true;
      else if(name==='moderation_overview')data=moderationRows;
      else data=name==='start_dm'?'alex':'crew';
      const result={data,error:null};
      return {single:()=>Promise.resolve(result),then:resolve=>Promise.resolve(result).then(resolve)};
    }
  };
}
module.exports = { createClient };
