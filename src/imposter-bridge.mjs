// Adapter from original 3D Imposter RPC names to the newer persistent-lobby backend.
// The server, not the client, chooses the nearest eligible kill target.
export function bridgeImposterRpc(rpc) {
  return async (name, params={}) => {
    if (name === 'imp_list') return rpc('imp_list_v2', {});
    if (name === 'imp_create') return rpc('imp_create_v2', {
      ...params, lobby_name: params.lobby_name || 'My Imposter Lobby',
      meeting_cooldown_seconds: params.meeting_cooldown_seconds ?? 30
    });
    if (name === 'imp_steps') return rpc('imp_steps_v2', params);
    if (name === 'imp_action') {
      let {act,arg='',...rest} = params;
      if (act === 'kill') {act = 'kill_nearest'; arg='';}
      if (act === 'cleanup') {act = 'read'; arg='';}
      if (act === 'configure') {
        const options = JSON.parse(arg);
        arg = JSON.stringify({...options,
          name:options.name || 'My Imposter Lobby',
          meeting_cooldown:options.meeting_cooldown ?? 30});
      }
      return rpc('imp_action_v2',{...rest,act,arg});
    }
    return rpc(name, params);
  };
}
