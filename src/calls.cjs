const Sounds = require('./sounds.cjs');
const {speakerMeter}=require('./call-speakers.cjs');
const ICONS = {
  share: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4M12 13V6m-4 4 4-4 4 4"/>',
  mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/>',
  camera:
    '<rect x="2" y="5" width="14" height="14" rx="3"/><path d="m16 9 6-4v14l-6-4"/>',
  end: '<path d="M3 16v-5c5-5 13-5 18 0v5l-5-1v-4M8 11v4Z"/>',
  expand: '<path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5"/>',
  minimize: '<path d="M5 12h14"/>',
};
const svg = (name, off = false) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}${off ? '<path d="m3 3 18 18"/>' : ""}</svg>`;
function gatherIce(pc, timeout = 10000) {
  return new Promise((resolve) => {
    const done = () => {
        clearTimeout(timer);
        pc.removeEventListener("icegatheringstatechange", check);
        resolve();
      },
      check = () => {
        if (pc.iceGatheringState === "complete") done();
      },
      timer = setTimeout(done, timeout);
    pc.addEventListener("icegatheringstatechange", check);
    check();
  });
}
function mount({
  client,
  userId, onRing,
  label,
  avatar = () => null,
  notify,
  root = document.body,
  mediaDevices = navigator.mediaDevices,
  Peer = globalThis.RTCPeerConnection,
}) {
  const device = crypto.randomUUID(),
    peers = new Map(),
    tiles = new Map(),
    ignored = new Set();
  let focusedMember = null;
  let current = null,
    stream = null,
    ice = null,
    disposed = false,
    generation = 0,
    busy = false,
    preparing = false,
    starting = false,
    lastContact = Date.now(),
    idleAt = 0,
    setupTimer, shareStream = null, cameraTrack = null, sharingBusy = false, ringTimer = null, ringingId = null;
  const panel = document.createElement("section");
  panel.className = "call-panel";
  const host = root.querySelector(".conversation-header");
  panel.classList.toggle("in-chat", !!host);
  panel.hidden = true;
  panel.setAttribute("aria-label", "Call");
  panel.innerHTML = `<header class="call-heading"><div><strong class="call-name"></strong><p class="call-status" role="status"></p></div><button class="call-back" type="button" hidden>Back to call</button><button class="call-minimize" type="button" aria-label="Minimize call">${svg("minimize")}</button></header><div class="call-grid"></div><p class="call-detail">Direct calls share network addresses with participants. Camera and microphone start after joining.</p><div class="call-controls"><button class="call-accept primary" type="button">Join call</button><button class="call-mic" type="button" title="Mute microphone" aria-label="Mute microphone" aria-pressed="false">${svg("mic")}</button><button class="call-camera" type="button" title="Turn camera off" aria-label="Turn camera off" aria-pressed="false">${svg("camera")}</button><button class="call-share" type="button" title="Share screen" aria-label="Share screen" aria-pressed="false">${svg("share")}</button><button class="call-audio" type="button" hidden>Enable sound</button><button class="call-end danger" type="button" title="Leave call" aria-label="Leave call">${svg("end")}</button></div>`;
  if(host) host.after(panel); else root.append(panel);
  const el = (n) => panel.querySelector(".call-" + n);
  function layoutTiles() {
    if(panel.hidden || panel.classList.contains('minimized'))return;
    const grid=el('grid'), visible=[...tiles.entries()].filter(([id])=>!focusedMember || id===focusedMember);
    const width=grid.clientWidth,height=grid.clientHeight,gap=6;
    if(!visible.length || !width || !height)return;
    const ratio=t=>t.video.videoWidth&& !t.video.hidden?t.video.videoWidth/t.video.videoHeight:16/9;
    let best={area:0,columns:1,cellWidth:width,cellHeight:height};
    for(let columns=1;columns<=visible.length;columns++) {
      const rows=Math.ceil(visible.length/columns),cellWidth=(width-gap*(columns-1))/columns,cellHeight=(height-gap*(rows-1))/rows;
      const area=visible.reduce((sum,[,t])=>{const r=ratio(t),w=Math.min(cellWidth,cellHeight*r);return sum+w*w/r;},0);
      if(area>best.area)best={area,columns,cellWidth,cellHeight};
    }
    grid.style.gridTemplateColumns='repeat('+best.columns+',minmax(0,1fr))';
    grid.style.gridTemplateRows='repeat('+Math.ceil(visible.length/best.columns)+',minmax(0,1fr))';
    for(const [,t] of visible) {
      const r=ratio(t),w=Math.min(best.cellWidth,best.cellHeight*r);
      t.box.style.width=w+'px';t.box.style.height=w/r+'px';
    }
  }
  function focusMember(id) {
    focusedMember=id;
    panel.classList.toggle('participant-focus',!!id);
    if(id)panel.classList.remove('minimized');
    el('back').hidden=!id;
    for(const [memberId,t] of tiles) {
      t.box.classList.toggle('focused',memberId===id);
      t.box.setAttribute('aria-pressed',String(memberId===id));
    }
    layoutTiles();
    if(id)el('back').focus();
  }
  el('back').onclick=()=>{const previous=focusedMember;focusMember(null);tiles.get(previous)?.box.focus();};
  const escapeFocus=e=>{if(e.key==='Escape'&&focusedMember){e.preventDefault();e.stopPropagation();el('back').click();}};
  panel.addEventListener('keydown',escapeFocus);
  const resizeObserver=new ResizeObserver(layoutTiles);
  resizeObserver.observe(el('grid'));
  const rpc = async (name, args) => {
    const r = await client.rpc(name, args);
    if (r.error) throw r.error;
    return r.data;
  };
  const action = (action, extra = {}, id = current?.id) =>
    rpc("live_call_action", {
      device_id: device,
      call_id: id,
      action,
      ...extra,
    });
  const meter = speakerMeter();
  let speakerTimer, loudest;
  function updateSpeakers() {
    if (!current) return;
    const levels = new Map();
    const now = performance.now();
    for (const [id,t] of tiles) {
      const level = meter.level(id,t.video.srcObject,t.mic,now);
      t.box.classList.toggle('speaking',level>0);
      if (level) levels.set(id,level);
    }
    let next = levels.has(loudest) ? loudest : null;
    for (const [id,level] of levels) if (!next || level>levels.get(next)*1.6) next=id;
    loudest=next;panel.dataset.hasSpeaker=String(!!next);
    for(const [id,t] of tiles)t.box.classList.toggle('current-speaker',id===next);
  }
  function closePeer(id) {
    meter.remove(id);
    const p = peers.get(id);
    if (p) {
      clearTimeout(p.timeout);
      p.pc.ontrack = null;
      p.pc.onconnectionstatechange = null;
      p.pc.close();
      peers.delete(id);
    }
  }
  function cleanup(message) {
    focusMember(null);
    generation++;
    if (current?.self_status === 'joined') Sounds.play('leave');
    clearInterval(ringTimer); ringTimer=null; ringingId=null;
    shareStream?.getTracks().forEach(t=>t.stop()); shareStream=null;
    cameraTrack?.stop(); cameraTrack=null;
    el('share').setAttribute('aria-pressed','false');
    el('share').title=el('share').ariaLabel='Share screen';
    clearTimeout(setupTimer);
    preparing = false;
    for (const id of peers.keys()) closePeer(id);
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    ice = null;
    for (const t of tiles.values()) t.video.srcObject = null;
    tiles.clear();
    el("grid").replaceChildren();
    current = null;
    for (const [key, title] of [
      ["mic", "Mute microphone"],
      ["camera", "Turn camera off"],
    ]) {
      el(key).innerHTML = svg(key);
      el(key).title = title;
      el(key).setAttribute("aria-label", title);
      el(key).setAttribute("aria-pressed", "false");
    }
    el("detail").textContent =
      "Direct calls share network addresses with participants. Camera and microphone start after joining.";
    clearInterval(speakerTimer); speakerTimer = null; meter.close(); loudest = null; delete panel.dataset.hasSpeaker;
    panel.hidden = true;
    panel.classList.remove("minimized");
    if (message && !disposed) notify(message);
  }
  async function end(message) {
    const id = current?.id;
    if (id) ignored.add(id);
    cleanup(message);
    if (id) await action("leave", {}, id).catch(() => {});
  }
  function tile(member) {
    let t = tiles.get(member.id);
    if (t) return t;
    const box = document.createElement("div");
    box.className = "call-tile";box.dataset.memberId=member.id;
    box.tabIndex=0;box.setAttribute('role','button');box.setAttribute('aria-pressed','false');
    box.onclick=()=>focusMember(focusedMember===member.id?null:member.id);
    box.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();box.click();}};
    const video = document.createElement("video");
    video.onresize=layoutTiles;
    video.autoplay = true;
    video.playsInline = true;
    video.muted = member.id === userId;
    video.className = member.id === userId ? "call-local" : "call-remote";
    const placeholder = document.createElement("div");
    placeholder.className = "call-tile-placeholder";placeholder.dataset.presenceId=member.id;
    const photo = avatar(member.id, current.room_id);
    if (photo) {
      const img = document.createElement("img");
      img.src = photo;
      img.alt = "Profile picture";
      placeholder.append(img);
    } else {
      const initial = document.createElement("span");
      initial.textContent = label(member.id, current.room_id)
        .slice(0, 1)
        .toUpperCase();
      placeholder.append(initial);
    }
    const name = document.createElement("span");
    name.className = "call-tile-name";
    const state = document.createElement("span");
    state.className = "call-tile-state";
    box.append(video, placeholder, name, state);
    el("grid").append(box);
    t = { box, video, placeholder, name, state, photo };
    tiles.set(member.id, t);
    return t;
  }
  function render() {
    if (!current) return;
    panel.hidden = false;
    const ringing = (current.self_status === 'invited' || (current.creator===userId && current.members.filter(m=>m.status==='joined').length<2)) && Date.now()-Date.parse(current.created_at)<20000;
    if(ringing && ringingId!==current.id) {
      clearInterval(ringTimer);ringingId=current.id;Sounds.play('ring');
      ringTimer=setInterval(()=>{if(current && Date.now()-Date.parse(current.created_at)<20000)Sounds.play('ring');else{clearInterval(ringTimer);ringTimer=null;}},2500);
    } else if(!ringing) {clearInterval(ringTimer);ringTimer=null;ringingId=null;}
    if (!speakerTimer) speakerTimer=setInterval(updateSpeakers,90);
    const joined = current.members.filter((m) => m.status === "joined"),
      incoming = current.self_status === "invited";
    el("name").textContent = current.group
      ? "Group call"
      : label(
          current.members.find((m) => m.id !== userId)?.id || current.creator,
          current.room_id,
        );
    el("status").textContent = incoming
      ? current.video
        ? "Incoming video call"
        : "Incoming voice call"
      : joined.length < 2
        ? "Waiting for others…"
        : `${joined.length} people in ${current.video ? "video" : "voice"} call`;
    el("accept").hidden = !incoming;
    el("accept").textContent = current.group ? "Join call" : "Accept";
    el("end").title = incoming ? "Decline" : "Leave call";
    el("end").setAttribute("aria-label", el("end").title);
    el("share").hidden = incoming;
    el("share").disabled = !stream || sharingBusy;
    el("mic").hidden = incoming;
    el("camera").hidden = incoming || !current.video;
    el("mic").disabled = !stream; el("camera").disabled = !stream || !!shareStream;
    const shown = current.members.filter(
      (m) => m.status === "joined" || (m.status === "invited" && Date.now()-Date.parse(current.created_at)<20000),
    );
    for (const [id, t] of tiles) {
      if (!shown.some((m) => m.id === id)) {
        t.video.srcObject = null;
        t.box.remove();
        tiles.delete(id);meter.remove(id);
      }
    }
    for (const m of shown) {
      const t = tile(m),
        own = m.id === userId;
      t.name.textContent = own ? "You" : label(m.id, current.room_id);
      t.box.setAttribute("aria-label","Expand "+t.name.textContent);
      const photo = avatar(m.id, current.room_id);
      if (t.photo !== photo) {
        t.placeholder.replaceChildren();
        const face = document.createElement(photo ? "img" : "span");
        if (photo) {
          face.src = photo;
          face.alt = "Profile picture";
        } else face.textContent = t.name.textContent.slice(0, 1);
        t.placeholder.append(face);
        t.photo = photo;
      }
      const camera =
        own && stream
          ? stream.getVideoTracks().some((t) => t.enabled)
          : m.camera;
      const mic =
        own && stream ? stream.getAudioTracks().some((t) => t.enabled) : m.mic;
      t.video.classList.toggle("screen-sharing",own && !!shareStream);
      t.video.hidden = !camera || !t.video.srcObject;
      t.placeholder.hidden = !t.video.hidden;
      t.mic=mic; t.box.classList.toggle("ringing",m.status==="invited");
      t.state.innerHTML = mic ? "" : svg("mic", true);
      t.state.title = mic ? "" : "Microphone muted";
      if(m.status==="invited")t.state.textContent="Ringing…";
      if (peers.get(m.id)?.failed) t.state.textContent = "Connection failed";
      if (own && stream && t.video.srcObject !== stream) t.video.srcObject = stream;
    }
    el("grid").dataset.count = shown.length;
    if(focusedMember&&!tiles.has(focusedMember))focusMember(null);
    layoutTiles();
  }
  async function prepare() {
    if (
      preparing ||
      stream ||
      !current ||
      current.self_status !== "joined" ||
      current.members.filter((m) => m.status === "joined").length < 2
    )
      return;
    preparing = true;
    const token = generation;
    setupTimer = setTimeout(() => {
      if (token === generation)
        end("Call setup timed out. Check camera and microphone permission.");
    }, 60000);
    try {
      if (!mediaDevices?.getUserMedia || !Peer)
        throw Error("Camera and microphone unavailable");
      const media = await mediaDevices.getUserMedia({
        audio: true,
        video: current.video
          ? {
              width: { ideal: 640 },
              height: { ideal: 360 },
              frameRate: { ideal: 20, max: 24 },
            }
          : false,
      });
      if (disposed || token !== generation) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      stream = media; cameraTrack = stream.getVideoTracks()[0] || null;
      render();
      ice = [{ urls: "stun:stun.cloudflare.com:3478" }];
      let relay = false;
      try {
        const r = await Promise.race([
          client.functions.invoke("call-ice", {
            body: { call_id: current.id, device_id: device, version: 2 },
          }),
          new Promise((_, reject) =>
            setTimeout(() => reject(Error("Relay timeout")), 10000),
          ),
        ]);
        if (!r.error && Array.isArray(r.data?.iceServers)) {
          ice = r.data.iceServers;
          relay = !!r.data.relay;
        }
      } catch {}
      if (disposed || token !== generation) return;
      clearTimeout(setupTimer);
      el("detail").textContent = relay
        ? "Encrypted media · Relay available · 2-hour limit"
        : "Direct connection · A relay may be needed on this network";
      syncPeers();
    } catch (e) {
      if (token === generation)
        end(
          e.name === "NotAllowedError"
            ? "Camera or microphone permission was denied. Allow access in system settings and try again."
            : "Call failed: " + e.message,
        );
    } finally {
      if (token === generation) preparing = false;
    }
  }
  async function negotiate(member, p) {
    if (p.busy || !current) return;
    const signal = current.signals.find((s) => s.sender === member.id),
      caller = userId < member.id;
    if (!caller && !signal) return;
    if (caller && p.pc.localDescription && (!signal || p.pc.remoteDescription))
      return;
    if (!caller && p.pc.localDescription) return;
    p.busy = true;
    const token = generation,
      id = current.id;
    try {
      if (caller) {
        if (!p.pc.localDescription) {
          await p.pc.setLocalDescription(await p.pc.createOffer());
          await gatherIce(p.pc);
          if (token !== generation || peers.get(member.id) !== p) return;
          await action(
            "signal",
            { peer_id: member.id, description: p.pc.localDescription.toJSON() },
            id,
          );
        }
        if (signal && !p.pc.remoteDescription)
          await p.pc.setRemoteDescription(signal.description);
      } else {
        await p.pc.setRemoteDescription(signal.description);
        await p.pc.setLocalDescription(await p.pc.createAnswer());
        await gatherIce(p.pc);
        if (token !== generation || peers.get(member.id) !== p) return;
        await action(
          "signal",
          { peer_id: member.id, description: p.pc.localDescription.toJSON() },
          id,
        );
      }
    } catch (e) {
      if (token === generation && peers.get(member.id) === p) {
        p.failed = true;
        tiles.get(member.id).state.textContent = "Connection failed";
        notify(
          "Could not connect to " +
            label(member.id, current.room_id) +
            ". Leave and rejoin, or check relay setup.",
        );
      }
    } finally {
      p.busy = false;
    }
  }
  function syncPeers() {
    if (!current || !stream || !ice || preparing) return;
    const others = current.members.filter(
      (m) => m.id !== userId && m.status === "joined",
    );
    for (const [id, p] of peers)
      if (!others.some((m) => m.id === id && m.connection === p.connection))
        closePeer(id);
    for (const m of others) {
      let p = peers.get(m.id);
      if (!p) {
        const peer = new Peer({ iceServers: ice });
        p = { pc: peer, connection: m.connection, busy: false, failed: false };
        peers.set(m.id, p);
        p.timeout = setTimeout(() => {
          if (peers.get(m.id) !== p || peer.connectionState === "connected")
            return;
          p.failed = true;
          if (!current.group)
            end("Call could not connect. Check your network or relay setup.");
          else render();
        }, 45000);
        for (const track of stream.getTracks()) peer.addTrack(track, stream);
        // Reserve a video sender so a voice call can share a screen without renegotiation.
        if (!stream.getVideoTracks().length) peer.addTransceiver('video',{direction:'sendrecv',streams:[stream]});
        const remote = new MediaStream();
        tile(m).video.srcObject = remote;
        peer.ontrack = (e) => {
          if (peers.get(m.id) !== p) return;
          remote.addTrack(e.track);
          render();
          tile(m)
            .video.play()
            .catch(() => {
              el("audio").hidden = false;
            });
        };
        peer.onconnectionstatechange = () => {
          if (peers.get(m.id) !== p) return;
          if (peer.connectionState === "connected") {
            clearTimeout(p.timeout);
            tile(m).state.textContent = "";
          }
          if (["failed", "disconnected"].includes(peer.connectionState))
            tile(m).state.textContent = "Connection lost — rejoin";
        };
      }
      if (!p.failed) negotiate(m, p);
    }
  }
  async function poll() {
    if (disposed || busy || starting) return;
    if (!current && Date.now() - idleAt < 5000) return;
    idleAt = Date.now();
    busy = true;
    const token = generation;
    try {
      const row = await rpc("poll_live_calls", { device_id: device });
      if (disposed || token !== generation) return;
      lastContact = Date.now();
      if (!row?.id) {
        if (current) cleanup("Call ended.");
        return;
      }
      if (ignored.has(row.id)) {
        action("leave", {}, row.id).catch(() => {});
        return;
      }
      if (current && row.id !== current.id) cleanup();
      if(current?.id===row.id) {
        const before=new Set(current.members.filter(m=>m.status==='joined').map(m=>m.id));
        const after=new Set(row.members.filter(m=>m.status==='joined').map(m=>m.id));
        if([...after].some(id=>!before.has(id)))Sounds.play('join');
        else if([...before].some(id=>!after.has(id)))Sounds.play('leave');
      }
      if(current?.id!==row.id && row.self_status==="invited")onRing?.(row.room_id);
      current = row;
      render();
      prepare();
      syncPeers();
    } catch (e) {
      if (current && Date.now() - lastContact > 20000)
        end("Call ended because the connection was lost.");
    } finally {
      busy = false;
    }
  }
  async function start(roomId, video = true) {
    if (disposed) return;
    if (starting) return;
    starting = true;
    if (current) await end();
    const token = generation;
    try {
      const r = await action(
        "start",
        { target_room: roomId, wants_video: video },
        crypto.randomUUID(),
      );
      if (disposed || token !== generation) {
        await action("leave", {}, r.id).catch(() => {});
        return;
      }
      ignored.delete(r.id);
      idleAt = 0;
    } catch (e) {
      notify(
        /function|schema cache/i.test(e.message)
          ? "Calls need the latest Supabase SQL update."
          : e.message,
      );
    } finally {
      starting = false;
      poll();
    }
  }
  el("accept").onclick = async () => {
    if (!current) return;
    el("accept").disabled = true;
    try {
      await action("join");
      generation++;
      idleAt = 0;
      await poll();
    } catch (e) {
      notify(e.message);
    } finally {
      el("accept").disabled = false;
    }
  };
  el("end").onclick = () => end();
  let mediaSync = Promise.resolve();
  function updateMedia() {
    if (!stream) return;
    const mic = stream.getAudioTracks().some((t) => t.enabled),
      camera = stream.getVideoTracks().some((t) => t.enabled);
    el("mic").innerHTML = svg("mic", !mic);
    el("camera").innerHTML = svg("camera", !camera);
    for (const [name, off, title] of [
      ["mic", !mic, mic ? "Mute microphone" : "Unmute microphone"],
      ["camera", !camera, camera ? "Turn camera off" : "Turn camera on"],
    ]) {
      el(name).setAttribute("aria-pressed", String(off));
      el(name).title = title;
      el(name).setAttribute("aria-label", title);
    }
    const token = generation;
    mediaSync = mediaSync.then(() => {
      if (current && token === generation) return action("media", { mic_on: mic, camera_on: camera });
    }).catch(() => {});
    render();
  }
  el("mic").onclick = () => {
    if (stream) {
      const tracks = stream.getAudioTracks(),
        enabled = !tracks.some((t) => t.enabled);
      tracks.forEach((t) => (t.enabled = enabled));
      Sounds.play(enabled?"unmute":"mute"); updateMedia();
    }
  };
  el("camera").onclick = () => {
    if (stream && !shareStream) {
      const tracks = stream.getVideoTracks(),
        enabled = !tracks.some((t) => t.enabled);
      tracks.forEach((t) => (t.enabled = enabled));
      Sounds.play("camera"); updateMedia();
    }
  };
  async function replaceVideo(track) {
    await Promise.all([...peers.values()].map(p=>{
      const sender=p.pc.getTransceivers().find(t=>t.receiver.track.kind==='video')?.sender;
      return sender?.replaceTrack(track);
    }));
    if(!stream)return;
    for(const old of stream.getVideoTracks())stream.removeTrack(old);
    if(track)stream.addTrack(track);
  }
  async function stopSharing() {
    if(!shareStream)return;
    const old=shareStream;shareStream=null;
    try{await replaceVideo(cameraTrack?.readyState==='live'?cameraTrack:null);}
    catch(e){notify('Could not restore camera: '+e.message);}
    old.getTracks().forEach(t=>t.stop());
    el('share').setAttribute('aria-pressed','false');
    el('share').title=el('share').ariaLabel='Share screen';
    updateMedia();
  }
  el('share').onclick=async()=>{
    if(!stream||sharingBusy)return;
    sharingBusy=true;render();
    const token=generation;
    try{
      if(shareStream){await stopSharing();return;}
      const display=await mediaDevices.getDisplayMedia({video:{frameRate:{ideal:15,max:24}},audio:false});
      if(token!==generation||!current){display.getTracks().forEach(t=>t.stop());return;}
      shareStream=display;
      try{await replaceVideo(display.getVideoTracks()[0]);}
      catch(e){await stopSharing();throw e;}
      display.getVideoTracks()[0].onended=()=>stopSharing();
      el('share').setAttribute('aria-pressed','true');
      el('share').title=el('share').ariaLabel='Stop sharing';
      Sounds.play('share');updateMedia();
    }catch(e){if(e.name!=='NotAllowedError'&&e.name!=='AbortError')notify('Screen sharing failed: '+e.message);}
    finally{sharingBusy=false;render();}
  };
  el("minimize").onclick = () => {
    focusMember(null);
    const mini = panel.classList.toggle("minimized");
    el("minimize").innerHTML = svg(mini ? "expand" : "minimize");
    el("minimize").setAttribute(
      "aria-label",
      mini ? "Expand call" : "Minimize call",
    );
  };
  el("audio").onclick = () => {
    for (const t of tiles.values()) t.video.play().catch(() => {});
    el("audio").hidden = true;
  };
  const timer = setInterval(poll, 1500);
  poll();
  const unload = () => {
    stream?.getTracks().forEach((t) => t.stop());
    for (const id of peers.keys()) closePeer(id);
  };
  window.addEventListener("beforeunload", unload);
  return {
    start,
    refresh: render,
    dispose() {
      disposed = true;
      clearInterval(timer);
      window.removeEventListener("beforeunload", unload);
      end();
      resizeObserver.disconnect();
      panel.remove();
    },
  };
}
module.exports = { mount, gatherIce };
