import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json'}
const reply=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers})
Deno.serve(async request=>{
 if(request.method==='OPTIONS')return reply(200,{})
 if(request.method!=='POST')return reply(405,{error:'Method not allowed'})
 try{
 const url=Deno.env.get('SUPABASE_URL')!,key=Deno.env.get('SUPABASE_ANON_KEY')!,service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
 const auth={persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}
 const verifier=createClient(url,key,{auth})
 const token=request.headers.get('Authorization')?.replace(/^Bearer /i,'')||''
 const {data:{user},error}=await verifier.auth.getUser(token)
 if(error||!user?.email)return reply(401,{error:'Sign in again to change your account.'})
 const body=await request.json(),name=String(body.username||'').trim().toLowerCase(),password=body.newPassword
 if(!/^[a-z0-9_]{3,24}$/.test(name)||typeof body.currentPassword!=='string'||body.currentPassword.length>128|| (password!==undefined&&(typeof password!=='string'||password.length<10||password.length>128)))return reply(400,{error:'Check your username and password lengths.'})
 const confirm=await verifier.auth.signInWithPassword({email:user.email,password:body.currentPassword})
 if(confirm.error||confirm.data.user?.id!==user.id)return reply(403,{error:'Current password is incorrect.'})
 // Revoke only the temporary verification session, never the caller's session.
 await verifier.auth.signOut({scope:'local'})
 const admin=createClient(url,service,{auth})
 const changes:Record<string,unknown>={email:name+'@users.example.com',email_confirm:true,user_metadata:{...user.user_metadata,username:name}}
 if(password)changes.password=password
 const updated=await admin.auth.admin.updateUserById(user.id,changes)
 if(updated.error)return reply(400,{error:'Could not save. The username may be taken, or the account migration needs applying.'})
 return reply(200,{updated:true})
 }catch{return reply(400,{error:'Could not update account. Please retry.'})}
})
