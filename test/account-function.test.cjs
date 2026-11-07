const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),esbuild=require('esbuild');
for (const eol of ['\n', '\r\n']) test('account function requires identity and current password (' + (eol === '\n' ? 'LF' : 'CRLF') + ')',async()=>{
 const source=fs.readFileSync(require.resolve('../supabase/functions/update-account/index.ts'),'utf8').replace(/\r?\n/g,eol).replace(/^import [^\r\n]*\r?\n/,'');
 const code=esbuild.transformSync(source,{loader:'ts',target:'es2022'}).code;
 let handler,valid=true,passwordValid=true,changes=null,signouts=0;
 const account={id:'user-a',email:'alice@users.example.com',user_metadata:{username:'alice'}};
 vm.runInNewContext(code,{Deno:{env:{get:k=>k},serve:f=>handler=f},Response,createClient:(url,key)=>({auth:{getUser:async()=>({data:{user:valid?account:null},error:valid?null:{}}),signInWithPassword:async()=>({data:{user:account},error:passwordValid?null:{}}),signOut:async()=>{signouts++},admin:{updateUserById:async(id,value)=>{assert.equal(id,'user-a');changes=value;return {error:null}}}}})});
 const req=()=>({method:'POST',headers:new Headers({Authorization:'Bearer test'}),json:async()=>({username:'alice_new',currentPassword:'currentpassword',newPassword:'newpassword123'})});
 valid=false;assert.equal((await handler(req())).status,401);assert.equal(changes,null);
 valid=true;passwordValid=false;assert.equal((await handler(req())).status,403);assert.equal(changes,null);
 passwordValid=true;assert.equal((await handler(req())).status,200);assert.equal(changes.email,'alice_new@users.example.com');assert.equal(changes.password,'newpassword123');assert.equal(signouts,1);
});
