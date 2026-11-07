import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const headers = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,x-client-info,apikey,content-type','Content-Type':'application/json','Cache-Control':'no-store'};
Deno.serve(async req => {
 if(req.method==='OPTIONS')return new Response('ok',{headers});
 const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
 if(req.method!=='POST')return reply({error:'POST required'},405);
 try {
  const authorization=req.headers.get('Authorization')||'';
  const client=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:authorization}},auth:{persistSession:false}});
  const {data:{user},error}=await client.auth.getUser();if(error||!user)return reply({error:'Sign in required'},401);
  const {call_id,device_id,version}=await req.json();
  const access=await client.rpc(version===2?'authorize_live_call_relay':'authorize_call_relay',{call_id,device_id});
  if(access.error||access.data!==true)return reply({error:'Active call required or request too soon'},403);
  const key=Deno.env.get('TURN_KEY_ID'),token=Deno.env.get('TURN_KEY_API_TOKEN');
  if(!key||!token)return reply({iceServers:[{urls:'stun:stun.cloudflare.com:3478'}],relay:false});
  const response=await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(key)}/credentials/generate-ice-servers`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({ttl:7200}),signal:AbortSignal.timeout(10000)});
  if(!response.ok)return reply({error:'Relay temporarily unavailable'},502);
  const data=await response.json();if(!Array.isArray(data.iceServers))throw Error('Invalid relay response');
  return reply({iceServers:data.iceServers,relay:true});
 }catch{return reply({error:'Could not prepare call connection'},500);}
});
