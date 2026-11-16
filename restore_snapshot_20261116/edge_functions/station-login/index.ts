
const URL=Deno.env.get("SUPABASE_URL")||"";
const ANON=Deno.env.get("SUPABASE_ANON_KEY")||"";
const SERVICE=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const ORIGIN="https://water-daily-reports.onrender.com";
const headers=(o:string|null)=>({
 "Access-Control-Allow-Origin":o===ORIGIN?ORIGIN:"null",
 "Access-Control-Allow-Headers":"apikey,content-type,authorization",
 "Access-Control-Allow-Methods":"POST,OPTIONS",
 "Content-Type":"application/json;charset=utf-8",
 "Cache-Control":"no-store",
 "Vary":"Origin",
 "X-Content-Type-Options":"nosniff"
});
const reply=(o:string|null,status:number,data:unknown)=>new Response(JSON.stringify(data),{status,headers:headers(o)});
const svc=()=>({apikey:SERVICE,Authorization:"Bearer "+SERVICE});
async function rest(path:string,body?:unknown){
 const r=await fetch(URL+"/rest/v1/"+path,{
  method:body===undefined?"GET":"POST",
  headers:{...svc(),...(body!==undefined?{"Content-Type":"application/json"}:{})},
  ...(body===undefined?{}:{body:JSON.stringify(body)}),
  signal:AbortSignal.timeout(11000)
 });
 return {ok:r.ok,status:r.status,data:await r.json().catch(()=>null)};
}
async function derived(username:string,password:string){
 const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(SERVICE),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
 const sig=new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode("wsc-station-password-v1:"+username+":"+password)));
 return "Aa1!"+btoa(String.fromCharCode(...sig));
}
async function keyFor(username:string){
 const digest=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode("wsc-login-guard:"+username)));
 return Array.from(digest,x=>x.toString(16).padStart(2,"0")).join("");
}
async function passwordSignIn(email:string,password:string){
 const r=await fetch(URL+"/auth/v1/token?grant_type=password",{
  method:"POST",headers:{apikey:ANON,"Content-Type":"application/json"},
  body:JSON.stringify({email,password}),signal:AbortSignal.timeout(12000)
 });
 return r.ok?await r.json().catch(()=>null):null;
}
Deno.serve(async req=>{
 const origin=req.headers.get("origin");
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:headers(origin)});
 if(origin!==ORIGIN)return reply(origin,403,{error:"origin_not_allowed"});
 if(req.method!=="POST")return reply(origin,405,{error:"method_not_allowed"});
 if(!SERVICE||!ANON||!URL.startsWith("https://"))return reply(origin,503,{error:"server_unavailable"});
 try{
  const raw=await req.text();
  if(raw.length>1000)return reply(origin,413,{error:"request_too_large"});
  const body=JSON.parse(raw);
  const username=typeof body?.username==="string"?body.username.trim().toLowerCase():"";
  const password=body?.password;
  if(username.length<1||[...username].length>100||typeof password!=="string"||password.length<1||password.length>128)
   return reply(origin,401,{error:"invalid_credentials"});
  const throttleKey=await keyFor(username);
  const permit=await rest("rpc/register_login_attempt",{p_key:throttleKey});
  if(!permit.ok)return reply(origin,503,{error:"login_guard_unavailable"});
  if(permit.data!==true)return reply(origin,429,{error:"too_many_attempts"});
  const r=await rest("account_logins?select=user_id,username,auth_email&username=eq."+encodeURIComponent(username)+"&limit=1");
  if(!r.ok)return reply(origin,503,{error:"account_lookup_unavailable"});
  const alias=Array.isArray(r.data)?r.data[0]:null;
  let email="",storedPassword="",session:any=null,expectedId="";
  if(alias){
   email=alias.auth_email;
   expectedId=alias.user_id;
   storedPassword=await derived(alias.username,password);
   session=await passwordSignIn(email,storedPassword);
  }else{
   email=username.includes("@")?username:username.startsWith("admin_")?
    "admin-"+username.slice(6)+"@wsc-ops.example":"station-"+username+"@wsc-ops.example";
   session=await passwordSignIn(email,password);
   if(!session?.access_token&&/^\d{4}$/.test(username)&&password===username)
    session=await passwordSignIn(email,await derived(username,password));
  }
  if(!session?.access_token||!session?.user?.id)
   return reply(origin,401,{error:"invalid_credentials"});
  if(expectedId&&expectedId!==session.user.id)
   return reply(origin,403,{error:"account_mismatch"});
  const id=encodeURIComponent(session.user.id);
  const [admin,station]=await Promise.all([
   rest("admin_users?select=user_id,role&user_id=eq."+id+"&limit=1"),
   rest("station_users?select=user_id,username,station_id&user_id=eq."+id+"&limit=1")
  ]);
  if(!admin.ok||!station.ok)return reply(origin,503,{error:"role_lookup_unavailable"});
  const role=Array.isArray(admin.data)&&admin.data.length?admin.data[0].role:null;
  const member=Array.isArray(station.data)&&station.data.length?station.data[0]:null;
  if(!["admin","superadmin"].includes(role)&&!member)
   return reply(origin,403,{error:"account_role_missing"});
  if(!alias&&!username.includes("@")&&member&&member.username!==username)
   return reply(origin,403,{error:"account_mismatch"});
  await rest("rpc/clear_login_attempts",{p_key:throttleKey}).catch(()=>{});
  return reply(origin,200,session);
 }catch(e){
  console.error("account_login_error",String(e).slice(0,140));
  return reply(origin,503,{error:"login_unavailable"});
 }
});
