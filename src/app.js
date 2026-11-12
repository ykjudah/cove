import {mountImposter} from './imposter.js';
import { CHAT_PAGE_SIZE, CHAT_CATCHUP_SIZE, compareMessageCursor, newestMessage, olderMessage, createConversationCache, createSerialRefresh, hasOlderMessages, needsGameCardReconcile, fetchMissedMessages } from './chat-window.mjs';
import {bridgeImposterRpc} from './imposter-bridge.mjs';
import {fourThumbnail, fourBoard} from './four-in-a-row.js';
const Sounds = require('./sounds.cjs');
import Calls from './calls.cjs';
import Golf from './mini-golf.cjs';
import {PREFIX as MEDIA_PREFIX,mediaId,prepareMedia} from './media.js';
import Pool from './eight-ball.cjs';
import ChessGame from './chess-game.cjs';
import emojiOnly from './emoji-only.cjs';
import { createClient } from '@supabase/supabase-js';
import validation from './validation.cjs';
import preferences from './preferences.cjs';
import { validAvatar, prepareAvatar } from './avatar.js';
import shortcuts from './emoji-shortcuts.cjs';
const { expandShortcodes, expandDraft } = shortcuts;
const { accent, accentInk, hideNames } = preferences;
const MESSAGE_FIELDS = 'id,room_id,sender_id,body,created_at,reply_to,deleted_at,system_event';
import EMOJI_CATEGORIES from './emoji.cjs';
const EMOJI = Object.values(EMOJI_CATEGORIES).flat().map(([emoji]) => emoji);
const QUICK_EMOJI = ['👍', '❤️', '😂'];
const ACTION_ICONS = {
  reply: 'M9 10H5l5-5M5 10l5 5M5 10h8a6 6 0 0 1 6 6v3',
  emoji: 'M20 12a8 8 0 1 1-8-8M8 14s1 3 4 3 4-3 4-3M8 9h.01M14 9h.01M19 2v6M16 5h6',
  trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7'
};
function actionButton(icon, label, className) {
  const button = node('button', className);
  button.type = 'button'; button.title = label; button.setAttribute('aria-label', label);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', ACTION_ICONS[icon]); svg.append(path); button.append(svg);
  return button;
}
const { username, emailFor, backend } = validation;
// Preserve old chat history without loading any external GIF content.
function legacyGif(body) { return typeof body === 'string' && body.startsWith('[[pocketchat-klipy-gif:v1]]'); }
localStorage.removeItem('pocketchat-klipy-key');
localStorage.removeItem('pocketchat-klipy-customer-id');
const $ = id => document.getElementById(id);
let callView,isAppAdmin=false;
let client, me, profile, rooms = [], selected = null, messages = new Map();
let signup = false, channel, poll, epoch = 0, view = 0, loading = false, oldest = null;
let hasOlder = false, noticeTimer, refreshTimer, refreshVersion = 0;
const conversationCache = createConversationCache(5);
let chatOlderTimer = null, chatReconnectTimer = null, lastSocialSafetyRefresh = 0;
let lastRoomSafetyRefresh = 0, inboxLive = false;
function saveConversationWindow() {
  if (!selected || !messages.size) return;
  // Bound memory per inactive chat as well as the number of cached rooms.
  // Older history remains available through pagination.
  const recent = [...messages.values()].sort(compareMessageCursor).slice(-200);
  const keptIds = new Set(recent.map(m => m.id));
  const referenced = new Set(recent.map(m => m.reply_to).filter(Boolean));
  if (replyDrafts.get(selected)) referenced.add(replyDrafts.get(selected));
  const trimmed = recent.length < messages.size;
  conversationCache.set(selected, {
    messages: new Map(recent.map(m => [m.id, m])),
    parents: new Map([...parents].filter(([id]) => keptIds.has(id) || referenced.has(id))),
    reactions: new Map([...reactions].filter(([,reaction]) => keptIds.has(reaction.message_id))),
    oldest: trimmed ? recent[0] : oldest,
    hasOlder: hasOlder || trimmed, savedAt: Date.now()
  });
}
function loadCachedConversation(roomId) {
  const cached = conversationCache.get(roomId);
  if (!cached) return false;
  for (const [id, value] of cached.messages) messages.set(id, value);
  for (const [id, value] of cached.parents) parents.set(id, value);
  for (const [id, value] of cached.reactions) reactions.set(id, value);
  oldest = cached.oldest; hasOlder = cached.hasOlder;
  return cached;
}
function queueChatReconcile() {
  clearTimeout(chatReconnectTimer);
  chatReconnectTimer = setTimeout(() => {
    if (!me || !selected) return;
    if (loading) { queueChatReconcile(); return; }
    loadHistory(false, false).catch(e => notify('Could not sync missed messages: ' + e.message));
  }, 350);
}
const drafts = new Map(), pending = new Map(), unread = new Set();
const parents = new Map(), reactions = new Map(), replyDrafts = new Map(), reactionBusy = new Set();
let reactionPicker = null;
const deletingMessages = new Set();
let privacy = localStorage.getItem('pocketchat-privacy') || 'off';
if(privacy==='current')privacy='all';
if (!['off', 'all'].includes(privacy)) privacy = 'off';
let inAppNotifications = localStorage.getItem('pocketchat-in-app-notifications') !== 'off';
let typingChannel = null, typingJoinedRoom = null, typingReady = false, typingActive = false, lastTypingSent = 0, typingStopTimer;
const typingUsers = new Map(), typingExpiryTimers = new Map(), inAppNotificationTimers = new Set();
let color = accent(localStorage.getItem('pocketchat-accent'));
let desktopUpdate = null;
const people = new Map(), profileRefreshAt = new Map();
let friendships = [], blocks = new Set(), socialTab = 'friends', personId = null, socialVersion = 0;
let socialBusy = false, avatarBusy = false, profileBusy = false, moderationBusy = false;
let isAppOwner = false, roomSettingsId = null, groupAvatarFile = null;
function personData(id) { return people.get(id) || (id === me?.id ? profile : null); }
function personLabel(id) {
  if (id === me?.id) return 'You';
  if (privacy === 'all') return 'Person ' + (id||'unknown').slice(0,8);
  return personData(id)?.display_name || personData(id)?.username || 'Unknown user';
}
function paintAvatar(el, id, hidden = false) {
  const data = personData(id);el.dataset.presenceId=id||''; el.replaceChildren(); el.classList.remove('has-picture');
  if (!hidden && validAvatar(data?.avatar_data)) {
    const image = node('img'); image.src = data.avatar_data; image.alt = ''; image.draggable = false;
    image.onerror = () => { el.classList.remove('has-picture'); el.textContent = hidden ? '•' : (data?.username?.[0] || '?').toUpperCase(); };
    el.append(image); el.classList.add('has-picture');
  } else el.textContent = hidden ? '•' : (!id ? 'D' : id === me?.id ? 'Y' : (data?.username?.[0] || '?').toUpperCase());
 paintPresenceElement(el);
}
function avatarNode(id, hidden = false, clickable = false) {
  const canOpen=clickable&&!!id;
  const el = node(canOpen ? 'button' : 'span', 'avatar'); paintAvatar(el,id,hidden);
  if (canOpen) { el.type = 'button'; el.setAttribute('aria-label',id===me?.id?'Edit your profile':'Open profile'); el.onclick = () => openPerson(id); }
  return el;
}
function relationship(id) { return friendships.find(r => r.sender_id === id || r.recipient_id === id); }
function refreshPeopleViews() {
  // Room member labels should reference the latest cached profile objects.
  for (const room of rooms) for (const member of room.room_members) {
    const current = people.get(member.user_id);
    if (current) member.profiles = current;
  }
  renderHeader(); renderRooms(); renderMessages(); renderSocial(); renderPerson(); renderOwnProfile();
}
async function refreshSocialOnce() {
  if (!me) return;
  const currentEpoch = epoch, version = ++socialVersion;
  const [rels, banned] = await Promise.all([
    client.from('friendships').select('sender_id,recipient_id,status,updated_at'),
    client.from('user_blocks').select('blocked_id,active')
  ]);
  const nextFriends = checked(rels), nextBlocks = checked(banned);
  const ids = [...new Set([me.id, ...nextFriends.flatMap(r=>[r.sender_id,r.recipient_id]), ...nextBlocks.map(r=>r.blocked_id), ...rooms.flatMap(r=>r.room_members.map(m=>m.user_id))])];
  // Avatar data can be sizable. Do not re-download every known profile on each
  // friend-list safety refresh; live profile events keep the cache fresh.
  const now = Date.now(), stale = ids.filter(id => !people.has(id) || now - (profileRefreshAt.get(id) || 0) > 600000);
  const profiles = stale.length ? checked(await client.from('profiles')
    .select('id,username,avatar_data,about_me,display_name').in('id',stale)) : [];
  if (currentEpoch !== epoch || version !== socialVersion) return;
  friendships = nextFriends; blocks = new Set(nextBlocks.filter(b=>b.active).map(b=>b.blocked_id)); lastSocialSafetyRefresh=Date.now();
  for (const p of profiles) { people.set(p.id,p);profileRefreshAt.set(p.id,Date.now()); }
  profile = people.get(me.id) || profile;
  refreshPeopleViews();
}
const refreshSocial = createSerialRefresh(refreshSocialOnce);
async function socialAction(action,id) {
  if (socialBusy || !me) return;
  const target = personData(id);
  if (!target) return;
  socialBusy = true; renderPerson(); renderSocial();
  const currentEpoch = epoch;
  try {
    checked(await client.rpc('social_action',{action,other_username:target.username}));
    if (currentEpoch !== epoch) return;
    await refreshSocial();
    if (action === 'block') notify('User blocked. DMs are stopped and their messages are hidden on your screen.');
    if (action === 'unblock') notify('User unblocked. Send a new request if you want to be friends again.');
  } catch(e) { if (currentEpoch === epoch) notify(e.message); }
  finally { if (currentEpoch === epoch) { socialBusy = false; renderPerson(); renderSocial(); } }
}
function socialButton(label,action,id,className='') {
  const b = node('button',className,label); b.type='button'; b.disabled=socialBusy;
  b.onclick=()=>socialAction(action,id); return b;
}
async function messagePerson(id) {
  const currentEpoch=epoch;
  try {
    const room=checked(await client.rpc('start_dm',{other_username:personData(id)?.username}));
    if(currentEpoch!==epoch)return;
    await unhideDirectMessage(room);
    await refreshRooms();
    if(currentEpoch!==epoch)return;
    $('friends-dialog').close(); $('person-dialog').close(); await selectRoom(room);
  } catch(e) { if(currentEpoch===epoch)notify(e.message); }
}
async function unhideDirectMessage(roomId) {
  const result=await client.from('hidden_rooms').delete().eq('room_id',roomId);
  if(result.error)throw result.error;
}
let discoveryIds=[],discoveryLoading=false,discoveryError='';
async function loadDiscovery(){if(!me)return;const session=epoch;discoveryLoading=true;discoveryError='';renderSocial();try{const all=[];for(let start=0;;start+=200){const page=checked(await client.from('profiles').select('id,username,avatar_data,about_me,display_name').order('username').range(start,start+199));if(session!==epoch)return;all.push(...page);if(page.length<200)break;}discoveryIds=all.filter(p=>p.id!==me.id).map(p=>p.id);for(const p of all)people.set(p.id,p);}catch(e){if(session===epoch)discoveryError=e.message;}finally{if(session===epoch){discoveryLoading=false;renderSocial();}}}
$('discover-search').oninput=()=>renderSocial();
function renderSocial() {
  if (!me) return;
  const incoming=friendships.filter(r=>r.status==='pending' && r.recipient_id===me.id && !blocks.has(r.sender_id));
  const friends=friendships.filter(r=>r.status==='accepted' && !blocks.has(r.sender_id===me.id?r.recipient_id:r.sender_id));
  $('friend-count').textContent=incoming.length ? incoming.length+' pending' : friends.length+' friends';
  for(const b of document.querySelectorAll('[data-social-tab]')) {
    b.setAttribute('aria-pressed',String(b.dataset.socialTab===socialTab));
    b.textContent=b.dataset.socialTab==='requests' ? 'Requests'+(incoming.length?' · '+incoming.length:'') : b.dataset.socialTab==='friends'?'Friends':b.dataset.socialTab==='discover'?'Discover':'Blocked';
  }
  const list=$('social-list');list.replaceChildren();
  $('discover-search').hidden=socialTab!=='discover';
  const rows=socialTab==='discover'?discoveryIds.filter(id=>!blocks.has(id)&&personLabel(id).toLowerCase().includes($('discover-search').value.trim().toLowerCase())).map(id=>({id,...relationship(id)})):socialTab==='blocked'?[...blocks].map(id=>({id,status:'blocked'})):friendships.filter(r=>r.status===(socialTab==='friends'?'accepted':'pending')).map(r=>({...r,id:r.sender_id===me.id?r.recipient_id:r.sender_id})).filter(r=>!blocks.has(r.id));
  rows.sort((a,b)=>personLabel(a.id).localeCompare(personLabel(b.id)));
  for(const row of rows) {
    const item=node('div','person-row');item.dataset.personId=row.id;
    item.append(avatarNode(row.id,privacy==='all',true));
    const info=node('div','person-info'),name=node('button','profile-name',personLabel(row.id));name.type='button';name.onclick=()=>openPerson(row.id);
    info.append(name,node('small','',row.status==='blocked'?'Blocked':row.status==='accepted'?'Friend':!row.status?'Registered user':row.sender_id===me.id?'Outgoing request':'Incoming request'));
    const actions=node('div','row-actions');
    if(!row.status)actions.append(socialButton('Add friend','request',row.id,'primary'));
    else if(row.status==='blocked')actions.append(socialButton('Unblock','unblock',row.id));
    else if(row.status==='accepted') { const chat=node('button','','Message');chat.type='button';chat.onclick=()=>messagePerson(row.id);actions.append(chat); }
    else if(row.sender_id===me.id)actions.append(socialButton('Cancel','cancel',row.id));
    else actions.append(socialButton('Accept','accept',row.id,'primary'),socialButton('Decline','decline',row.id));
    item.append(info,actions);list.append(item);
  }
  if(!rows.length)list.append(node('p','empty',socialTab==='discover'?(discoveryLoading?'Loading people…':discoveryError?'Could not load people: '+discoveryError:'No matching people.'):socialTab==='blocked'?'No blocked users.':socialTab==='requests'?'No pending requests.':'Your friends will appear here. Send a request above.'));
  $('social-help').textContent=socialTab==='blocked'?'Unblocking does not restore a friendship. Shared groups can still see your messages.':'Click a person to view their profile, remove a friend, or block them.';
}
function openPerson(id) {
  if(!personData(id))return;
  if(id===me?.id){$('settings-open').click();return;}
  personId=id;renderPerson();if(!$('person-dialog').open)$('person-dialog').showModal();
}
function renderPerson() {
  if(!me || !personId)return;
  const hidden=privacy==='all' || (hideNames(privacy,selected,selected) && rooms.find(r=>r.id===selected)?.room_members.some(m=>m.user_id===personId));
  paintAvatar($('person-avatar'),personId,hidden);renderGameWins($('person-game-wins'),personId,hidden);
  $('person-name').textContent=hidden?'Profile':personLabel(personId);
  $('person-about').textContent=hidden?'':(personData(personId)?.about_me || '');
  $('person-about').hidden=hidden || !personData(personId)?.about_me;
  const actions=$('person-actions');actions.replaceChildren();
  const rel=relationship(personId),blocked=blocks.has(personId);
  $('person-presence').dataset.presenceId=personId;paintPresenceElement($('person-presence'));
  $('person-status').textContent=blocked?'Blocked':rel?.status==='accepted'?'Friends':rel?.status==='pending'?(rel.sender_id===me.id?'Friend request sent':'Wants to be your friend'):'Not on your friends list';
  if(personId===me.id)return;
  if(blocked){actions.append(socialButton('Unblock','unblock',personId));return;}
  const chat=node('button','primary','Message');chat.type='button';chat.onclick=()=>messagePerson(personId);actions.append(chat);
  if(rel?.status==='accepted')actions.append(socialButton('Remove friend','remove',personId));
  else if(rel?.status==='pending') {
    if(rel.sender_id===me.id)actions.append(socialButton('Cancel request','cancel',personId));
    else actions.append(socialButton('Accept request','accept',personId),socialButton('Decline','decline',personId));
  } else actions.append(socialButton('Add friend','request',personId));
  actions.append(socialButton('Block user','block',personId,'danger'));
}
function renderOwnProfile() {
  if(!me)return;
  paintAvatar($('profile-avatar'),me.id,privacy==='all');
  paintAvatar($('my-avatar'),me.id,privacy==='all');
  $('profile-username').textContent=privacy==='all'?'You':profile?.username || '';renderGameWins($('my-game-wins'),me.id,false);
  if(document.activeElement!==$('display-name'))$('display-name').value=privacy==='off'?(profile?.display_name||''):'';
  if(document.activeElement!==$('account-username'))$('account-username').value=privacy==='off'?(profile?.username||''):'';
  if(document.activeElement!==$('about-me'))$('about-me').value=privacy==='off'?(profile?.about_me || ''):'';
  $('avatar-file').disabled=avatarBusy; $('avatar-remove').disabled=avatarBusy || !profile?.avatar_data;
  $('about-me').disabled=profileBusy||privacy!=='off';$('about-save').disabled=profileBusy||privacy!=='off';
}
async function saveAvatar(file) {
  if(avatarBusy || !me)return;
  const currentEpoch=epoch, userId=me.id;avatarBusy=true;renderOwnProfile();$('avatar-status').textContent='Saving picture…';
  try {
    const data=file?await prepareAvatar(file):null;
    if(currentEpoch!==epoch)return;
    const saved=checked(await client.from('profiles').update({avatar_data:data}).eq('id',userId).select('id,username,avatar_data,about_me,display_name').single());
    if(currentEpoch!==epoch)return;
    profile=saved;people.set(userId,saved);refreshPeopleViews();$('avatar-status').textContent=file?'Profile picture saved to your account. It stays after updates and sign-in.':'Profile picture removed.';
  } catch(e) { if(currentEpoch===epoch){$('avatar-status').textContent='Picture was not saved.';notify(e.message);} }
  finally { if(currentEpoch===epoch){avatarBusy=false;$('avatar-file').value='';renderOwnProfile();} }
}
async function saveAboutMe() {
  if(profileBusy || !me)return;
  const currentEpoch=epoch,userId=me.id,value=$('about-me').value.trim();
  profileBusy=true;renderOwnProfile();$('about-status').textContent='Saving…';
  try {
    const saved=checked(await client.from('profiles').update({about_me:value,display_name:$('display-name').value.trim()}).eq('id',userId).select('id,username,avatar_data,about_me,display_name').single());
    if(currentEpoch!==epoch)return;
    profile=saved;people.set(userId,saved);refreshPeopleViews();$('about-status').textContent='Profile saved.';
  } catch(e) { if(currentEpoch===epoch){$('about-status').textContent='Profile was not saved.';notify(e.message);} }
  finally { if(currentEpoch===epoch){profileBusy=false;renderOwnProfile();} }
}

function groupAvatarNode(room, hidden=false, extraClass='') {
  const el=node('span','group-avatar '+extraClass);
  if(hidden){el.textContent='#';return el;}
  if(validAvatar(room.avatar_data)) {
    const image=node('img','group-avatar-picture');image.src=room.avatar_data;image.alt='';image.draggable=false;el.append(image);return el;
  }
  const members=room.room_members||[];
  const columns=Math.ceil(Math.sqrt(Math.max(1,members.length))),rows=Math.max(1,Math.ceil(members.length/columns));
  el.style.setProperty('--group-columns',String(columns));el.style.setProperty('--group-rows',String(rows));
  for(const member of members){const avatar=avatarNode(member.user_id,false);avatar.classList.add('group-avatar-member');el.append(avatar);}
  if(!members.length)el.textContent='#';
  return el;
}

function displayRoomLabel(room) {
  if (!hideNames(privacy, room.id, selected)) return roomLabel(room);
  const index = [...rooms].sort((a,b) => a.id.localeCompare(b.id)).findIndex(r => r.id === room.id) + 1;
  return (room.kind === 'group' ? 'Group ' : 'Conversation ') + index;
}
function displayPerson(id, roomId = selected) {
  if (!id) return 'Deleted account';
  if (id === me?.id) return 'You';
  const members = rooms.find(r => r.id === roomId)?.room_members || [];
  if (hideNames(privacy, roomId, selected)) return personLabel(id);
  return personData(id)?.display_name || personData(id)?.username || members.find(m => m.user_id === id)?.profiles?.display_name || members.find(m => m.user_id === id)?.profiles?.username || 'Former member';
}
function renderHeader() {
  const room = rooms.find(r => r.id === selected);
  if (room) {
    $('room-title').textContent = displayRoomLabel(room);
    if(room.kind==='dm'){$('conversation-avatar').className='avatar header-avatar';paintAvatar($('conversation-avatar'),room.room_members.find(m=>m.user_id!==me.id)?.user_id,hideNames(privacy,room.id,selected));}
    else {
      const icon=groupAvatarNode(room,hideNames(privacy,room.id,selected),'avatar header-avatar header-group-avatar');
      const target=$('conversation-avatar');target.className=icon.className;target.replaceChildren(...icon.childNodes);
    }
    $('room-subtitle').textContent = room.kind === 'dm' ? 'Just the two of you.' : room.room_members.map(m => displayPerson(m.user_id)).join(', ');
  } else {$('room-title').textContent='Make yourself at home.';$('room-subtitle').textContent='Choose a conversation or start a new one.';$('conversation-avatar').className='avatar header-avatar';$('conversation-avatar').replaceChildren();$('conversation-avatar').textContent='#';}
  $('my-name').textContent = privacy === 'all' ? 'You' : profile?.display_name || profile?.username || '';

  for(const id of ['video-call','voice-call']){$(id).hidden=!room;$(id).disabled=!room||(room.kind==='dm'&&blocks.has(room.room_members.find(m=>m.user_id!==me?.id)?.user_id));}
  callView?.refresh();
  const other=room?.room_members.find(m=>m.user_id!==me?.id)?.user_id;
  $('send').disabled=room?.kind==='dm' && blocks.has(other);
  $('message').disabled=room?.kind==='dm' && blocks.has(other);
  $('message').placeholder=$('message').disabled?'Unblock this person to send messages.':'Write a message…';
  const hiding = !!selected && hideNames(privacy, selected, selected);

  
}
function reactionKey(r) { return r.message_id + ':' + r.user_id + ':' + r.emoji; }
function mergeReaction(r) {
  const key = reactionKey(r), existing = reactions.get(key);
  if (!existing || existing.updated_at <= r.updated_at) reactions.set(key, r);
}
function mergeMessage(m) {
  if (m.room_id !== selected) return;
  const existing = messages.get(m.id) || parents.get(m.id);
  if (existing?.deleted_at && !m.deleted_at) return;
  messages.set(m.id, m); parents.set(m.id, m);
}
function renderReplyDraft() {
  const id = replyDrafts.get(selected), parent = messages.get(id) || parents.get(id);
  if (!parent || parent.deleted_at || blocks.has(parent.sender_id)) { replyDrafts.delete(selected); $('reply-draft').hidden = true; return; }
  $('reply-draft').hidden = false;
  $('reply-draft-name').textContent = 'Replying to ' + displayPerson(parent.sender_id);
  $('reply-draft-body').textContent = parent.body;
}
async function loadRelated(rows, currentView, sessionEpoch) {
  if (!rows.length) return;
  const parentIds = [...new Set(rows.map(m => m.reply_to).filter(Boolean))];
  const jobs = [client.from('message_reactions').select('message_id,user_id,emoji,active,updated_at').in('message_id', rows.map(m => m.id))];
  if (parentIds.length) jobs.push(client.from('messages').select(MESSAGE_FIELDS).in('id', parentIds));
  const data = await Promise.all(jobs);
  if (view !== currentView || epoch !== sessionEpoch) return;
  for (const r of checked(data[0])) mergeReaction(r);
  for (const parent of data[1] ? checked(data[1]) : []) {
    if (!parents.get(parent.id)?.deleted_at || parent.deleted_at) parents.set(parent.id, parent);
  }
}
async function reactTo(message, emoji) {
  const key = message.id + emoji, sessionEpoch = epoch;
  if (reactionBusy.has(key)) return;
  reactionBusy.add(key);
  try {
    const result = checked(await client.rpc('toggle_reaction', { target_message: message.id, reaction: emoji }).single());
    if (sessionEpoch !== epoch) return;
    mergeReaction(result); reactionPicker = null; renderMessages();
  } catch(e) { if (sessionEpoch === epoch) notify(e.message); }
  finally { reactionBusy.delete(key); }
}


function notify(message) {
  $('notice').textContent = message;
  $('notice').hidden = false;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { $('notice').hidden = true; }, 12000);
}
function messagePreview(body) {
  if(golfId(body))return 'Mini golf · Open game';
  if(typeof body==='string'&&body.startsWith('[[sahur-gif:v1]]'))return 'GIF no longer available';
  if(mediaId(body))return 'Image / custom emoji';
  if(chessId(body))return 'Chess · '+ChessGame.timeLabel(chessId(body).seconds);
  if(poolId(body)) return '8-ball pool · Open game';
  if (legacyGif(body)) return 'GIF shared before GIF support was removed';
  return String(body || '').replace(/\[\[emoji:[0-9a-f-]{36}\]\]/g,'[emoji]').replace(/\s+/g, ' ').slice(0, 120);
}
function dismissInAppNotification(card) {
  const timer = card?.__dismissTimer;
  if (timer) { clearTimeout(timer); inAppNotificationTimers.delete(timer); }
  card?.remove();
}
function showMessageNotification(message) {
  if (!inAppNotifications || !me || !message || message.sender_id === me.id || (message.room_id === selected && document.hasFocus()) || blocks.has(message.sender_id)) return;
  const room = rooms.find(item => item.id === message.room_id);
  if (!room) return;
  const list = $('in-app-notifications');
  const card = node('article', 'in-app-notification');
  const open = node('button', 'in-app-notification-open'); open.type = 'button';
  open.append(node('strong', '', `${displayPerson(message.sender_id, room.id)} · ${displayRoomLabel(room)}`));
  open.append(node('span', '', messagePreview(message.body) || 'New message'));
  open.onclick = () => { dismissInAppNotification(card); selectRoom(room.id).catch(e => notify(e.message)); };
  const close = node('button', 'in-app-notification-close', '×'); close.type = 'button'; close.setAttribute('aria-label', 'Dismiss notification'); close.onclick = () => dismissInAppNotification(card);
  card.append(open, close); list.append(card);
  while (list.children.length > 4) dismissInAppNotification(list.firstElementChild);
  card.__dismissTimer = setTimeout(() => dismissInAppNotification(card), 8000);
  inAppNotificationTimers.add(card.__dismissTimer);
}
function clearInAppNotifications() {
  for (const timer of inAppNotificationTimers) clearTimeout(timer);
  inAppNotificationTimers.clear(); $('in-app-notifications').replaceChildren();
}

function screen(name) { for (const id of ['setup', 'auth', 'chat']) $(id).hidden = id !== name; }
function checked(result) { if (result.error) throw result.error; return result.data; }
function node(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}
function roomLabel(room) {
  if (room.kind === 'group') return room.name;
  const other=room.room_members.find(x => x.user_id !== me.id)?.profiles;return other?.display_name || other?.username || 'Direct message';
}
function renderRooms() {
  const query = $('search').value.trim().toLowerCase();
  $('rooms').replaceChildren();
  for (const room of [...rooms].sort((a,b)=>Date.parse(b.last_activity_at||b.created_at)-Date.parse(a.last_activity_at||a.created_at)).filter(r => displayRoomLabel(r).toLowerCase().includes(query))) {
    const label = displayRoomLabel(room), row=node('div','room-row'+(room.id===selected?' active':'')), button = node('button', 'room' + (room.id === selected ? ' active' : ''));
    row.dataset.roomId=room.id;
    button.type='button';button.setAttribute('aria-pressed', String(room.id === selected));
    button.append(room.kind==='group'?groupAvatarNode(room,hideNames(privacy,room.id,selected)):avatarNode(room.room_members.find(m=>m.user_id!==me.id)?.user_id,hideNames(privacy,room.id,selected)));
    const text = node('span', 'room-text');
    text.append(node('strong', '', label), node('small', '', unread.has(room.id) ? 'New messages' : room.kind === 'group' ? `${room.room_members.length} people` : 'Direct message'));
    button.append(text);
    button.onclick = () => selectRoom(room.id).catch(e => notify(e.message));
    const dm=room.kind==='dm',options=node('button','room-options'+(dm?' dm-close-button':''),dm?'×':'···');options.type='button';options.setAttribute('aria-label',dm?'Close direct message':'Conversation options');options.title=dm?'Close direct message':'Conversation options';options.onclick=event=>{event.stopPropagation();if(dm){options.disabled=true;closeDirectMessage(room.id).catch(e=>{notify(e.message);options.disabled=false;});}else openRoomSettings(room);};
    row.append(button,options);const call=joinableCalls.get(room.id);if(call){const join=node('button','join-live-call','Live · '+call.joined+' · Join');join.onclick=()=>callView?.start(room.id,call.video);row.append(join);}$('rooms').append(row);
  }
  if (!$('rooms').children.length) $('rooms').append(node('p', 'empty', query ? 'No matching conversations.' : 'Your conversations will appear here. Start one with the + button.'));
}
async function refreshRoomsOnce() {
  const sessionEpoch = epoch, version = ++refreshVersion;
  const [raw,hiddenResult] = await Promise.all([
    client.from('rooms').select('id,name,kind,avatar_data,created_at,last_activity_at,room_members(user_id)').order('created_at', { ascending: false }),
    client.from('hidden_rooms').select('room_id')
  ]);
  const data=checked(raw),hidden=new Set(checked(hiddenResult).map(row=>row.room_id));
  if (sessionEpoch !== epoch || version !== refreshVersion || !me) return;
  const visible = data.filter(room => !hidden.has(room.id));
  // Reuse profile avatars instead of transmitting them with every room refresh.
  const unseen = [...new Set(visible.flatMap(room=>room.room_members.map(member=>member.user_id)))]
    .filter(id=>!people.has(id));
  const fresh = unseen.length ? checked(await client.from('profiles')
    .select('id,username,avatar_data,about_me,display_name').in('id',unseen)) : [];
  if (sessionEpoch !== epoch || version !== refreshVersion || !me) return;
  for (const p of fresh) {people.set(p.id,p);profileRefreshAt.set(p.id,Date.now());}
  rooms = visible.map(room=>({...room,room_members:room.room_members.map(member=>({
    ...member,profiles:people.get(member.user_id)||null
  }))}));
  lastRoomSafetyRefresh=Date.now();
  if(selected&&!rooms.some(room=>room.id===selected)){const missing=selected;showWelcome();conversationCache.delete(missing);return;}
  renderRooms(); renderHeader();
}
const refreshRooms = createSerialRefresh(refreshRoomsOnce);
function senderName(id) {
  return rooms.find(r => r.id === selected)?.room_members.find(m => m.user_id === id)?.profiles?.username || 'Former member';
}
function renderMessages(forceBottom = false, preserveScroll = false) {
  if (!me) return;
  if(forceBottom)reactionPicker=null;
  const history = $('history');
  const previousScroll = history.scrollTop;
  const previousSearch = document.querySelector('.picker-open .emoji-search');
  const searchState = previousSearch && previousSearch.closest('.message').dataset.messageId === reactionPicker
    ? { value: previousSearch.value, focused: document.activeElement === previousSearch } : null;
  const nearBottom = history.scrollHeight - history.scrollTop - history.clientHeight < 100;
  const fragment = document.createDocumentFragment();
  for (const m of [...messages.values()].sort((a,b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))) {
    const name = displayPerson(m.sender_id), item = node('article', 'message' + (m.sender_id === me.id ? ' mine' : ''));
    item.dataset.messageId = m.id;
    if(m.system_event?.kind==='poll')continue;
    if(!m.deleted_at && ['four','four_draw'].includes(m.system_event?.kind)){
      item.append(fourBoard(m,me.id,fourMove));
      fragment.append(item);continue;
    }
    if(m.system_event?.kind==='game_result'){const result=m.system_event;if(!result.players?.includes(me.id))continue;item.classList.add('system-message','game-result');item.append(node('strong','',result.winner===me.id?'You won':'You lost'),node('span','',({pool:'8-ball pool',chess:'Chess',golf:'Mini golf',four:'Four in a Row'})[result.mode]||'Game'));fragment.append(item);continue;}
    if(m.system_event){item.classList.add('system-message');item.append(node('span','',displayPerson(m.sender_id)+' '+(m.system_event.kind==='group_name'?'changed the group name to '+(hideNames(privacy,selected,selected)?'a new name':m.system_event.name):m.system_event.removed?'removed the group picture':'changed the group picture')));fragment.append(item);continue;}
    item.append(avatarNode(m.sender_id,hideNames(privacy,selected,selected),true));
    const blocked=blocks.has(m.sender_id);
    item.classList.toggle('blocked-message',blocked);
    const content = node('div', 'message-content'), meta = node('div', 'message-meta'), time = node('time');
    time.dateTime = m.created_at;
    time.textContent = new Date(m.created_at).toLocaleString([], { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' });
    const nameButton=node(m.sender_id?'button':'span','profile-name',name);if(m.sender_id){nameButton.type='button';nameButton.onclick=()=>openPerson(m.sender_id);}
    meta.append(nameButton, time);if(m.sender_id===me.id){const receipt=node('small','read-receipt');receipt.dataset.receiptTime=m.created_at;meta.append(receipt);}
    if (!m.deleted_at && !blocked) {
      item.tabIndex = 0;
      item.classList.toggle('picker-open', reactionPicker === m.id);
      const actions = node('div', 'message-actions');
      actions.setAttribute('role', 'group'); actions.setAttribute('aria-label', 'Message actions');
      for (const emoji of QUICK_EMOJI) {
        const quick = node('button', 'quick-reaction', emoji); quick.type = 'button';
        quick.title = 'React ' + emoji; quick.setAttribute('aria-label', quick.title);
        quick.onclick = () => reactTo(m, emoji); actions.append(quick);
      }
      const reply = actionButton('reply', 'Reply', 'reply-action');
      reply.onclick = () => { replyDrafts.set(selected, m.id); renderReplyDraft(); $('message').focus(); };
      const react = actionButton('emoji', 'More reactions', 'emoji-action');
      react.setAttribute('aria-expanded', String(reactionPicker === m.id));
      react.onclick = () => {
        reactionPicker = reactionPicker === m.id ? null : m.id; renderMessages();
        const row = [...$('messages').children].find(el => el.dataset.messageId === m.id);
        if (reactionPicker) row?.scrollIntoView({ block: 'nearest' });
        row?.querySelector(reactionPicker ? '.emoji-search' : '.emoji-action')?.focus({ preventScroll: true });
      };
      actions.append(react, reply);
      if (m.sender_id === me.id) {
        const remove = actionButton('trash', 'Delete message', 'delete-action');
        remove.onclick = event => {
          deleteMessage(m);
        };
        actions.append(remove);
      }
      item.append(actions);
    }
    content.append(meta);
    if (m.reply_to && !m.deleted_at && !blocked) {
      const parent = messages.get(m.reply_to) || parents.get(m.reply_to), quote = node('div', 'reply-quote');
      quote.append(node('strong', '', parent ? displayPerson(parent.sender_id) : 'Earlier message'), node('span', '', !parent ? 'Message unavailable' : blocks.has(parent.sender_id) ? 'Blocked message' : parent.deleted_at ? 'Message deleted' : messagePreview(parent.body)));
      content.append(quote);
    }
    content.append(node('div', 'message-body' + (m.deleted_at ? ' deleted-body' : !blocked&&emojiOnly(m.body)?' emoji-only':''), blocked ? 'Blocked message' : m.deleted_at ? 'Message deleted' : (legacyGif(m.body)||m.body.startsWith('[[sahur-gif:v1]]')) ? 'GIF shared before GIF support was removed' : m.body));
    if(!m.deleted_at&&!blocked&&mediaId(m.body))showMedia(content.lastChild,mediaId(m.body));
    else if(!m.deleted_at&&!blocked&&m.body.includes('[[emoji:'))renderInlineEmojis(content.lastChild,m.body);
    if(!m.deleted_at&&!blocked&&golfId(m.body)){const card=node('button','pool-card');card.type='button';card.append(Golf.thumbnail(),node('span','','Mini golf · Open game'));card.onclick=()=>openGolf(golfId(m.body));content.lastChild.textContent='Mini golf';content.append(card);}
    if(!m.deleted_at&&!blocked&&chessId(m.body)){const match=chessId(m.body),card=node('button','pool-card');card.type='button';card.append(ChessGame.thumbnail(),node('span','','Chess · '+ChessGame.timeLabel(match.seconds)));card.onclick=()=>openChess(match.id);content.lastChild.textContent='Chess';content.append(card);}
    if(!m.deleted_at&&!blocked&&poolId(m.body)){const game=node('button','pool-card','🎱 8-ball pool · Open game');game.type='button';game.replaceChildren(poolThumbnail(),node('span','','8-ball pool · Open game'));game.onclick=()=>openPool(poolId(m.body));content.lastChild.textContent='8-ball pool';content.append(game);}
    if (!m.deleted_at && !blocked) {
      const chips = node('div', 'reactions');
      for (const emoji of new Set([...reactions.values()].filter(r=>r.message_id===m.id&&r.active).map(r=>r.emoji))) {
        const people = [...reactions.values()].filter(r => r.message_id === m.id && r.emoji === emoji && r.active && !blocks.has(r.user_id));
        if (!people.length) continue;
        const mine = people.some(r => r.user_id === me.id), chip = node('button', 'reaction-chip' + (mine ? ' mine' : ''));
        chip.type = 'button'; chip.setAttribute('aria-pressed', String(mine)); chip.setAttribute('aria-label', emoji + ', ' + people.length + ' reactions');
        chip.title = people.map(r => displayPerson(r.user_id)).join(', ');
        chip.append(node('span', '', emoji), node('small', '', String(people.length)));
        chip.onclick = () => reactTo(m, emoji);
        chips.append(chip);
      }
      if (chips.children.length) content.append(chips);
      if (reactionPicker === m.id) {
        const picker = node('div', 'reaction-picker'); picker.setAttribute('role', 'region'); picker.setAttribute('aria-label', 'Choose reaction');
        const heading = node('div', 'picker-heading', 'Add a reaction');
        const close = node('button', 'picker-close', '×'); close.type = 'button'; close.setAttribute('aria-label', 'Close emoji picker'); close.onclick = () => closeReactionPicker(true); heading.append(close);
        const search = node('input', 'emoji-search'); search.type = 'search'; search.placeholder = 'Find an emoji…'; search.setAttribute('aria-label', 'Search emojis');
        search.value = searchState?.value || '';
        const options = node('div', 'emoji-options');
        const populate = () => {
          options.replaceChildren();
          for (const [category, choices] of Object.entries(EMOJI_CATEGORIES)) {
            const matches = choices.filter(([emoji, label]) => (emoji + ' ' + label + ' ' + category).toLowerCase().includes(search.value.trim().toLowerCase()));
            if (!matches.length) continue;
            const section = node('section', 'emoji-category'); section.append(node('h4', '', category));
            const grid = node('div', 'emoji-grid');
            for (const [emoji, label] of matches) {
              const choice = node('button', '', emoji); choice.type = 'button'; choice.title = label; choice.setAttribute('aria-label', 'React ' + label); choice.dataset.emoji = emoji;
              choice.onclick = () => reactTo(m, emoji); grid.append(choice);
            }
            section.append(grid); options.append(section);
          }
          if (!options.children.length) options.append(node('p', 'hint', 'No matching emojis.'));
        };
        search.oninput = populate; populate(); picker.append(heading, search, options);
        content.append(picker);
      }
    }
    item.append(content); fragment.append(item);
  }
  if (!messages.size) fragment.append(node('p', 'empty', 'No messages yet. Say hello.'));
  $('messages').replaceChildren(fragment);
  if (searchState?.focused) document.querySelector('.emoji-search')?.focus({ preventScroll: true });
  $('older').hidden = !hasOlder;
  renderReplyDraft();
  if (preserveScroll || reactionPicker) history.scrollTop = previousScroll;
  else if (forceBottom || nearBottom) { history.scrollTop = history.scrollHeight;settleChatScroll(); }
}
async function selectRoom(id) {
  const room = rooms.find(r => r.id === id);
  if (!room) throw new Error('Conversation not found. Try again.');
  if (selected === id && !$('history').hidden) { queueChatReconcile(); return; }
  closePool();closeChess();closeGolf();closeLeaderboards();$('games-dialog').close();$('composer-emoji-dialog').close();
  if (selected) { drafts.set(selected, $('message').value); saveConversationWindow(); }
  clearTimeout(chatOlderTimer);clearTimeout(chatReconnectTimer);
  selected = id;draftEmojiPreview.hidden=true;refreshActiveGames(); unread.delete(id); view++; messages.clear(); parents.clear(); reactions.clear(); reactionPicker = null; oldest = null; hasOlder = false; loading = false;
  const cached = loadCachedConversation(id);
  joinTypingRoom(id);
  renderHeader();
  $('welcome').hidden = true; $('history').hidden = false; $('composer').hidden = false;
  $('message').value = drafts.get(id) || '';
  renderRooms(); renderMessages(!!cached);
  const unresolved = [...messages.values()].some(m=>m.reply_to && !parents.has(m.reply_to));
  // Very recent cached conversations stay current through live message events,
  // so reopening them need not download the same 50 messages again.
  if (!cached || !inboxLive || unresolved || Date.now()-cached.savedAt>15000)
    await loadHistory(false, true);
  if (selected === id) $('message').focus();
}
function openRoomSettings(room) {
  roomSettingsId=room.id;groupAvatarFile=null;$('group-avatar-file').value='';
  const isGroup=room.kind==='group';
  $('room-settings-title').textContent=isGroup?'Group settings':'Direct message';
  $('group-name-row').hidden=!isGroup;$('group-picture-row').hidden=!isGroup;
  $('group-name').value=isGroup&&privacy==='off'?room.name:'';$('group-name').disabled=privacy!=='off';$('room-settings-save').disabled=privacy!=='off';$('group-name').placeholder=privacy==='off'?'Group name':'Names hidden — turn off Hide names to edit';
  $('group-avatar-status').textContent=isGroup?(room.avatar_data?'A group picture is set. Without one, the current members’ profile pictures appear as the group icon.':'The group icon currently shows its members’ profile pictures.') : '';
  $('group-picture-remove').hidden=!isGroup||!room.avatar_data;$('room-settings-save').hidden=!isGroup;
  $('room-leave').hidden=!isGroup;$('dm-close').hidden=isGroup;
  renderGroupInvites(room);$('room-settings-dialog').showModal();
}
function showWelcome() {
  if(selected){drafts.set(selected,$('message').value);saveConversationWindow();}
  clearTimeout(chatOlderTimer);clearTimeout(chatReconnectTimer);
  leaveTypingRoom();
  selected=null;view++;messages.clear();parents.clear();reactions.clear();replyDrafts.clear();
  $('message').value='';$('history').hidden=true;$('composer').hidden=true;$('welcome').hidden=false;
  $('conversation-avatar').className='avatar header-avatar';$('conversation-avatar').replaceChildren();$('conversation-avatar').textContent='#';
  $('room-title').textContent='Make yourself at home.';$('room-subtitle').textContent='Choose a conversation or start a new one.';
  renderRooms();renderHeader();
}
async function closeDirectMessage(id=roomSettingsId) {
  const room=rooms.find(item=>item.id===id);
  if(!room||room.kind!=='dm'||!me)return;
  const result=await client.from('hidden_rooms').insert({user_id:me.id,room_id:room.id});
  if(result.error&&result.error.code!=='23505')throw result.error;
  rooms=rooms.filter(item=>item.id!==room.id);unread.delete(room.id);
  $('room-settings-dialog').close();if(selected===room.id)showWelcome();else renderRooms();
  conversationCache.delete(room.id);
  notify('Direct message hidden from your list. Shared history is still saved.');
}
async function leaveGroup() {
  const id=roomSettingsId,room=rooms.find(item=>item.id===id);
  if(!room||room.kind!=='group'||!me)return;
  checked(await client.rpc('leave_group',{target_room:id}));
  rooms=rooms.filter(item=>item.id!==id);unread.delete(id);
  $('room-settings-dialog').close();if(selected===id)showWelcome();else renderRooms();
  conversationCache.delete(id);
  notify('You left the group. The conversation and shared history remain for its members.');
}
async function saveGroupSettings() {
  const room=rooms.find(item=>item.id===roomSettingsId);
  if(!room||room.kind!=='group'||!me)return;
  $('room-settings-save').disabled=true;
  try {
    const avatar=groupAvatarFile?await prepareAvatar(groupAvatarFile):room.avatar_data||null;
    const name=$('group-name').value.trim();
    const saved=checked(await client.from('rooms').update({name,avatar_data:avatar}).eq('id',room.id).eq('kind','group').select('id,name,avatar_data').single());
    Object.assign(room,saved);groupAvatarFile=null;$('group-avatar-file').value='';
    $('group-avatar-status').textContent=avatar?'Group name and picture saved.':'Group name saved; member pictures are used for the group icon.';
    $('group-picture-remove').hidden=!avatar;
    refreshRooms().catch(e=>notify(e.message));renderHeader();renderRooms();
  } catch(e) { notify(e.message); }
  finally { $('room-settings-save').disabled=false; }
}
async function loadHistory(older = false, jumpToBottom = false) {
  if (!selected || loading || (older && (!hasOlder || !oldest))) return;
  const currentView = view, sessionEpoch = epoch, id = selected;
  const cachedNewest = older ? null : newestMessage(messages.values());
  loading = true; $('older').disabled = true;
  const stillHere = () => currentView === view && sessionEpoch === epoch && selected === id;
  try {
    // On reconnect, the cache already holds older history. Reconcile the
    // latest 20 rows and fetch genuinely missed messages with a cursor.
    const recentLimit = !older && cachedNewest ? 20 : CHAT_PAGE_SIZE;
    let query = client.from('messages').select(MESSAGE_FIELDS).eq('room_id', id)
      .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(recentLimit);
    if (older) query = query.or('created_at.lt.' + oldest.created_at + ',and(created_at.eq.' + oldest.created_at + ',id.lt.' + oldest.id + ')');
    const rows = checked(await query);
    if (!stillHere()) return;
    const history = $('history'), height = history.scrollHeight, scroll = history.scrollTop;
    for (const m of rows) mergeMessage(m);
    await loadRelated(rows, currentView, sessionEpoch);
    if (!stillHere()) return;

    // A long offline interval can contain more than the latest 50 messages.
    // Catch up using indexed ascending cursors so none are silently skipped.
    if (!older && cachedNewest && rows.length &&
        compareMessageCursor(rows.at(-1), cachedNewest) > 0) {
      await fetchMissedMessages(cachedNewest,
        async after => checked(await client.from('messages').select(MESSAGE_FIELDS).eq('room_id', id)
          .or('created_at.gt.' + after.created_at + ',and(created_at.eq.' + after.created_at + ',id.gt.' + after.id + ')')
          .order('created_at', {ascending:true}).order('id', {ascending:true})
          .limit(CHAT_CATCHUP_SIZE)),
        async next => {
          const missing = next.filter(m => !messages.has(m.id));
          for (const m of next) mergeMessage(m);
          await loadRelated(missing, currentView, sessionEpoch);
        },
        stillHere);
      if (!stillHere()) return;
    }

    oldest = olderMessage(oldest, rows.at(-1));
    // A recent-message reconciliation does not tell us whether the older
    // history already cached in memory has older pages on the server.
    hasOlder = hasOlderMessages(older, cachedNewest, rows.length, hasOlder);
    renderMessages(!older && jumpToBottom, older);
    refreshReadReceipts();
    if (older) history.scrollTop = scroll + history.scrollHeight - height;
  } finally {
    if (stillHere()) { loading = false; $('older').disabled = false; }
  }
}
function connection(text) { $('connection').textContent = text === 'Live updates connected' ? 'Connected' : text; $('connection').title = text; }
function renderTypingIndicator() {
  const names = [...typingUsers.keys()].filter(id => id !== me?.id && !blocks.has(id)).map(id => hideNames(privacy, selected, selected) ? 'Someone' : displayPerson(id, selected));
  const unique = [...new Set(names)];
  const indicator = $('typing-indicator');
  indicator.hidden = !selected || unique.length === 0;
  $('typing-text').textContent = unique.length === 1 ? `${unique[0]} is typing` : unique.length === 2 ? `${unique[0]} and ${unique[1]} are typing` : unique.length > 2 ? `${unique.length} people are typing` : '';
}
function receiveTyping(payload) {
  const id = payload?.payload?.user_id;
  if (!id || id === me?.id || !rooms.find(room => room.id === typingJoinedRoom)?.room_members.some(member => member.user_id === id)) return;
  clearTimeout(typingExpiryTimers.get(id)); typingExpiryTimers.delete(id);
  if (payload.payload.typing === false) typingUsers.delete(id);
  else {
    typingUsers.set(id, Date.now());
    const timer = setTimeout(() => { typingUsers.delete(id); typingExpiryTimers.delete(id); renderTypingIndicator(); }, 4000);
    typingExpiryTimers.set(id, timer);
  }
  renderTypingIndicator();
}
function publishTyping(isTyping) {
  if (!typingChannel || !typingReady || !me) return;
  if (isTyping) {
    if (Date.now() - lastTypingSent < 1500) {
      clearTimeout(typingStopTimer); typingStopTimer = setTimeout(() => publishTyping(false), 3200); return;
    }
    lastTypingSent = Date.now(); typingActive = true;
    clearTimeout(typingStopTimer); typingStopTimer = setTimeout(() => publishTyping(false), 3200);
  } else {
    clearTimeout(typingStopTimer); typingStopTimer = null;
    if (!typingActive) return;
    typingActive = false;
  }
  typingChannel.send({ type: 'broadcast', event: 'typing', payload: { user_id: me.id, typing: isTyping } }).catch(() => {});
}
function leaveTypingRoom() {
  publishTyping(false);
  clearTimeout(typingStopTimer); typingStopTimer = null;
  if (typingChannel && client) client.removeChannel(typingChannel).catch(() => {});
  typingChannel = null; typingJoinedRoom = null; typingReady = false; typingActive = false; lastTypingSent = 0;
  for (const timer of typingExpiryTimers.values()) clearTimeout(timer);
  typingExpiryTimers.clear(); typingUsers.clear(); renderTypingIndicator();
}
function joinTypingRoom(roomId) {
  leaveTypingRoom();
  if (!me || !roomId) return;
  typingJoinedRoom = roomId;
  const currentEpoch = epoch;
  typingChannel = client.channel('pocketchat-typing:' + roomId, { config: { private: true, broadcast: { self: false, ack: false } } })
    .on('broadcast', { event: 'typing' }, payload => { if (currentEpoch === epoch && typingJoinedRoom === roomId) receiveTyping(payload); })
    .subscribe(status => {
      if (currentEpoch !== epoch || typingJoinedRoom !== roomId) return;
      typingReady = status === 'SUBSCRIBED';
      if (typingReady && $('message').value.trim()) publishTyping(true);
    });
}
async function refreshOwnerCapability() {
  if(!me){isAppOwner=false;$('moderation-owner-section').hidden=true;return;}
  try {isAppOwner=checked(await client.rpc('is_app_owner'))===true;}
  catch {isAppOwner=false;}
  try{isAppAdmin=checked(await client.rpc('is_app_admin'))===true;}catch{isAppAdmin=isAppOwner;}$('moderation-owner-section').hidden=!isAppAdmin;
}
async function deleteModeratedAccount(accountId,accountName,button) {
  if(privacy!=='off')accountName=personLabel(accountId);
  if(!isAppOwner||!accountId||accountId===me?.id)return;
  const confirmed=window.confirm(`Permanently delete @${accountName}? Their sign-in, profile, friend links, reactions, and IP records will be removed. Their messages stay in shared chats with the sender anonymized. This cannot be undone.`);
  if(!confirmed)return;
  button.disabled=true;$('moderation-status').textContent=`Deleting @${accountName}…`;
  try{
    checked(await client.rpc('moderation_delete_account',{target_user:accountId}));
  }catch(e){$('moderation-status').textContent='Account could not be deleted: '+(e.message||'Unknown error');button.disabled=false;return;}
  notify(`@${accountName} was deleted. Their shared messages are anonymized.`);
  const updates=await Promise.allSettled([refreshRooms(),refreshSocial(),renderModeration()]);
  if(updates.some(result=>result.status==='rejected'))$('moderation-status').textContent='The account was deleted. Reopen this panel if the chat list did not refresh.';
}
async function renderModeration() {
  if(!isAppAdmin||moderationBusy)return;
  moderationBusy=true;$('moderation-status').textContent='Loading moderation data…';$('moderation-list').replaceChildren();
  try {
    const rows=checked(await client.rpc('moderation_overview'));
    $('moderation-status').textContent=rows.length?'IP overlaps are possible matches only.':'No accounts were returned.';
    for(const row of rows){
      const card=node('article','moderation-account'),heading=node('div','moderation-account-heading');
      card.dataset.accountId=row.account_id;
      heading.append(node('strong','',privacy==='off'?row.username:personLabel(row.account_id)),node('small','',row.account_created_at?'Joined '+new Date(row.account_created_at).toLocaleDateString():'Account date unavailable'));
      card.append(heading);
      if(row.last_ip)card.append(node('p','',`Last recorded IP: ${row.last_ip}${row.last_seen_at?' · '+new Date(row.last_seen_at).toLocaleString():''}`));
      else card.append(node('p','muted','No IP address recorded in the last 7 days.'));
      const matches=Array.isArray(row.possible_matches)?row.possible_matches:[];
      if(matches.length){
        card.append(node('strong','possible-match-label','Possible shared-network matches'));
        const list=node('ul','possible-match-list');
        for(const match of matches){const item=node('li','');item.append(node('strong','',privacy==='off'?(match.username||'Unknown account'):personLabel(match.account_id)),node('small','',match.last_seen_at?' · observed '+new Date(match.last_seen_at).toLocaleString():''));list.append(item);}
        card.append(list);
      } else card.append(node('p','muted','No shared IP match found in the last 90 days.'));
      if(isAppOwner&&row.account_id!==me?.id){
        const actions=node('div','moderation-account-actions'),remove=node('button','danger','Delete account');
        remove.type='button';remove.onclick=()=>deleteModeratedAccount(row.account_id,row.username,remove);actions.append(remove);card.append(actions);
      }
      $('moderation-list').append(card);
    }
    if(!rows.some(row=>row.last_seen_at))$('moderation-status').textContent='No session IPs have been recorded yet. Confirm the Edge Function is deployed and IP_MATCH_SECRET is set.';
  } catch(e) {$('moderation-status').textContent='Moderation data could not be loaded: '+(e.message||'Unknown error');}
  finally {moderationBusy=false;}
}
async function enter(user) {
  me = user; const sessionEpoch = ++epoch;
  const ownProfile=await client.from('profiles').select('id,username,avatar_data,about_me,display_name').eq('id',me.id).single();
  if(ownProfile.error && ['42703','PGRST204'].includes(ownProfile.error.code))throw new Error('Database update needed: ask the owner to run the account/social SQL migration in Supabase SQL Editor.');
  profile=checked(ownProfile);people.set(me.id,profile);profileRefreshAt.set(me.id,Date.now());
  if (sessionEpoch !== epoch) return;
  client.rpc('read_receipts_enabled').then(r=>{if(!r.error&&sessionEpoch===epoch)$('read-receipts').checked=r.data;});
  $('password').value = ''; $('my-name').textContent = privacy==='off'?profile.username:'You';
  const schemaCheck = await client.from('messages').select('reply_to,deleted_at').limit(1);
  if (schemaCheck.error) {
    if (['42703','PGRST204'].includes(schemaCheck.error.code)) throw new Error('Database update needed: run supabase/upgrade-1.1.sql in your Supabase SQL Editor, then sign in again.');
    throw schemaCheck.error;
  }
  if (sessionEpoch !== epoch) return;
  screen('chat'); connection('Connecting…');
  window.pocketchatDesktop?.signedIn?.().then(renderUpdateState).catch(()=>{});
  await refreshRooms(); await refreshSocial();await refreshOwnerCapability();startSocialLive();
  callView?.dispose();callView=Calls.mount({client,userId:me.id,label:displayPerson,onRing:room=>desktopPopup(room,true),avatar:(id,room)=>hideNames(privacy,room,selected)?null:personData(id)?.avatar_data,notify});
  client.functions.invoke('record-session-ip',{body:{}}).catch(()=>{});Promise.resolve(client.rpc('record_sign_in')).catch(()=>{});
  channel = client.channel('inbox-' + me.id)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, event => {
      if (sessionEpoch !== epoch) return;
      const m = event.new;
      if (event.eventType === 'INSERT') {
        const room = rooms.find(r => r.id === m.room_id);
        if (room) room.last_activity_at = m.created_at;
        renderRooms();
        if (m.sender_id !== me.id && !blocks.has(m.sender_id) && inAppNotifications) Sounds.play('message');
      }
      if(event.eventType==='INSERT'&&m.sender_id!==me.id&&!blocks.has(m.sender_id))desktopPopup(m.room_id,false);
      if (m?.room_id !== selected) {
        if (event.eventType === 'INSERT') conversationCache.appendMessage(m);
        else conversationCache.updateMessage(m);
      }
      if (m?.room_id === selected) {
        if (event.eventType === 'INSERT' || messages.has(m.id)) mergeMessage(m);
        else if (!parents.get(m.id)?.deleted_at || m.deleted_at) parents.set(m.id, m);
        renderMessages();refreshReadReceipts();
      } else if (event.eventType === 'INSERT') { unread.add(m.room_id); renderRooms(); showMessageNotification(m); }
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions' }, event => {
      if (sessionEpoch !== epoch) return;
      if (event.new?.message_id) {
        conversationCache.updateReaction(event.new);
        if (messages.has(event.new.message_id)) { mergeReaction(event.new); renderMessages(); }
      }
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'room_members' }, () => {
      refreshRooms().catch(e => notify(e.message));
    })
    .on('postgres_changes',{event:'*',schema:'public',table:'friendships'},()=>{if(sessionEpoch===epoch)refreshSocial().catch(e=>notify(e.message));})
    .on('postgres_changes',{event:'*',schema:'public',table:'user_blocks'},()=>{if(sessionEpoch===epoch)refreshSocial().catch(e=>notify(e.message));})
    .on('postgres_changes',{event:'*',schema:'public',table:'hidden_rooms',filter:'user_id=eq.'+me.id},()=>{if(sessionEpoch===epoch)refreshRooms().catch(e=>notify(e.message));})
    .on('postgres_changes',{event:'UPDATE',schema:'public',table:'profiles'},event=>{if(sessionEpoch===epoch && people.has(event.new.id)){people.set(event.new.id,event.new);profileRefreshAt.set(event.new.id,Date.now());if(event.new.id===me.id)profile=event.new;refreshPeopleViews();}})
    .on('postgres_changes',{event:'UPDATE',schema:'public',table:'rooms'},event=>{if(sessionEpoch===epoch && rooms.some(room=>room.id===event.new.id))refreshRooms().catch(e=>notify(e.message));})
    .subscribe(status => {
      if (sessionEpoch !== epoch) return;
      inboxLive = status === 'SUBSCRIBED';
      connection(inboxLive ? 'Live updates connected' : 'Reconnecting…');
      if (status === 'SUBSCRIBED') {
        refreshRooms().catch(e => notify(e.message));
        // Keep the current scroll position and fetch only recent/missed messages.
        if (selected) queueChatReconcile();
      }
    });
  // Recovers room invitations even if an event was missed. Message catch-up happens on reconnect.
  poll = setInterval(() => {
    if (!me || document.visibilityState !== 'visible') return;
    // Realtime keeps active sessions current. Poll faster only when disconnected.
    const roomInterval = inboxLive ? 120000 : 30000;
    const socialInterval = inboxLive ? 180000 : 60000;
    if (Date.now() - lastRoomSafetyRefresh >= roomInterval)
      refreshRooms().catch(() => connection('Connection interrupted'));
    if (Date.now() - lastSocialSafetyRefresh >= socialInterval)
      refreshSocial().catch(() => connection('Connection interrupted'));
  }, 30000);
}
function leave() {
 callView?.dispose();callView=null;
 customDrafts.clear();pictureDialog.close();draftEmojiPreview.hidden=true;
 mediaToken++;mediaBusy=false;closeMedia();customEmojis=[];emojiLoadedAt=0;emojiLoadRequest=null;mediaMetadata.clear();mediaCache.clear();mediaRequests.clear();
 stopSocialLive();imposter.close();imposterOpenedRounds.clear();
  closePool();closeChess();closeGolf();closeLeaderboards();$('games-dialog').close();$('composer-emoji-dialog').close();
  leaveTypingRoom(); clearInAppNotifications();
  clearTimeout(chatOlderTimer);clearTimeout(chatReconnectTimer);conversationCache.clear();
  inboxLive=false;lastRoomSafetyRefresh=0;lastSocialSafetyRefresh=0;
  receiptsLastCheck=0;receiptsLastRoom=null;receiptsLastAtBottom=false;
  epoch++; view++; selected = null; me = null; rooms = []; messages.clear(); drafts.clear(); pending.clear(); unread.clear(); parents.clear(); reactions.clear(); replyDrafts.clear(); reactionBusy.clear();
  clearInterval(poll); clearTimeout(refreshTimer);
  if (channel) client.removeChannel(channel).catch(() => {});
  channel = null;
  $('message').value = ''; $('password').value = '';
  $('history').hidden = true; $('composer').hidden = true; $('welcome').hidden = false;
  $('conversation-avatar').replaceChildren();$('conversation-avatar').classList.remove('has-picture');$('conversation-avatar').textContent='#';
  $('friend-add').disabled=false;
  $('room-title').textContent = 'Make yourself at home.';
  $('room-subtitle').textContent = 'Choose a conversation or start a new one.';
  people.clear();profileRefreshAt.clear();friendships=[];blocks.clear();personId=null;socialVersion++;socialBusy=false;avatarBusy=false;profileBusy=false;isAppOwner=false;isAppAdmin=false;roomSettingsId=null;groupAvatarFile=null;
  for(const id of ['new-dialog','friends-dialog','person-dialog','settings-dialog','room-settings-dialog','moderation-dialog'])$(id).close();
  $('moderation-owner-section').hidden=true;$('moderation-list').replaceChildren();$('social-list').replaceChildren();$('person-actions').replaceChildren();$('person-name').textContent='';$('person-avatar').replaceChildren();$('person-about').textContent='';$('profile-avatar').replaceChildren();$('my-avatar').replaceChildren();$('profile-username').textContent='';$('about-me').value='';$('about-status').textContent='';$('friend-username').value='';$('avatar-file').value='';$('group-avatar-file').value='';$('typing-indicator').hidden=true;
  screen('auth');
}
let authSubscription,authStorageKey;
function connect(config) {
  authSubscription?.unsubscribe();authStorageKey='tungchat-auth-'+new URL(config.url).hostname;
  client = createClient(config.url, config.key, { auth: { storageKey:authStorageKey,persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
  authSubscription=client.auth.onAuthStateChange(event => { if (event === 'SIGNED_OUT' && me) queueMicrotask(leave); })?.data?.subscription;
  screen('auth');
  restoreSavedSession();
}
function restoreSavedSession(){
  const connectionClient=client;
  client.auth.getSession().then(async result=>{if(client!==connectionClient)return;const session=checked(result).session;if(session&&!me){try{await enter(session.user);}catch(e){leave();notify('Could not restore your session: '+e.message);}}}).catch(e=>notify(e.message));
}
$('setup-form').onsubmit = event => {
  event.preventDefault();
  try { const config = backend($('project-url').value, $('project-key').value); localStorage.setItem('pocketchat-project', JSON.stringify(config)); connect(config); }
  catch (e) { notify(e.message); }
};
$('auth-toggle').onclick = () => {
  signup = !signup;
  $('auth-title').textContent = signup ? 'Meet your people here.' : 'Good to see you.';
  $('auth-caption').textContent = signup ? 'Choose a username your friends will recognize.' : 'Sign in and pick up the conversation.';
  $('auth-submit').textContent = signup ? 'Create account →' : 'Sign in →';
  $('auth-toggle').textContent = signup ? 'Already have an account? Sign in' : 'New here? Create an account';
  $('password').autocomplete = signup ? 'new-password' : 'current-password';
  $('privacy-ack-row').hidden=!signup;$('privacy-ack').required=signup;$('privacy-ack').checked=false;
};
$('change-project').onclick = () => { localStorage.removeItem('pocketchat-project'); screen('setup'); };
$('auth-form').onsubmit = async event => {
  event.preventDefault(); $('auth-submit').disabled = true; $('auth-toggle').disabled = true; $('change-project').disabled = true;
  try {
    const name = username($('username').value), password = $('password').value;
    if (password.length < 10) throw new Error('Use a password with at least 10 characters.');
    if (signup && !$('privacy-ack').checked) throw new Error('Please acknowledge the moderation IP notice before creating an account.');
    const data = signup
      ? checked(await client.auth.signUp({ email: emailFor(name), password, options: { data: { username: name } } }))
      : checked(await client.auth.signInWithPassword({ email: emailFor(name), password }));
    if (!data.session) throw new Error('The project still requires email confirmation. Ask the project owner to turn Confirm email off in Supabase Authentication settings.');
    try { await enter(data.user); } catch (e) { leave(); throw e; }
  } catch (e) { notify(e.message); }
  finally { $('auth-submit').disabled = false; $('auth-toggle').disabled = false; $('change-project').disabled = false; }
};
$('logout').onclick = async () => {
  const offline=Promise.resolve(client.rpc('touch_presence',{session_id:presenceSession,is_online:false})).catch(()=>{});
  leave(); // Clear local messages and tokens from the UI even when offline.
  await Promise.race([offline,new Promise(resolve=>setTimeout(resolve,1200))]);
  await client.auth.signOut({ scope: 'local' }).catch(() => {});
  localStorage.removeItem(authStorageKey);
};
function openNew() { $('new-dialog').showModal(); $('new-people').focus(); }
$('new-chat').onclick = openNew; $('welcome-new').onclick = openNew;
$('cancel-new').onclick = () => $('new-dialog').close();
$('new-kind').onchange = () => {
  const group = $('new-kind').value === 'group';
  $('room-name-label').hidden = !group; $('new-name').required = group;
  $('new-people').placeholder = group ? 'alex, sam, jordan' : 'alex';
};
$('new-form').onsubmit = async event => {
  event.preventDefault(); const sessionEpoch = epoch; $('create-chat').disabled = true;
  try {
    let id;
    if ($('new-kind').value === 'dm') { id = checked(await client.rpc('start_dm', { other_username: username($('new-people').value) }));await unhideDirectMessage(id); }
    else {
      const people = [...new Set($('new-people').value.split(',').map(username))];
      id = checked(await client.rpc('create_group', { room_name: $('new-name').value.trim(), usernames: people }));
    }
    if (epoch !== sessionEpoch) return;
    await refreshRooms(); $('new-dialog').close(); $('new-form').reset(); $('new-kind').onchange();
    await selectRoom(id);
  } catch (e) { if (epoch === sessionEpoch) notify(e.message); }
  finally { $('create-chat').disabled = false; }
};
$('composer').onsubmit = async event => {
  event.preventDefault();
  const room = selected, rawBody = $('message').value.trim(), body = expandShortcodes(encodeCustomDraft(rawBody,room)), sessionEpoch = epoch;
  if (!room || !body || $('send').disabled) return;
  let attempt = pending.get(room);
  const replyTo = replyDrafts.get(room) || null;
  if (!attempt || attempt.body !== body || attempt.replyTo !== replyTo) { attempt = { id: crypto.randomUUID(), body, replyTo }; pending.set(room, attempt); }
  $('send').disabled = true;
  try {
    let result;
    if(/^\/sudo(?:\s|$)/i.test(body)){if(!isAppOwner)throw Error('Only the owner can use /sudo.');const command=body.match(/^\/sudo\s+@?([a-z0-9_]+)\s+([\s\S]+)$/i);if(!command)throw Error('Use /sudo username message');result=await client.rpc('owner_sudo',{target_room:room,target_username:command[1],message_text:command[2],request_id:attempt.id});}
    else result=await client.from('messages').insert({ id: attempt.id, room_id: room, body, reply_to: replyTo }).select(MESSAGE_FIELDS).single();
    // A previous request may have reached the server even if its response was lost.
    if (result.error?.code === '23505') result = await client.from('messages').select(MESSAGE_FIELDS).eq('id', attempt.id).single();
    const sent = checked(result);
    if (epoch !== sessionEpoch) return;
    pending.delete(room);
    const activeRoom=rooms.find(r=>r.id===room);
    if(activeRoom){activeRoom.last_activity_at=sent.created_at;renderRooms();}
    Sounds.play('sent');
    if (selected === room) {
      mergeMessage(sent); replyDrafts.delete(room); renderMessages(true); publishTyping(false);
      if ($('message').value.trim() === rawBody) { $('message').value = ''; drafts.delete(room);customDrafts.delete(room);renderDraftEmojis(); }
    } else { replyDrafts.delete(room); if (drafts.get(room)?.trim() === rawBody) drafts.delete(room); }
  } catch (e) { if (epoch === sessionEpoch) notify('Not confirmed sent: ' + e.message + ' Your draft is kept. Try Send again.'); }
  finally { $('send').disabled = false; }
};
$('message').onkeydown = event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); $('composer').requestSubmit(); } };
function convertEmojiDraft() {
  const input = $('message'), converted = expandDraft(input.value, input.selectionStart, input.selectionEnd);
  if (converted.value !== input.value) {
    input.value = converted.value; input.setSelectionRange(converted.start, converted.end);
  }
}
$('message').addEventListener('input', event => { if (!event.isComposing) convertEmojiDraft(); publishTyping(!!$('message').value.trim()); });
$('message').addEventListener('compositionend', convertEmojiDraft);
$('message').addEventListener('blur', () => publishTyping(false));
$('older').onclick = () => loadHistory(true).catch(e => notify(e.message));
$('search').oninput = renderRooms;
window.addEventListener('offline', () => connection('Offline — drafts stay here'));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !me) return;
  refreshRooms().catch(e => notify(e.message));
  if (Date.now() - lastSocialSafetyRefresh > 120000) refreshSocial().catch(()=>{});
  if (selected) queueChatReconcile();
  refreshJoinableCalls();refreshActiveGames();presenceTick();
  refreshReadReceipts();
});
window.addEventListener('online', () => { if(!me&&client)restoreSavedSession();if (me) { refreshRooms().catch(e => notify(e.message)); if (selected) queueChatReconcile(); } });
try {
  const saved = JSON.parse(localStorage.getItem('pocketchat-project') || 'null');
  if (saved) { const config = backend(saved.url, saved.key); $('project-url').value = config.url; $('project-key').value = config.key; connect(config); }
  else screen('setup');
} catch { localStorage.removeItem('pocketchat-project'); screen('setup'); }

$('cancel-reply').onclick = () => { replyDrafts.delete(selected); renderReplyDraft(); };
async function deleteMessage(message) {
  const id = message.id, currentEpoch = epoch, currentRoom = selected;
  if (message.sender_id !== me?.id || message.deleted_at || deletingMessages.has(id)) return;
  deletingMessages.add(id);
  try {
    const deleted = checked(await client.rpc('delete_message', { target_message: id }).single());
    if (currentEpoch !== epoch) return;
    if (currentRoom === selected) { mergeMessage(deleted); renderMessages(); }
  } catch(e) { if (currentEpoch === epoch) notify(e.message); }
  finally { deletingMessages.delete(id); }
}
function closeReactionPicker(restoreFocus = false) {
  if (!reactionPicker) return;
  const id = reactionPicker; reactionPicker = null;
  document.querySelector('.reaction-picker')?.remove();
  document.querySelector('.picker-open')?.classList.remove('picker-open');
  document.querySelector('.emoji-action[aria-expanded="true"]')?.setAttribute('aria-expanded', 'false');
  if (restoreFocus) [...$('messages').children].find(el => el.dataset.messageId === id)?.querySelector('.emoji-action')?.focus({ preventScroll: true });
}
document.addEventListener('pointerdown', event => {
  if (!event.target.closest('.reaction-picker, .emoji-action')) closeReactionPicker();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && reactionPicker) { event.preventDefault(); closeReactionPicker(true); }
});
function setAccent(value) {
  color = accent(value);
  document.documentElement.style.setProperty('--accent', color);
  document.documentElement.style.setProperty('--accent-ink', accentInk(color));
  $('accent-color').value = color;
  localStorage.setItem('pocketchat-accent', color);
  for (const button of $('accent-presets').children) button.setAttribute('aria-pressed', String(button.dataset.color === color));
}
for (const preset of ['#b9ef87','#81b7ff','#c3a0ff','#ff9fbc','#ffbe72','#ffffff']) {
  const button = node('button','accent-swatch'); button.type = 'button'; button.dataset.color = preset;
  button.style.backgroundColor = preset; button.setAttribute('aria-label','Accent '+preset); button.onclick=()=>setAccent(preset); $('accent-presets').append(button);
}
setAccent(color);
require('./themes.cjs').mount($('theme-editor'), setAccent);
$('sound-enabled').checked=localStorage.getItem('sahur-sounds')!=='off';
$('sound-volume').value=Number(localStorage.getItem('sahur-sound-volume')??.35)*100;
$('sound-enabled').onchange=e=>localStorage.setItem('sahur-sounds',e.target.checked?'on':'off');
$('sound-volume').oninput=e=>localStorage.setItem('sahur-sound-volume',e.target.value/100);
$('sound-preview').onclick=()=>Sounds.play('message');
$('accent-color').oninput = event => setAccent(event.target.value);
function setPrivacy(mode) {
  pictureDialog.close();
  privacy = mode==='off'?'off':'all';mode=privacy;clearInAppNotifications();closePool();closeChess();closeGolf();closeLeaderboards();$('room-settings-dialog').close();$('moderation-dialog').close();$('moderation-list').replaceChildren(); localStorage.setItem('pocketchat-privacy', mode);
  if (mode !== 'off') $('search').value = '';
  refreshPeopleViews(); renderTypingIndicator();
}


document.addEventListener('keydown',e=>{if(e.ctrlKey&&!e.altKey&&!e.shiftKey&&e.key.toLowerCase()==='h'&&me){e.preventDefault();setPrivacy(privacy==='off'?'all':'off');notify(privacy==='off'?'Names visible':'Names hidden');}},true);
$('settings-open').onclick = async () => {
  renderOwnProfile(); $('in-app-notifications-toggle').checked = inAppNotifications;
  $('settings-dialog').showModal();refreshOwnerCapability().catch(()=>{});
  if (window.pocketchatDesktop) {
    try { renderUpdateState(await window.pocketchatDesktop.updateState()); } catch(e) { notify(e.message); }
  }
};
$('in-app-notifications-toggle').onchange = event => {
  inAppNotifications = event.target.checked;
  localStorage.setItem('pocketchat-in-app-notifications', inAppNotifications ? 'on' : 'off');
  if (!inAppNotifications) clearInAppNotifications();
};
$('my-name').onclick=()=>openPerson(me?.id);
$('my-avatar').onclick=()=>openPerson(me?.id);
$('about-save').onclick=saveAboutMe;
$('settings-close').onclick = () => $('settings-dialog').close();
function renderUpdateState(state) {
  desktopUpdate = state;
  $('app-version').textContent = 'v' + state.version + (state.installedVersion ? ` (build ${state.installedVersion})` : '');
  $('update-status').textContent = state.status;
  if (document.activeElement !== $('update-source')) $('update-source').value = state.repository || '';
  $('update-check').disabled = state.busy || !state.repository;
  $('update-source-save').disabled = state.busy || state.ready;
  $('update-install').hidden = !state.ready;
  $('update-banner').hidden = !state.ready;
  $('update-banner-text').textContent = state.status;
  if(state.ready&&me&&!installingUpdate)restartToUpdate();
}
$('update-source-save').onclick = async () => {
  if (!window.pocketchatDesktop) return;
  try { renderUpdateState(await window.pocketchatDesktop.setUpdateSource($('update-source').value)); } catch(e) { notify(e.message); }
};
$('update-check').onclick = async () => {
  if (!window.pocketchatDesktop) return;
  try { renderUpdateState(await window.pocketchatDesktop.checkUpdates()); } catch(e) { notify(e.message); }
};
let installingUpdate=false;
function clearUpdateDrafts(){drafts.clear();replyDrafts.clear();customDrafts.clear();pending.clear();$('message').value='';renderDraftEmojis();renderReplyDraft();if(!mediaBusy)closeMedia();publishTyping(false);}
async function restartToUpdate() {
  if (!window.pocketchatDesktop || !desktopUpdate?.ready) return;
  if(installingUpdate)return;installingUpdate=true;clearUpdateDrafts();
  try { await window.pocketchatDesktop.installUpdate(); } catch(e) { installingUpdate=false;notify(e.message); }
}
$('update-install').onclick = restartToUpdate;
$('update-banner-install').onclick = restartToUpdate;
if (window.pocketchatDesktop) {
  window.pocketchatDesktop.onUpdateState(renderUpdateState);
  window.pocketchatDesktop.updateState().then(renderUpdateState).catch(e => notify(e.message));
} else renderUpdateState({version:'1.4.0',repository:'',status:'Update controls are available in the installed Windows app',ready:false,busy:false});

$('friends-open').onclick=()=>{renderSocial();$('friends-dialog').showModal();refreshSocial().catch(e=>notify(e.message));};
$('friends-close').onclick=()=>$('friends-dialog').close();
$('person-close').onclick=()=>$('person-dialog').close();
$('room-settings-close').onclick=()=>$('room-settings-dialog').close();
$('room-settings-form').onsubmit=async event=>{event.preventDefault();await saveGroupSettings();};
$('group-avatar-file').onchange=()=>{groupAvatarFile=$('group-avatar-file').files[0]||null;if(groupAvatarFile)$('group-avatar-status').textContent='Picture ready. Save changes to apply it to everyone.';};
$('group-picture-remove').onclick=async()=>{
  const room=rooms.find(item=>item.id===roomSettingsId);if(!room||room.kind!=='group')return;
  $('group-picture-remove').disabled=true;
  try{const saved=checked(await client.from('rooms').update({avatar_data:null}).eq('id',room.id).eq('kind','group').select('id,name,avatar_data').single());Object.assign(room,saved);groupAvatarFile=null;$('group-avatar-file').value='';$('group-avatar-status').textContent='Group picture removed. Current members’ profile pictures are now used.';$('group-picture-remove').hidden=true;refreshRooms().catch(e=>notify(e.message));renderHeader();renderRooms();}
  catch(e){notify(e.message);}finally{$('group-picture-remove').disabled=false;}
};
$('room-leave').onclick=()=>leaveGroup().catch(e=>notify(e.message));
$('dm-close').onclick=()=>closeDirectMessage().catch(e=>notify(e.message));
$('moderation-open').onclick=()=>{if(!isAppAdmin)return;$('moderation-dialog').showModal();openModerationTab('logs');};
$('moderation-close').onclick=()=>$('moderation-dialog').close();

for(const tab of document.querySelectorAll('[data-social-tab]'))tab.onclick=()=>{socialTab=tab.dataset.socialTab;renderSocial();if(socialTab==='discover')loadDiscovery();};
$('friend-form').onsubmit=async event=>{
  event.preventDefault(); if(socialBusy || !me)return;
  const currentEpoch=epoch;socialBusy=true;$('friend-add').disabled=true;
  try {
    const name=username($('friend-username').value);
    checked(await client.rpc('social_action',{action:'request',other_username:name}));
    if(currentEpoch!==epoch)return;
    $('friend-username').value='';socialTab='requests';await refreshSocial();notify('Friend request sent.');
  } catch(e) { if(currentEpoch===epoch)notify(e.message); }
  finally { if(currentEpoch===epoch){socialBusy=false;$('friend-add').disabled=false;renderSocial();renderPerson();} }
};
$('avatar-file').onchange=()=>{const file=$('avatar-file').files[0];if(file)saveAvatar(file);};
$('avatar-remove').onclick=()=>saveAvatar(null);

// Games keep complete saves in chat_games; chat messages contain only a match ID.
function poolId(body){const m=typeof body==='string'&&body.match(/^\[\[tungchat-pool:v1\]\]([0-9a-f-]{36})$/i);return m?m[1]:null;}
let poolView=null,poolMatch=null,poolTimer=null,poolOpening=0,poolLiveChannels=[];
function closePool(){poolOpening++;for(const ch of poolLiveChannels)client?.removeChannel(ch).catch(()=>{});poolLiveChannels=[];poolView?.destroy();poolView=null;poolMatch=null;clearInterval(poolTimer);$('pool-dialog').close();}
function requestClosePool(){if(poolView?.isBusy()){notify('Wait for the shot to finish saving before closing.');return;}closePool();}
$('pool-dialog').addEventListener('cancel',event=>{event.preventDefault();requestClosePool();});
$('games-close').onclick=()=>$('games-dialog').close();
function poolThumbnail(){
 const canvas=node('canvas','game-thumbnail');canvas.width=360;canvas.height=180;canvas.setAttribute('role','img');canvas.setAttribute('aria-label','8-ball pool table');
 const c=canvas.getContext('2d');c.fillStyle='#583131';c.beginPath();c.roundRect(0,0,360,180,14);c.fill();const felt=c.createLinearGradient(0,0,360,180);felt.addColorStop(0,'#3b827d');felt.addColorStop(1,'#34756f');c.fillStyle=felt;c.fillRect(17,17,326,146);
 for(const x of [17,180,343])for(const y of [17,163]){c.fillStyle='#d9cfb6';c.beginPath();c.arc(x,y,13,0,7);c.fill();c.fillStyle='#081516';c.beginPath();c.arc(x,y,9,0,7);c.fill();}
 const ball=(x,y,color,n)=>{const g=c.createRadialGradient(x-3,y-3,1,x,y,9);g.addColorStop(0,'#fff');g.addColorStop(.3,color);g.addColorStop(1,'#182827');c.fillStyle=g;c.beginPath();c.arc(x,y,8,0,7);c.fill();if(n){c.fillStyle='#fff5db';c.beginPath();c.arc(x,y,4,0,7);c.fill();c.fillStyle='#212724';c.font='bold 6px sans-serif';c.textAlign='center';c.fillText(n,x,y+2);}};
 const colors=['#f4d160','#376f94','#d05556','#73577e','#da884b'];let n=1;for(let row=0;row<5;row++)for(let col=0;col<=row;col++)ball(230+row*14,90+(col-row/2)*16,n===5?'#151b20':colors[(n-1)%5],n++===5?'8':'');ball(90,90,'#f5efdf','');return canvas;
}
function gameSetup(mode){const list=$('games-list');list.replaceChildren();const back=node('button','','← All games');back.type='button';back.onclick=renderGameChoices;list.append(back);const title=mode==='pool'?'8-ball pool':mode==='chess'?'Chess':'Mini golf';list.append(node('h3','',title),mode==='pool'?poolThumbnail():mode==='chess'?ChessGame.thumbnail():Golf.thumbnail());let select=null;
 if(mode!=='pool'){const label=node('label','chess-time-label',mode==='chess'?'Time control':'Number of holes');select=node('select','');select.id=mode==='chess'?'chess-time-control':'golf-hole-count';for(const n of mode==='chess'?ChessGame.CONTROLS:[3,5]){const opt=node('option','',mode==='chess'?ChessGame.timeLabel(n):n+' holes');opt.value=n;select.append(opt);}label.append(select);list.append(label);}
 list.append(node('p','',mode==='pool'?'Standard 8-ball rules. Your opponent accepts and takes the break.':mode==='chess'?'Timed clocks keep running while the app is closed.':'Courses are shuffled for each match. Finish your hole before the other player goes.'));const send=node('button','primary','Send invitation');send.type='button';send.id='game-send';send.onclick=()=>mode==='pool'?createPool():mode==='chess'?createChess(Number(select.value)):createGolf(Number(select.value));list.append(send);
}
function renderGameChoices(){const list=$('games-list');list.replaceChildren();for(const [mode,label,thumbnail]of [['pool','8-ball pool',poolThumbnail],['chess','Chess',ChessGame.thumbnail],['golf','Mini golf',Golf.thumbnail],['four','Four in a Row',fourThumbnail]]){const b=node('button','game-choice');b.type='button';b.append(thumbnail(),node('strong','',label));b.onclick=()=>mode==='four'?fourSetup():gameSetup(mode);list.append(b);}list.append(node('p','hint','Anyone else in this chat can accept. Choose a game to customize your invitation.'));}
$('games-open').onclick=()=>{if(!me||!selected)return;renderGameChoices();$('games-dialog').showModal();};

async function createPool(){
 const roomId=selected,currentEpoch=epoch;if(!me||!roomId)return;
 for(const b of $('games-list').querySelectorAll('button'))b.disabled=true;
 try{const g=checked(await client.rpc('create_pool_game',{target_room:roomId}));
 if(currentEpoch!==epoch||selected!==roomId)return;$('games-dialog').close();await selectRoom(roomId);notify('8-ball invitation sent.');
 }catch(e){notify(e.message);}finally{for(const b of $('games-list').querySelectorAll('button'))b.disabled=false;}
}
async function openPool(id){
 closeGolf(); closeChess();closePool();const token=++poolOpening,currentEpoch=epoch;
 try{const g=checked(await client.from('chat_games').select('*').eq('id',id).single());
 if(token!==poolOpening||currentEpoch!==epoch)return;
 if(g.room_id!==selected)throw Error('Open this game from its original chat.');
 poolMatch=g;const viewer=me.id;
 if(!g.player2){
  const root=$('pool-root');root.replaceChildren();const title=node('h2','','8-ball pool'),text=node('p','',g.player1===viewer?'Waiting for someone in this chat to accept.':'Accept this game to play against '+personLabel(g.player1)+'.'),close=node('button','','Close');close.onclick=closePool;root.append(title,text);
  if(g.player1!==viewer){const accept=node('button','primary','Accept & play');accept.onclick=async()=>{accept.disabled=true;try{checked(await client.rpc('accept_pool_game',{game_id:id}));if(token===poolOpening)openPool(id);}catch(e){notify(e.message);if(token===poolOpening)openPool(id);}};root.append(accept);}
  root.append(close);$('pool-dialog').showModal();
  poolTimer=setInterval(async()=>{try{const row=checked(await client.from('chat_games').select('player2').eq('id',id).single());if(token===poolOpening&&row.player2)openPool(id);}catch{}},2000);return;
 }

 const winTotals=await loadWinCounts(g.state.players,true);if(token!==poolOpening||currentEpoch!==epoch)return;
 let liveSender=null,liveReady=false;
 for(const actor of g.state.players){
  const ch=client.channel('tungchat-pool:'+id+':'+actor,{config:{private:true,broadcast:{self:false,ack:false}}})
   .on('broadcast',{event:'preview'},({payload})=>{if(token===poolOpening&&epoch===currentEpoch&&actor===poolView?.getState().turn)poolView.receivePreview(payload);})
   .subscribe(status=>{if(actor===viewer)liveReady=status==='SUBSCRIBED';});
  poolLiveChannels.push(ch);if(actor===viewer)liveSender=ch;
 }
 poolView=Pool.mount($('pool-root'),{state:g.state,player:viewer,isOwner:isAppOwner,
 onPreview:payload=>{if(liveReady&&liveSender&&token===poolOpening&&epoch===currentEpoch)liveSender.send({type:'broadcast',event:'preview',payload}).catch(()=>{});},profiles:g.state.players.map(id=>({id,wins:winTotals[id]?.pool,name:displayPerson(id),avatar:hideNames(privacy,selected,selected)?null:validAvatar(personData(id)?.avatar_data)?personData(id).avatar_data:null})),onClose:requestClosePool,onDiscard:closePool,
 onRematch:()=>{if(!g.state.players.includes(viewer))return;closePool();createPool();},
 onShot:async(shot,end,base)=>{if(epoch!==currentEpoch)throw Error('Sign in again.');const row=checked(await client.rpc('submit_pool_shot',{game_id:id,expected_revision:base,shot_data:shot,end_state:end}));if(row.state.winner){refreshActiveGames();const totals=await loadWinCounts(row.state.players,true);if(token===poolOpening)poolView?.setWins(totals);}return row.state;}});
 $('pool-dialog').showModal();
 poolTimer=setInterval(async()=>{if(token!==poolOpening)return;try{const row=checked(await client.from('chat_games').select('*').eq('id',id).single());if(token===poolOpening){const wasOver=poolView?.getState().winner;poolView?.receive({state:row.state,shot:row.shot});if(row.state.winner&&!wasOver){const totals=await loadWinCounts(row.state.players,true);if(token===poolOpening)poolView?.setWins(totals);}}}catch{}},2500);
 }catch(e){notify(e.message);}
}

let emojiSelection=[0,0];
$('emoji-open').onclick=()=>{if(!me||!selected||$('message').disabled)return;emojiSelection=[$('message').selectionStart,$('message').selectionEnd];$('composer-emoji-search').value='';renderComposerEmoji();loadCustomEmojis(false);$('composer-emoji-dialog').showModal();$('composer-emoji-search').focus();};
$('composer-emoji-close').onclick=()=>{$('composer-emoji-dialog').close();$('message').focus();};
$('composer-emoji-search').oninput=renderComposerEmoji;
function renderComposerEmoji(){
 const list=$('composer-emoji-list');list.replaceChildren();const query=$('composer-emoji-search').value.trim().toLowerCase();renderCustomEmojis(list,query);
 for(const [category,choices]of Object.entries(EMOJI_CATEGORIES)){
  const matches=choices.filter(([emoji,keywords])=>(emoji+' '+keywords+' '+category).toLowerCase().includes(query));if(!matches.length)continue;
  list.append(node('h3','',category));const grid=node('div','emoji-grid');
  for(const [emoji,keywords]of matches){const b=node('button','',emoji);b.type='button';b.title=keywords;b.setAttribute('aria-label',keywords);b.onclick=()=>{const text=$('message'),[start,end]=emojiSelection;if(text.value.length-(end-start)+emoji.length>text.maxLength){notify('Message is too long.');return;}text.setRangeText(emoji,start,end,'end');text.dispatchEvent(new Event('input',{bubbles:true}));$('composer-emoji-dialog').close();text.focus();};grid.append(b);}list.append(grid);
 }
 if(!list.children.length)list.append(node('p','','No matching emojis.'));
}


// Chess transport: server timestamps and revisions are authoritative.
function chessId(body){const m=typeof body==='string'&&body.match(/^\[\[tungchat-chess:v1\]\]([0-9a-f-]{36}):(0|60|300|600|1800)$/i);return m?{id:m[1],seconds:Number(m[2])}:null;}
const chessDialog=node('dialog','');chessDialog.id='chess-dialog';const chessRoot=node('div','');chessDialog.append(chessRoot);document.body.append(chessDialog);
let chessView=null,chessTimer=null,chessToken=0,chessRow=null;
function closeChess(){chessToken++;clearInterval(chessTimer);chessTimer=null;chessView?.destroy();chessView=null;chessRow=null;chessDialog.close();}
function requestCloseChess(){if(chessView?.isBusy()){notify('Wait for the move to finish saving.');return;}closeChess();}
chessDialog.addEventListener('cancel',e=>{e.preventDefault();requestCloseChess();});
async function createChess(seconds){const room=selected,session=epoch;if(!me||!room)return;
 for(const b of $('games-list').querySelectorAll('button'))b.disabled=true;
 try{checked(await client.rpc('create_chess_game',{target_room:room,time_control:seconds}));if(epoch!==session||selected!==room)return;$('games-dialog').close();await selectRoom(room);notify('Chess invitation sent.');}catch(e){notify(e.message);}finally{for(const b of $('games-list').querySelectorAll('button'))b.disabled=false;}
}
async function openChess(id){
 closePool();closeChess();closeGolf();const token=++chessToken,session=epoch,viewer=me.id;let fetching=false;
 const current=()=>token===chessToken&&epoch===session;
 const read=async()=>{const start=performance.now(),packet=checked(await client.rpc('read_chess_game',{game_id:id}));return {...packet,serverNow:Number(packet.serverNow)+(performance.now()-start)/2};};
 const apply=packet=>{if(!current()||chessRow&&packet.revision<chessRow.revision)return;chessRow=packet;
  if(packet.room_id!==selected)throw Error('Open chess from its original chat.');
  if(packet.state){const newView=!chessView,wasOver=chessView?.getState().result;if(!chessView){chessRoot.replaceChildren();chessView=ChessGame.mount(chessRoot,{injectStyles:false,state:packet.state,player:viewer,serverNow:packet.serverNow,profiles:Object.values(packet.state.players).map(pid=>({id:pid,name:displayPerson(pid),avatar:hideNames(privacy,selected,selected)?null:validAvatar(personData(pid)?.avatar_data)?personData(pid).avatar_data:null})),onClose:requestCloseChess,
    onMove:async(move,end,base)=>{if(chessRow.state.moves.length!==base)throw Error('Game changed. Try again.');return action('move',move,end);},
    onAction:kind=>kind==='refresh'?read():action(kind)});}else chessView.receive(packet);if(newView||packet.state.result&&!wasOver)loadWinCounts(Object.values(packet.state.players),true).then(totals=>{if(current())chessView?.setWins(totals);});return;}
  chessRoot.replaceChildren();const box=node('div','card'),title=node('h2','','Chess'),time=node('p','',ChessGame.timeLabel(packet.seconds)),description=node('p','',packet.status==='cancelled'?'Invitation cancelled.':packet.declined.includes(viewer)?'You declined this invitation.':packet.player1===viewer?'Waiting for someone in this chat to accept.':'Accept to play. Colors are assigned randomly; White moves first.');
  box.append(title,time,description);
  const button=(text,kind)=>{const b=node('button','primary',text);b.type='button';b.onclick=async()=>{b.disabled=true;try{apply(await action(kind));}catch(e){notify(e.message);await refresh();}};box.append(b);};
  if(packet.status==='pending'){if(packet.player1===viewer)button('Cancel invitation','cancel');else if(!packet.declined.includes(viewer)){button('Accept & play','accept');button('Decline','decline');}}
  const close=node('button','','Close');close.onclick=closeChess;box.append(close);chessRoot.append(box);
 };
 const action=async(kind,move=null,end=null)=>{if(!current())throw Error('Game closed.');const started=performance.now(),rev=chessRow.revision;
  try{const packet=checked(await client.rpc('chess_action',{game_id:id,action:kind,expected_revision:rev,request_id:crypto.randomUUID(),move_data:move,end_state:end}));if(!current())throw Error('Game closed.');packet.serverNow=Number(packet.serverNow)+(performance.now()-started)/2;if(packet.revision>=chessRow.revision)chessRow=packet;if(packet.state?.result){refreshActiveGames();const totals=await loadWinCounts(Object.values(packet.state.players),true);if(current())chessView?.setWins(totals);}return packet;}
  catch(e){if(current())setTimeout(()=>refresh(),0);throw e;}
 };
 async function refresh(){if(!current()||fetching||chessView?.isBusy())return;fetching=true;try{apply(await read());}catch(e){if(current()&&chessView)chessView.networkError?.(e.message);}finally{fetching=false;}}
 try{apply(await read());if(!current())return;chessDialog.showModal();chessTimer=setInterval(refresh,1000);}catch(e){if(current()){closeChess();notify(e.message);}}
}


// Win totals come from a server-only, one-record-per-game ledger.
const winCache=new Map(),winRequests=new Map();
async function loadWinCounts(ids,force=false){
 if(!me)return {};ids=[...new Set(ids)].filter(Boolean);const stamp=Date.now(),session=epoch,result={};
 const missing=ids.filter(id=>force||!winCache.has(id)||winCache.get(id).epoch!==session||stamp-winCache.get(id).at>30000);
 if(missing.length){const key=session+':'+missing.slice().sort().join(',');let request=winRequests.get(key);
  if(!request){request=(async()=>{try{const rows=checked(await client.rpc('game_win_totals',{player_ids:missing}));if(epoch!==session)return;const counts={};for(const r of rows||[]){counts[r.player_id]||={pool:0,chess:0,golf:0};counts[r.player_id][r.mode]=Number(r.wins);}for(const id of missing)if(counts[id])winCache.set(id,{...counts[id],at:Date.now(),epoch:session});}catch{}finally{winRequests.delete(key);}})();winRequests.set(key,request);}
  await request;
 }
 for(const id of ids){const entry=winCache.get(id);if(entry?.epoch===session)result[id]={pool:entry.pool,chess:entry.chess,golf:entry.golf,four:entry.four||0};}return result;
}
function renderGameWins(container,id,hidden){
 if(!container)return;container.hidden=hidden;container.dataset.playerId=id||'';if(hidden||!id){container.replaceChildren();return;}const session=epoch;
 container.textContent='Loading wins…';loadWinCounts([id]).then(totals=>{if(epoch!==session||container.dataset.playerId!==id||container.hidden)return;container.replaceChildren();const scores=totals[id];if(!scores){container.textContent='Win totals unavailable';return;}for(const [mode,label]of [['pool','8-ball'],['chess','Chess'],['golf','Mini golf'],['four','Four in a Row']])container.append(node('span','',label+': '+scores[mode]+' wins'));});
}
const leaderboardDialog=node('dialog','leaderboard-dialog'),leaderboardCard=node('div','card'),leaderboardHeader=node('div','dialog-heading'),leaderboardClose=node('button','game-close-button'),leaderboardTabs=node('div','leaderboard-tabs'),leaderboardList=node('div','leaderboard-list');
leaderboardDialog.id='leaderboard-dialog';leaderboardClose.type='button';leaderboardClose.setAttribute('aria-label','Close leaderboards');leaderboardClose.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';leaderboardHeader.append(node('h2','','Win leaderboards'),leaderboardClose);leaderboardCard.append(leaderboardHeader,leaderboardTabs,leaderboardList);leaderboardDialog.append(leaderboardCard);document.body.append(leaderboardDialog);
const rankings=node('button','leaderboard-open','Leaderboards');rankings.type='button';rankings.onclick=()=>{$('games-dialog').close();openLeaderboards();};const gamesSide=node('aside','games-side-panel');gamesSide.append(node('h3','','Rankings'),rankings);$('games-list').after(gamesSide);
let leaderboardToken=0;
function closeLeaderboards(){leaderboardToken++;leaderboardDialog.close();leaderboardList.replaceChildren();}
leaderboardClose.onclick=closeLeaderboards;leaderboardDialog.addEventListener('cancel',e=>{e.preventDefault();closeLeaderboards();});
async function openLeaderboards(mode='pool'){
 if(!me)return;const token=++leaderboardToken,session=epoch;leaderboardTabs.replaceChildren();
 for(const [key,label]of [['pool','8-ball'],['chess','Chess'],['golf','Mini golf'],['four','Four in a Row']]){const b=node('button',key===mode?'primary':'',label);b.type='button';b.setAttribute('aria-pressed',String(key===mode));b.onclick=()=>openLeaderboards(key);leaderboardTabs.append(b);}
 leaderboardList.textContent='Loading wins…';if(!leaderboardDialog.open)leaderboardDialog.showModal();
 try{const rows=checked(await client.rpc('game_leaderboard',{game_mode:mode}));if(token!==leaderboardToken||epoch!==session)return;leaderboardList.replaceChildren();
  if(!rows?.length){leaderboardList.append(node('p','empty','No wins yet. Finish a game to get on the board.'));return;}
  for(const row of rows){const item=node('div','leaderboard-row'),rank=node('span','leaderboard-rank',Number(row.wins)>0?'#'+row.place:'—'),name=node('strong','',privacy==='all'?'Player '+row.player_id.slice(0,4):hideNames(privacy,selected,selected)?personLabel(row.player_id):row.username),score=node('span','leaderboard-score',row.wins+' wins');if(row.player_id===me.id)name.textContent+=' (you)';item.append(rank,name,score);leaderboardList.append(item);}
 }catch(e){if(token===leaderboardToken&&epoch===session)leaderboardList.textContent='Unable to load wins. '+e.message;}
}
$('games-close').classList.add('game-close-button');$('games-close').innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';


// Session heartbeats give one status per account, including multiple devices.
const presenceSession=crypto.randomUUID(),presenceMap=new Map();
let presenceTimer=null,activeGamesTimer=null,presenceBusy=false,dockToken=0;
const gameCardReconciledAt = new Map(), gameRoomsPreviouslyActive = new Set();
const activeGamesDock=node('section','active-games-dock');activeGamesDock.id='active-games-dock';activeGamesDock.setAttribute('aria-label','Active games in this chat');activeGamesDock.hidden=true;$('typing-indicator').before(activeGamesDock);
function paintPresenceElement(el){
 const id=el.dataset.presenceId;if(!id)return;const data=presenceMap.get(id),known=data&&Date.now()-data.at<90000,state=known?(data.online?'online':'offline'):'unknown';
 el.dataset.online=state;const label=known?(data.online?'Online':'Offline'):'Status unavailable';
 if(el.classList.contains('presence-label'))el.textContent=label;
 else{if(!el.dataset.presenceBaseTitle)el.dataset.presenceBaseTitle=el.title||' ';el.title=el.dataset.presenceBaseTitle.trim()?(el.dataset.presenceBaseTitle.trim()+' · '+label):label;el.setAttribute('aria-description',label);}
}
function paintPresence(){document.querySelectorAll('[data-presence-id]').forEach(paintPresenceElement);const label=$('person-presence');if(label){label.dataset.presenceId=personId||'';if(personId)paintPresenceElement(label);}}
async function presenceTick(){
 if(!me||presenceBusy)return;presenceBusy=true;const session=epoch;
 try{
  checked(await client.rpc('touch_presence',{session_id:presenceSession,is_online:true}));
  // Remain online while minimized, but do not download everyone else's
  // presence until the user can actually see those indicators.
  if(document.visibilityState==='visible'){
   const ids=[...new Set([me.id,...people.keys(),...rooms.flatMap(r=>r.room_members.map(m=>m.user_id))])].slice(0,200);
   const rows=checked(await client.rpc('presence_status',{player_ids:ids}));
   if(session!==epoch)return;
   for(const row of rows||[])presenceMap.set(row.player_id,{online:row.online,at:Date.now()});
  }
 }
 catch{}finally{presenceBusy=false;if(session===epoch)paintPresence();}
}
function startSocialLive(){stopSocialLive();impInviteCount();impInviteTimer=setInterval(impInviteCount,2500);refreshJoinableCalls();callListTimer=setInterval(()=>{if(document.visibilityState==='visible')refreshJoinableCalls();},8000);presenceTick();refreshActiveGames();presenceTimer=setInterval(presenceTick,20000);activeGamesTimer=setInterval(()=>{if(document.visibilityState==='visible')refreshActiveGames();},10000);}
function stopSocialLive(){clearInterval(impInviteTimer);$('imp-invites').textContent='';clearInterval(callListTimer);joinableCalls.clear();clearInterval(presenceTimer);clearInterval(activeGamesTimer);presenceMap.clear();gameCardReconciledAt.clear();gameRoomsPreviouslyActive.clear();dockToken++;activeGamesDock.replaceChildren();activeGamesDock.hidden=true;}
async function refreshActiveGames(){
 const id=selected,session=epoch,token=++dockToken;if(!me||!id){activeGamesDock.hidden=true;return;}if(activeGamesDock.dataset.room!==id){activeGamesDock.replaceChildren();activeGamesDock.hidden=true;activeGamesDock.dataset.room=id;}
 try{
   const rows=checked(await client.rpc('active_chat_games',{target_room:id}));
   if(token!==dockToken||session!==epoch||selected!==id)return;
   const hasActive=Boolean(rows?.length),wasActive=gameRoomsPreviouslyActive.has(id);
   const lastCheck=gameCardReconciledAt.get(id)||0;
   // Active games stay responsive. Inactive game cards reconcile less often,
   // but a transition from playing to finished always checks immediately.
   if(needsGameCardReconcile(hasActive,wasActive,lastCheck,Date.now())){
     await refreshFinishedGameCards(id,session);
     if(token!==dockToken||session!==epoch||selected!==id)return;
     gameCardReconciledAt.set(id,Date.now());
   }
   if(hasActive)gameRoomsPreviouslyActive.add(id);
   else gameRoomsPreviouslyActive.delete(id);
   if(token!==dockToken||session!==epoch||selected!==id)return;const h=$('history'),keepBottom=h.scrollHeight-h.scrollTop-h.clientHeight<100;activeGamesDock.replaceChildren();activeGamesDock.hidden=!rows?.length;if(keepBottom)settleChatScroll();if(!rows?.length)return;
 const heading=node('small','','Active games'),strip=node('div','active-game-shortcuts');activeGamesDock.append(heading,strip);
 for(const row of rows.slice(0,2)){const b=node('button','active-game-shortcut',row.label+(row.turn_id===me.id?' · Your turn':''));b.type='button';b.onclick=()=>row.mode==='four'?jumpToFour(row.game_id):row.mode==='golf'?openGolf(row.game_id):row.mode==='chess'?openChess(row.game_id):openPool(row.game_id);strip.append(b);}
 }catch{if(token===dockToken){activeGamesDock.hidden=true;}}
}
// Private images and a personal, account-synced emoji inventory.
let customEmojis=[],mediaBusy=false,mediaDraft=null,mediaToken=0;
const mediaCache=new Map(),mediaRequests=new Map(),mediaMetadata=new Map();
let emojiLoadedAt=0,emojiLoadRequest=null;
const imageInput=node('input','');imageInput.type='file';imageInput.accept='image/jpeg,image/png,image/webp';imageInput.hidden=true;document.body.append(imageInput);
const imageButton=node('button','games-button');imageButton.type='button';imageButton.id='image-open';imageButton.title='Send image';imageButton.setAttribute('aria-label','Send image');imageButton.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 6-6 4 4 3-3 5 5"/></svg>';$('emoji-open').after(imageButton);imageButton.onclick=()=>{if(me&&selected&&!mediaBusy)imageInput.click();};
const mediaDialog=node('dialog','media-dialog');mediaDialog.id='media-dialog';const mediaHeading=node('h2','','Send image'),mediaPreview=node('img','media-preview'),mediaName=node('input',''),mediaStatus=node('p','hint'),mediaActions=node('div','dialog-actions'),mediaCancel=node('button','','Cancel'),mediaSend=node('button','primary','Send image');mediaName.maxLength=60;mediaName.placeholder='Emoji name';mediaName.setAttribute('aria-label','Emoji name');mediaActions.append(mediaCancel,mediaSend);mediaDialog.append(mediaHeading,mediaPreview,mediaName,mediaStatus,mediaActions);document.body.append(mediaDialog);
function closeMedia(){if(mediaBusy)return;mediaToken++;if(mediaDraft)URL.revokeObjectURL(mediaDraft.url);mediaDraft=null;mediaPreview.removeAttribute('src');mediaDialog.close();}
mediaCancel.onclick=closeMedia;mediaDialog.oncancel=e=>{e.preventDefault();closeMedia();};
async function chooseMedia(file,kind){if(!file||!me||mediaBusy)return;const user=me.id,room=selected,session=epoch;try{const blob=await prepareMedia(file,kind);if(epoch!==session||me?.id!==user)return;closeMedia();const url=URL.createObjectURL(blob);mediaDraft={blob,url,kind,room,user,session,id:crypto.randomUUID(),messageId:crypto.randomUUID(),uploaded:false,created:false};mediaPreview.src=url;mediaName.value=file.name.replace(/\.[^.]+$/,'').slice(0,60)||'Custom emoji';mediaName.hidden=kind!=='emoji';mediaHeading.textContent=kind==='emoji'?'Add custom emoji':'Send image';mediaSend.textContent=kind==='emoji'?'Save emoji':'Send image';mediaStatus.textContent=kind==='emoji'?'Saved to your account. Click it in your emoji menu to add it to your draft.':'This image will be shared with this chat.';mediaDialog.showModal();}catch(e){notify(e.message);}}
imageInput.onchange=()=>{chooseMedia(imageInput.files[0],'image');imageInput.value='';};
const emojiUpload=node('button','custom-emoji-upload','Upload custom emoji'),emojiInput=node('input','');emojiUpload.type='button';emojiInput.type='file';emojiInput.accept=imageInput.accept;emojiInput.hidden=true;$('composer-emoji-search').after(emojiUpload,emojiInput);emojiUpload.onclick=()=>emojiInput.click();emojiInput.onchange=()=>{const file=emojiInput.files[0];$('composer-emoji-dialog').close();chooseMedia(file,'emoji');emojiInput.value='';};
async function loadCustomEmojis(force=true){
 if(!me||(!force&&Date.now()-emojiLoadedAt<60000))return;
 if(emojiLoadRequest)return emojiLoadRequest;
 const session=epoch;
 const request=(async()=>{try{const rows=checked(await client.rpc('my_custom_emojis'));if(epoch!==session)return;customEmojis=rows;emojiLoadedAt=Date.now();for(const row of rows)mediaMetadata.set(row.id,row);
 // One storage request for the collection instead of two requests per emoji.
 const missing=rows.filter(row=>!mediaCache.has(row.id)||mediaCache.get(row.id).until<Date.now());
 for(let i=0;i<missing.length;i+=100){const batch=missing.slice(i,i+100);const links=checked(await client.storage.from('tungchat-media').createSignedUrls(batch.map(row=>row.owner_id+'/'+row.id+'.webp'),600));if(epoch!==session)return;links.forEach((link,j)=>{if(link.signedUrl)mediaCache.set(batch[j].id,{...batch[j],url:link.signedUrl,until:Date.now()+540000});});}
 if($('composer-emoji-dialog').open)renderComposerEmoji();
 }catch(e){if(epoch===session)notify('Could not load custom emojis. '+e.message);}})();emojiLoadRequest=request;try{await request;}finally{if(emojiLoadRequest===request)emojiLoadRequest=null;}
}
async function getMedia(id){const cached=mediaCache.get(id);if(cached&&cached.until>Date.now())return cached;if(mediaRequests.has(id))return mediaRequests.get(id);const session=epoch;
 const request=(async()=>{const row=mediaMetadata.get(id)||checked(await client.from('chat_media').select('id,owner_id,kind,name').eq('id',id).single());const signed=checked(await client.storage.from('tungchat-media').createSignedUrl(row.owner_id+'/'+row.id+'.webp',600));const result={...row,url:signed.signedUrl,until:Date.now()+540000};if(epoch===session)mediaCache.set(id,result);return result;})();mediaRequests.set(id,request);try{return await request;}finally{if(mediaRequests.get(id)===request)mediaRequests.delete(id);}}
function showMedia(container,id){
 const session=epoch;
 const paint=row=>{if(epoch!==session)return;container.replaceChildren();container.classList.add('shared-media');container.classList.toggle('custom-emoji-message',row.kind==='emoji');const img=node('img','');img.src=row.url;img.alt=row.name;img.loading=row.kind==='emoji'?'eager':'lazy';img.decoding='async';img.onerror=()=>{container.replaceChildren(node('span','hint','Image unavailable — reopen the chat to retry.'));mediaCache.delete(id);};if(row.kind==='emoji')img.dataset.emojiId=id;container.append(img);};
 const cached=mediaCache.get(id);if(cached&&cached.until>Date.now()){paint(cached);return;}
 container.replaceChildren(node('span','hint','…'));getMedia(id).then(row=>{if(container.isConnected)paint(row);}).catch(()=>{if(epoch===session&&container.isConnected)container.replaceChildren(node('span','hint','Image unavailable.'));});
}
async function sendMediaReference(id,room,messageId=crypto.randomUUID()){
 const session=epoch;let result=await client.from('messages').insert({id:messageId,room_id:room,body:MEDIA_PREFIX+id}).select(MESSAGE_FIELDS).single();if(result.error?.code==='23505')result=await client.from('messages').select(MESSAGE_FIELDS).eq('id',messageId).single();const sent=checked(result);if(epoch===session&&selected===room){mergeMessage(sent);renderMessages(true);}return sent;
}
mediaSend.onclick=async()=>{const draft=mediaDraft;if(!draft||mediaBusy||epoch!==draft.session)return;const name=mediaName.value.trim()||'Image';mediaBusy=true;mediaSend.disabled=mediaCancel.disabled=true;mediaStatus.textContent='Uploading…';try{
 if(!draft.created){checked(await client.from('chat_media').insert({id:draft.id,owner_id:draft.user,room_id:draft.kind==='image'?draft.room:null,kind:draft.kind,name}).select('id').single());draft.created=true;}
 if(epoch!==draft.session)throw Error('Account changed.');
 if(!draft.uploaded){const path=draft.user+'/'+draft.id+'.webp',result=await client.storage.from('tungchat-media').upload(path,draft.blob,{contentType:'image/webp',upsert:false});if(result.error){const check=await client.storage.from('tungchat-media').createSignedUrl(path,60);if(check.error)throw result.error;}draft.uploaded=true;}
 if(epoch!==draft.session)throw Error('Account changed.');
 if(draft.kind==='image')await sendMediaReference(draft.id,draft.room,draft.messageId);else await loadCustomEmojis();
 mediaBusy=false;closeMedia();if(draft.kind==='emoji'){renderComposerEmoji();$('composer-emoji-dialog').showModal();}notify(draft.kind==='emoji'?'Custom emoji saved.':'Image sent.');
 }catch(e){mediaStatus.textContent=/row.level security/i.test(e.message)?'Upload permissions need the included database update. Run the latest Cove SQL, then retry.':'Not confirmed: '+e.message+' You can retry.';}finally{mediaBusy=false;mediaSend.disabled=mediaCancel.disabled=false;}};
let emojiContextMenu;
function dismissEmojiMenu(){emojiContextMenu?.remove();emojiContextMenu=null;}
function openEmojiMenu(event,button,row){
  event.preventDefault();dismissEmojiMenu();
  const menu=node('div','emoji-context-menu'),del=node('button','','Delete');
  menu.setAttribute('role','menu');del.setAttribute('role','menuitem');del.type='button';menu.append(del);
  $('composer-emoji-dialog').append(menu);emojiContextMenu=menu;
  const anchor=button.getBoundingClientRect();
  menu.style.left=Math.max(4,Math.min(event.clientX||anchor.left,innerWidth-menu.offsetWidth-4))+'px';
  menu.style.top=Math.max(4,Math.min(event.clientY||anchor.bottom,innerHeight-menu.offsetHeight-4))+'px';
  del.focus();del.onclick=async()=>{dismissEmojiMenu();try{checked(await client.rpc('remove_custom_emoji',{emoji_id:row.id}));await loadCustomEmojis();}catch(e){notify(e.message);}};
}
document.addEventListener('pointerdown',e=>{if(emojiContextMenu&&!emojiContextMenu.contains(e.target))dismissEmojiMenu();},true);
$('composer-emoji-dialog').addEventListener('close',dismissEmojiMenu);
document.addEventListener('keydown',e=>{if(emojiContextMenu&&e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();dismissEmojiMenu();}},true);
function renderCustomEmojis(list,query){
  const rows=customEmojis.filter(row=>row.name.toLowerCase().includes(query));if(!rows.length)return;
  list.append(node('h3','','Your emojis'));const grid=node('div','custom-emoji-grid');
  for(const row of rows){const button=node('button','custom-emoji-send');button.type='button';button.title='Insert '+row.name+' · Right-click to delete';button.setAttribute('aria-label','Insert '+row.name);showMedia(button,row.id);
    button.onclick=()=>{insertCustomEmoji(row);$('composer-emoji-dialog').close();};button.oncontextmenu=e=>openEmojiMenu(e,button,row);button.onkeydown=e=>{if(e.key==='ContextMenu'||(e.shiftKey&&e.key==='F10'))openEmojiMenu(e,button,row);};grid.append(button);
  }list.append(grid);
}
const customDrafts=new Map();
function insertCustomEmoji(row){if(!selected)return;let refs=customDrafts.get(selected);if(!refs){refs=new Map();customDrafts.set(selected,refs);}let alias='custom_'+row.name.toLowerCase().replace(/[^a-z0-9_]/g,'_').slice(0,24);if(refs.has(alias)&&refs.get(alias)!==row.id)alias+='_'+row.id.slice(0,6);refs.set(alias,row.id);const input=$('message');input.setRangeText(':'+alias+':',...emojiSelection,'end');input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();}
function encodeCustomDraft(text,room){for(const [alias,id]of customDrafts.get(room)||[])text=text.split(':'+alias+':').join('[[emoji:'+id+']]');return text;}
function renderInlineEmojis(container,text){container.replaceChildren();let index=0;for(const match of text.matchAll(/\[\[emoji:([0-9a-f-]{36})\]\]/g)){container.append(document.createTextNode(text.slice(index,match.index)));const span=node('span','inline-custom-emoji');container.append(span);showMedia(span,match[1]);index=match.index+match[0].length;}container.append(document.createTextNode(text.slice(index)));}
const draftEmojiPreview=node('div','draft-emoji-preview');draftEmojiPreview.hidden=true;$('message').after(draftEmojiPreview);
function renderDraftEmojis(){const text=encodeCustomDraft($('message').value,selected);draftEmojiPreview.hidden=!text.includes('[[emoji:');if(!draftEmojiPreview.hidden)renderInlineEmojis(draftEmojiPreview,text);}
$('message').addEventListener('input',renderDraftEmojis);$('composer').addEventListener('submit',()=>setTimeout(renderDraftEmojis,100));
const pictureDialog=node('dialog','picture-dialog'),picture=node('img','picture-full'),pictureTitle=node('h2',''),pictureClose=node('button','','Close'),pictureSave=node('button','primary','Add to collection');pictureDialog.append(pictureTitle,picture,pictureSave,pictureClose);document.body.append(pictureDialog);pictureClose.onclick=()=>pictureDialog.close();
function viewPicture(url,title,emojiId=null){picture.src=url;picture.alt=title;pictureTitle.textContent=title;pictureSave.hidden=!emojiId;pictureSave.disabled=false;pictureSave.textContent='Add to collection';pictureSave.onclick=async()=>{pictureSave.disabled=true;try{checked(await client.rpc('save_custom_emoji',{emoji_id:emojiId}));pictureSave.textContent='Added to collection';await loadCustomEmojis();}catch(e){notify(e.message);pictureSave.disabled=false;}};if(!pictureDialog.open)pictureDialog.showModal();}
document.addEventListener('click',e=>{if(e.target.closest('.call-tile'))return;const img=e.target.closest('img')||e.target.closest('[data-presence-id]')?.querySelector('img');if(!img||img===picture||img.classList.contains('group-avatar-picture'))return;if(img.dataset.emojiId&&img.closest('.message')){e.preventDefault();e.stopImmediatePropagation();viewPicture(img.src,img.alt||'Custom emoji',img.dataset.emojiId);}else {const owner=img.closest('[data-presence-id]')?.dataset.presenceId;if(owner&&personData(owner)){e.preventDefault();e.stopImmediatePropagation();openPerson(owner);}}},true);
// Mini golf uses the same invitation / atomic revision / saved replay flow as pool.
function golfId(body){const m=typeof body==='string'&&body.match(/^\[\[sahur-golf:v1\]\]([0-9a-f-]{36})$/i);return m?m[1]:null;}
const golfDialog=node('dialog','');golfDialog.id='golf-dialog';const golfRoot=node('div','');golfDialog.append(golfRoot);document.body.append(golfDialog);
let golfLiveChannels=[];
let golfView=null,golfTimer=null,golfToken=0,golfPolling=false;
function closeGolf(){for(const ch of golfLiveChannels)client?.removeChannel(ch);golfLiveChannels=[];golfToken++;clearInterval(golfTimer);golfTimer=null;golfView?.destroy();golfView=null;golfDialog.close();}
function requestCloseGolf(){if(golfView?.isBusy()){notify('Wait for the shot to finish saving before closing.');return;}closeGolf();}
golfDialog.addEventListener('cancel',e=>{e.preventDefault();requestCloseGolf();});
async function createGolf(holes=3){const room=selected,session=epoch;if(!me||!room)return;for(const b of $('games-list').querySelectorAll('button'))b.disabled=true;try{checked(await client.rpc('create_golf_game',{target_room:room,holes}));if(epoch!==session||selected!==room)return;$('games-dialog').close();await selectRoom(room);notify('Mini golf invitation sent.');}catch(e){notify(e.message);}finally{for(const b of $('games-list').querySelectorAll('button'))b.disabled=false;}}
async function openGolf(id){closePool();closeChess();closeGolf();const token=++golfToken,session=epoch,viewer=me?.id;if(!viewer)return;
 const current=()=>token===golfToken&&session===epoch;
 try{const row=checked(await client.from('golf_games').select('*').eq('id',id).single());if(!current())return;if(row.room_id!==selected)throw Error('Open the original chat first');
 if(!row.player2){golfRoot.replaceChildren();const card=node('div','golf-shell'),title=node('h2','','Mini golf · '+(row.hole_count||9)+' holes'),text=node('p','',row.player1===viewer?'Waiting for someone in this chat to accept.':'Accept and take the first putt.'),close=node('button','','Close');close.onclick=closeGolf;card.append(title,Golf.thumbnail(),text);if(row.player1!==viewer){const accept=node('button','primary','Accept & play');accept.onclick=async()=>{accept.disabled=true;try{checked(await client.rpc('accept_golf_game',{game_id:id}));if(current())openGolf(id);}catch(e){notify(e.message);accept.disabled=false;}};card.append(accept);}card.append(close);golfRoot.append(card);golfDialog.showModal();golfTimer=setInterval(async()=>{try{const next=checked(await client.from('golf_games').select('player2').eq('id',id).single());if(current()&&next.player2)openGolf(id);}catch{}},2000);return;}
 const totals=await loadWinCounts(row.state.players,true);if(!current())return;
 let liveSender=null,liveReady=false;
 for(const actor of row.state.players){const ch=client.channel('sahur-golf:'+id+':'+actor,{config:{private:true,broadcast:{self:false,ack:false}}}).on('broadcast',{event:'preview'},({payload})=>{if(current()&&actor===golfView?.getState().turn)golfView.receivePreview(payload);}).subscribe(status=>{if(actor===viewer)liveReady=status==='SUBSCRIBED';});golfLiveChannels.push(ch);if(actor===viewer)liveSender=ch;}
 golfView=Golf.mount(golfRoot,{injectStyles:false,state:row.state,player:viewer,isOwner:isAppOwner,onPreview:payload=>{if(current()&&liveReady&&liveSender)liveSender.send({type:'broadcast',event:'preview',payload}).catch(()=>{});},profiles:row.state.players.map(pid=>({id:pid,name:displayPerson(pid),wins:totals[pid]?.golf,avatar:privacy==='off'&&validAvatar(personData(pid)?.avatar_data)?personData(pid).avatar_data:null})),onClose:requestCloseGolf,onDiscard:closeGolf,onRematch:()=>{closeGolf();createGolf(row.hole_count===5?5:3);},onShot:async(shot,end,base)=>{if(!current())throw Error('Game closed');const next=checked(await client.rpc('submit_golf_shot',{game_id:id,expected_revision:base,shot_data:shot,end_state:end}));if(!current())throw Error('Game closed');refreshActiveGames();if(next.state.finished){const wins=await loadWinCounts(next.state.players,true);if(current())golfView?.setWins(wins);}return next.state;}});golfDialog.showModal();
 golfTimer=setInterval(async()=>{if(golfPolling)return;golfPolling=true;try{const next=checked(await client.from('golf_games').select('*').eq('id',id).single());if(!current())return;const wasFinished=golfView.getState().finished;golfView.receive(next);if(next.state.finished&&!wasFinished){refreshActiveGames();const wins=await loadWinCounts(next.state.players,true);if(current())golfView?.setWins(wins);}}catch(e){if(current())notify('Golf connection interrupted: '+e.message);}finally{golfPolling=false;}},2000);
 }catch(e){if(current())notify(e.message);}}

$('composer-emoji-dialog').addEventListener('dragover',e=>{e.preventDefault();});
$('composer-emoji-dialog').addEventListener('drop',e=>{e.preventDefault();const file=e.dataTransfer?.files?.[0];if(file){$('composer-emoji-dialog').close();chooseMedia(file,'emoji');}});
emojiUpload.textContent='Add emoji image';emojiUpload.title='Choose an image, or drop one into this menu';


const shortcodeMenu=node('div','shortcode-menu');shortcodeMenu.id='shortcode-menu';shortcodeMenu.hidden=true;shortcodeMenu.setAttribute('role','listbox');shortcodeMenu.setAttribute('aria-label','Matching emojis');$('message').before(shortcodeMenu);$('message').setAttribute('aria-controls','shortcode-menu');let shortcodeMatches=[],shortcodeIndex=0,shortcodeStart=0;
function closeShortcodes(){shortcodeMenu.hidden=true;$('message').setAttribute('aria-expanded','false');$('message').removeAttribute('aria-activedescendant');}
function selectShortcode(index){const entry=shortcodeMatches[index],input=$('message');if(!entry)return;input.setRangeText(entry.emoji,shortcodeStart,input.selectionStart,'end');closeShortcodes();input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();}
function markShortcode(){[...shortcodeMenu.children].forEach((b,i)=>b.setAttribute('aria-selected',String(i===shortcodeIndex)));const active=shortcodeMenu.children[shortcodeIndex];if(active){$('message').setAttribute('aria-activedescendant',active.id);active.scrollIntoView({block:'nearest'});}}
function updateShortcodes(){const input=$('message');if(input.selectionStart!==input.selectionEnd)return closeShortcodes();const prefix=input.value.slice(0,input.selectionStart),match=prefix.match(/(?:^|\s):([a-z0-9_+-]*)$/i);if(!match)return closeShortcodes();shortcodeStart=prefix.length-match[1].length-1;shortcodeMatches=shortcuts.matchShortcodes(match[1]);shortcodeIndex=0;shortcodeMenu.replaceChildren();if(!shortcodeMatches.length)return closeShortcodes();for(const [i,entry]of shortcodeMatches.entries()){const b=node('button','');b.type='button';b.id='shortcode-option-'+i;b.setAttribute('role','option');b.append(node('span','',entry.emoji),node('span','',':'+entry.name+':'));b.onmousedown=e=>e.preventDefault();b.onclick=()=>selectShortcode(i);shortcodeMenu.append(b);}shortcodeMenu.hidden=false;input.setAttribute('aria-expanded','true');markShortcode();}
$('message').addEventListener('input',updateShortcodes);$('message').addEventListener('click',updateShortcodes);$('message').addEventListener('blur',()=>setTimeout(closeShortcodes,150));$('message').addEventListener('keydown',e=>{if(shortcodeMenu.hidden||e.isComposing)return;if(['ArrowDown','ArrowUp','Enter','Tab','Escape'].includes(e.key)){e.preventDefault();e.stopImmediatePropagation();if(e.key==='Escape')closeShortcodes();else if(e.key==='Enter'||e.key==='Tab')selectShortcode(shortcodeIndex);else{shortcodeIndex=(shortcodeIndex+(e.key==='ArrowDown'?1:-1)+shortcodeMatches.length)%shortcodeMatches.length;markShortcode();}}},true);

const groupInviteBox=node('section','group-invite-box');groupInviteBox.id='group-invite-box';$('room-leave').before(groupInviteBox);
function renderGroupInvites(room){groupInviteBox.replaceChildren();groupInviteBox.hidden=room.kind!=='group';if(room.kind!=='group')return;groupInviteBox.append(node('h3','','Add people'));const input=node('input','');input.placeholder='Username';input.setAttribute('aria-label','Username to add to group');input.maxLength=24;const add=node('button','primary','Add to group'),status=node('p','hint','New members can see this group’s existing messages.');add.type='button';add.onclick=async()=>{const session=epoch;if(!input.value.trim())return;add.disabled=true;try{checked(await client.rpc('add_group_member',{target_room:room.id,other_username:input.value.trim()}));if(session!==epoch)return;await refreshRooms();await refreshSocial();status.textContent='Member added.';input.value='';}catch(e){status.textContent=e.message;}finally{add.disabled=false;}};input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();add.click();}};groupInviteBox.append(input,add,status);}

// Keep the latest message visible when the dock/composer or loaded images change height.
let chatScrollPinned=true,chatScrollFrame=0;
function settleChatScroll(){const room=selected;cancelAnimationFrame(chatScrollFrame);chatScrollFrame=requestAnimationFrame(()=>{if(selected!==room)return;const h=$('history');h.scrollTop=h.scrollHeight;chatScrollPinned=true;});}
$('history').addEventListener('scroll',()=>{
  const h=$('history');chatScrollPinned=h.scrollHeight-h.scrollTop-h.clientHeight<80;
  if(!chatScrollPinned)cancelAnimationFrame(chatScrollFrame);
  // Automatically load older history just before the top is reached.
  if(h.scrollTop<180 && selected && hasOlder && !loading) {
    clearTimeout(chatOlderTimer);
    chatOlderTimer=setTimeout(()=>loadHistory(true).catch(e=>notify(e.message)),120);
  }
},{passive:true});
new ResizeObserver(()=>{if(chatScrollPinned)settleChatScroll();}).observe($('history'));
$('history').addEventListener('load',()=>{if(chatScrollPinned)settleChatScroll();},true);

$('video-call').onclick=()=>{if(selected)callView?.start(selected,true);};
$('voice-call').onclick=()=>{if(selected)callView?.start(selected,false);};

const moderationTabs=node('div','moderation-tabs'),logsTab=node('button','','Logs'),ipsTab=node('button','','IP information'),adminsTab=node('button','','Admins'),logsPanel=node('div','moderation-logs');logsTab.type=ipsTab.type=adminsTab.type='button';moderationTabs.append(logsTab,ipsTab,adminsTab);$('moderation-status').before(moderationTabs);$('moderation-list').after(logsPanel);let logCursor=null;
logsTab.onclick=()=>openModerationTab('logs');ipsTab.onclick=()=>openModerationTab('ips');adminsTab.onclick=()=>openModerationTab('admins');
async function openModerationTab(tab){if(!isAppAdmin)return;adminsTab.hidden=!isAppOwner;for(const [b,t]of[[logsTab,'logs'],[ipsTab,'ips'],[adminsTab,'admins']])b.setAttribute('aria-pressed',String(t===tab));$('moderation-list').hidden=tab!=='ips';logsPanel.hidden=tab==='ips';logsPanel.replaceChildren();$('moderation-status').textContent='';if(tab==='ips'){renderModeration();return;}if(tab==='logs'){logCursor=null;await loadLogPage();return;}if(!isAppOwner)return;try{const input=node('input','');input.placeholder='Username';const grant=node('button','primary','Grant admin');grant.onclick=async()=>{try{checked(await client.rpc('set_app_admin',{username_input:input.value,enabled:true}));openModerationTab('admins');}catch(e){notify(e.message);}};logsPanel.append(node('p','hint','Admins can see activity logs and IP information. Account deletion and admin management stay owner-only.'),input,grant);for(const r of checked(await client.rpc('list_app_admins'))){const row=node('div','admin-row'),remove=node('button','','Remove');row.append(node('span','',privacy==='off'?r.username:'Admin'),remove);remove.onclick=async()=>{try{checked(await client.rpc('set_app_admin',{username_input:r.username,enabled:false}));openModerationTab('admins');}catch(e){notify(e.message);}};logsPanel.append(row);}}catch(e){notify(e.message);}}
async function loadLogPage(){try{const rows=checked(await client.rpc('moderation_logs',{before_id:logCursor}));logsPanel.querySelector('.logs-more')?.remove();for(const row of rows){const entry=node('div','activity-row');entry.append(node('time','',new Date(row.at).toLocaleString()),node('strong','',privacy==='off'?(row.username||'System'):(row.actor?'Person '+row.actor.slice(0,8):'System')),node('span','',row.action+(row.room_id?' · '+(privacy!=='off'?(row.destination_kind==='group'?'Group chat':'Direct message'):(row.destination_kind==='group'?'Group: ':'To: ')+(row.destination||'Chat unavailable')):'')));logsPanel.append(entry);}if(rows.length===100){logCursor=rows.at(-1).id;const more=node('button','logs-more','Load older');more.onclick=()=>{more.disabled=true;loadLogPage();};logsPanel.append(more);}if(!rows.length&&!logsPanel.children.length)logsPanel.append(node('p','hint','No activity logged yet.'));$('moderation-status').textContent='Activity from the last 30 days. Message contents and call media are not copied into logs.';}catch(e){$('moderation-status').textContent='Logs unavailable: '+e.message;}}

// Screen/window selection is shown only for a user-initiated capture request.
window.pocketchatDesktop?.onCapture?.(request=>{
  const existing=document.getElementById('screen-share-picker');
  if(request.closed){if(existing?.dataset.request===request.id){existing.close();existing.remove();}return;}
  existing?.remove();
  const dialog=node('dialog','screen-share-picker');dialog.id='screen-share-picker';dialog.dataset.request=request.id;
  const card=node('div','card'),grid=node('div','screen-share-sources'),cancel=node('button','','Cancel');
  card.append(node('h2','','Share a screen or window'),grid,cancel);dialog.append(card);
  const choose=id=>window.pocketchatDesktop.selectCapture(request.id,id).catch(e=>notify(e.message));
  for(const source of request.sources){const button=node('button',''),img=node('img','');button.type='button';img.src=source.thumbnail;img.alt='';button.append(img,node('span','',source.name));button.onclick=()=>choose(source.id);grid.append(button);}
  cancel.onclick=()=>choose(null);dialog.oncancel=e=>{e.preventDefault();choose(null);};
  document.body.append(dialog);dialog.showModal();
});

// Account settings and read acknowledgements are authorized by the backend.
$('account-edit-form').onsubmit=async event=>{event.preventDefault();const form=event.currentTarget,button=form.querySelector('button'),status=$('account-edit-status');button.disabled=true;const session=epoch;try{const name=username($('account-username').value),password=$('account-new-password').value;const result=checked(await client.functions.invoke('update-account',{body:{username:name,currentPassword:$('account-current-password').value,newPassword:password||undefined}}));if(result.error)throw Error(result.error);if(epoch!==session)return;profile.username=name;people.set(me.id,profile);refreshPeopleViews();status.textContent='Account updated. Use your new details next time you sign in.';form.querySelectorAll('input[data-password-field]').forEach(input=>input.value='');}catch(e){status.textContent='Account was not changed: '+e.message;}finally{button.disabled=false;}};
let receiptsBusy=false,receiptsLastCheck=0,receiptsLastRoom=null,receiptsLastAtBottom=false;
$('read-receipts').onchange=async()=>{try{checked(await client.rpc('set_read_receipts',{enabled:$('read-receipts').checked}));refreshReadReceipts();}catch(e){$('read-receipts').checked=!$('read-receipts').checked;notify(e.message);}};
async function refreshReadReceipts(){
 if(!me||!selected||receiptsBusy||document.visibilityState!=='visible')return;
 const room=selected,session=epoch,now=Date.now();
 const atBottom=$('history').scrollHeight-$('history').scrollTop-$('history').clientHeight<120;
 const newlyReachedBottom=receiptsLastRoom===room&&atBottom&&!receiptsLastAtBottom;
 if(receiptsLastRoom===room&&now-receiptsLastCheck<4000&&!newlyReachedBottom)return;
 receiptsLastCheck=now;receiptsLastRoom=room;receiptsLastAtBottom=atBottom;
 receiptsBusy=true;
 try{const rows=checked(await client.rpc('chat_read_receipts',{target_room:room,mark_read:document.hasFocus()&&atBottom}));if(session!==epoch||selected!==room)return;
 for(const el of document.querySelectorAll('[data-receipt-time]')){const readers=rows.filter(r=>r.user_id!==me.id&&r.read_at>=el.dataset.receiptTime);el.textContent=readers.length?'Read by '+readers.map(r=>displayPerson(r.user_id)).join(', '):'';}
 }catch{}finally{receiptsBusy=false;}
}
setInterval(refreshReadReceipts,10000);
window.addEventListener('focus',refreshReadReceipts);
$('history').addEventListener('scroll',()=>{clearTimeout(receiptScrollTimer);receiptScrollTimer=setTimeout(refreshReadReceipts,300);});let receiptScrollTimer;


// Every password field gets a keyboard-accessible visibility toggle.
for(const input of document.querySelectorAll('input[type="password"]')){
 input.dataset.passwordField='true';const wrap=node('span','password-field'),button=node('button','password-eye');button.type='button';button.setAttribute('aria-controls',input.id);input.before(wrap);wrap.append(input,button);
 const paint=()=>{const shown=input.type==='text';button.setAttribute('aria-label',shown?'Hide password':'Show password');button.setAttribute('aria-pressed',String(shown));button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>'+(shown?'<path d="m3 3 18 18"/>':'')+'</svg>';};
 button.onclick=()=>{input.type=input.type==='password'?'text':'password';paint();input.focus();};input.form?.addEventListener('submit',()=>{input.type='password';paint();});input.closest('dialog')?.addEventListener('close',()=>{input.type='password';paint();});paint();
}

// Realtime cannot deliver rows after RLS hides them from spectators. Reconcile
// only game cards against an authorized read while refreshing the active dock.
async function refreshFinishedGameCards(room,session){
 const ids=[...messages.values()].filter(m=>m.room_id===room&&(m.system_event?.kind==='four'||poolId(m.body)||chessId(m.body)||golfId(m.body))).map(m=>m.id);if(!ids.length)return;
 const rows=checked(await client.from('messages').select(MESSAGE_FIELDS).eq('room_id',room).in('id',ids));if(session!==epoch||room!==selected)return;
 const visible=new Set(rows.map(m=>m.id));let changed=false;
 for(const id of ids)if(!visible.has(id)){messages.delete(id);changed=true;}
 for(const row of rows){if(JSON.stringify(messages.get(row.id)?.system_event)!==JSON.stringify(row.system_event)){mergeMessage(row);changed=true;}}
 if(changed)renderMessages();
}

const joinableCalls=new Map();
let callListTimer,joinableCallsBusy=false;
async function refreshJoinableCalls(){
  if(!me||joinableCallsBusy||document.visibilityState!=='visible')return;
  joinableCallsBusy=true;
  const session=epoch;
  try{
    const rows=checked(await client.rpc('joinable_chat_calls'));
    if(epoch!==session)return;
    joinableCalls.clear();
    for(const row of rows)joinableCalls.set(row.room_id,row);
    renderRooms();
  }catch{/* Try again on the next call refresh. */}
  finally{joinableCallsBusy=false;}
}
function fourSetup(){
  const list=$('games-list'),back=node('button','','← All games'),send=node('button','primary','Send invitation');
  back.onclick=renderGameChoices;send.onclick=()=>sendFourInvite();
  list.replaceChildren(back,node('h3','','Four in a Row'),fourThumbnail(),node('p','','Connect four discs across, down, or diagonally. Your opponent drops first.'),send);
}
async function sendFourInvite(){
  if(!me||!selected)return;
  const room=selected,session=epoch;
  for(const button of $('games-dialog').querySelectorAll('button'))button.disabled=true;
  try{
    checked(await client.rpc('create_four_game',{target_room:room}));
    if(session!==epoch||room!==selected)return;
    $('games-dialog').close();await selectRoom(room);
  }catch(e){notify(e.message);}
  finally{for(const button of $('games-dialog').querySelectorAll('button'))button.disabled=false;}
}
async function fourMove(name,args){
  const room=selected,session=epoch;
  try{
    checked(await client.rpc(name,args));
    const row=checked(await client.from('messages').select(MESSAGE_FIELDS).eq('id',args.item_id).single());
    if(session!==epoch||room!==selected)return;
    mergeMessage(row);renderMessages();refreshActiveGames();
  }catch(e){notify(e.message);}
}
async function jumpToFour(id){
  const room=selected,session=epoch;
  try{
    if(!messages.has(id)){
      const row=checked(await client.from('messages').select(MESSAGE_FIELDS).eq('id',id).single());
      if(room!==selected||session!==epoch)return;
      mergeMessage(row);renderMessages();
    }
    document.querySelector('[data-message-id="'+id+'"]')?.scrollIntoView({block:'center',behavior:'smooth'});
  }catch(e){notify(e.message);}
}

const desktop=window.pocketchatDesktop;
$('desktop-options').hidden=!desktop?.windows;
for(const [id,key] of [['desktop-popups','cove-popups'],['tray-toggle','cove-tray']]){
 const control=$(id);control.checked=localStorage.getItem(key)==='on';
 control.onchange=async()=>{try{if(id==='tray-toggle')control.checked=await desktop.setTray(control.checked);localStorage.setItem(key,control.checked?'on':'off');}catch(e){control.checked=false;notify(e.message);}};
}
if(desktop?.windows && $('tray-toggle').checked)desktop.setTray(true).catch(e=>notify(e.message));
function desktopPopup(room,call){if(desktop?.windows && $('desktop-popups').checked)desktop.desktopNotice({room,call}).catch(()=>{});}
desktop?.openNotice?.(room=>{if(me&&rooms.some(r=>r.id===room))selectRoom(room).catch(e=>notify(e.message));});
const recoveredGame=globalThis.CoveImposter3D?.mountImposter;
const imposter=typeof recoveredGame==='function'
  ? recoveredGame({
      rpc:bridgeImposterRpc(async(name,args)=>checked(await client.rpc(name,args))),
      user:()=>me?.id,
      label:id=>personLabel(id),
      friends:()=>friendships.filter(r=>r.status==='accepted').map(r=>r.sender_id===me.id?r.recipient_id:r.sender_id).filter(id=>!blocks.has(id))
    })
  : {open:()=>notify('The verified 3D Imposter files are missing from this build.'),close:()=>{}};
// No 2D fallback: the 3D ship, gameplay and characters are required.
const imposterOpenedRounds=new Map();
$('open-games').onclick=()=>imposter.open();

let impInviteTimer;
async function impInviteCount(){
 const session=epoch;if(!me)return;
 try{
  const rows=checked(await client.rpc('imp_list_v2'));
  if(epoch!==session)return;
  const n=rows.filter(r=>!r.joined&&r.phase==='lobby').length;
  $('imp-invites').textContent=n?n+' open':'';
  // When a host begins a new round, open the game for every joined player.
  // A closed window stays closed for the rest of that round; do not nag users.
  const active=rows.find(r=>r.joined&&r.round_number>0&&
   ['play','meeting','finished'].includes(r.phase)&&imposterOpenedRounds.get(r.id)!==r.round_number);
  if(active){imposterOpenedRounds.set(active.id,active.round_number);imposter.open(active.id);}
 }catch{}
}
