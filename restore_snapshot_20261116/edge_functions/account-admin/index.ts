
const URL=Deno.env.get("SUPABASE_URL")||"";
const SERVICE=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const ANON=Deno.env.get("SUPABASE_ANON_KEY")||"";
const ORIGIN="https://water-daily-reports.onrender.com";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const headers=(origin:string|null)=>({
 "Access-Control-Allow-Origin":origin===ORIGIN?ORIGIN:"null",
 "Access-Control-Allow-Headers":"authorization,content-type,apikey,x-client-info",
 "Access-Control-Allow-Methods":"POST,OPTIONS",
 "Content-Type":"application/json;charset=utf-8",
 "Cache-Control":"no-store",
 "X-Content-Type-Options":"nosniff",
 "Vary":"Origin"
});
const reply=(origin:string|null,status:number,value:unknown)=>new Response(JSON.stringify(value),{status,headers:headers(origin)});
const svc=()=>({apikey:SERVICE,Authorization:"Bearer "+SERVICE});
const normalize=(v:unknown)=>typeof v==="string"?v.trim().toLowerCase():"";
const validUsername=(v:string)=>v.length>=1&&[...v].length<=64&&!/[\u0000-\u001f\u007f@]/.test(v);
const validPassword=(v:unknown)=>typeof v==="string"&&v.length>=2&&v.length<=128;
async function rest(path:string,options:RequestInit={}):Promise<{status:number,ok:boolean,body:any}>{
 const h:Record<string,string>={...svc(),...(options.headers as Record<string,string>||{})};
 if(options.body)h["Content-Type"]="application/json";
 const r=await fetch(URL+"/rest/v1/"+path,{...options,headers:h,signal:AbortSignal.timeout(12000)});
 return {status:r.status,ok:r.ok,body:await r.json().catch(()=>({}))};
}
async function authApi(path:string,options:RequestInit={}):Promise<{status:number,ok:boolean,body:any}>{
 const h:Record<string,string>={...svc(),...(options.headers as Record<string,string>||{})};
 if(options.body)h["Content-Type"]="application/json";
 const r=await fetch(URL+"/auth/v1/admin/"+path,{...options,headers:h,signal:AbortSignal.timeout(15000)});
 return {status:r.status,ok:r.ok,body:await r.json().catch(()=>({}))};
}
async function allRows(name:string,fields:string,order="created_at.asc"){
 const output:any[]=[];
 for(let offset=0;offset<100000;offset+=1000){
  const path=name+"?select="+encodeURIComponent(fields)+"&order="+order+"&limit=1000&offset="+offset;
  const r=await rest(path);
  if(!r.ok||!Array.isArray(r.body))throw Error("list_"+name+"_failed");
  output.push(...r.body);
  if(r.body.length<1000)break;
 }
 return output;
}
async function derive(username:string,password:string):Promise<string>{
 const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(SERVICE),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
 const sig=new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode("wsc-station-password-v1:"+username+":"+password)));
 return "Aa1!"+btoa(String.fromCharCode(...sig));
}
async function generatedEmail(username:string){
 const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(username));
 const hex=Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,"0")).join("");
 return "account-"+hex.slice(0,48)+"@wsc-ops.example";
}
async function log(actor:any,op:string,target:string,details:Record<string,unknown>){
 try{
  const r=await rest("audit_logs",{method:"POST",body:JSON.stringify({
   table_name:"accounts",operation:op,actor_id:actor.id,actor_type:actor.account_role,
   row_id:target,details:{actor_name:actor.email||actor.id,...details}
  })});
  return r.ok;
 }catch{return false}
}
async function getTarget(id:string){
 const [adm,member,alias]=await Promise.all([
  rest("admin_users?select=user_id,role&user_id=eq."+encodeURIComponent(id)+"&limit=1"),
  rest("station_users?select=user_id,station_id,username&user_id=eq."+encodeURIComponent(id)+"&limit=1"),
  rest("account_logins?select=user_id,username,auth_email&user_id=eq."+encodeURIComponent(id)+"&limit=1")
 ]);
 if(!adm.ok||!member.ok||!alias.ok)throw Error("role_lookup_failed");
 const a=adm.body?.[0],m=member.body?.[0],l=alias.body?.[0];
 if(!a&&!m)return null;
 return {id,role:a?.role||"station",stationId:m?.station_id||null,username:l?.username||m?.username||null,alias:l||null};
}
async function stationIsActive(id:string){
 if(!/^[a-z0-9_-]{2,80}$/i.test(id))return false;
 const r=await rest("stations?select=id&id=eq."+encodeURIComponent(id)+"&active=eq.true&limit=1");
 return r.ok&&Array.isArray(r.body)&&r.body.length===1;
}
async function listAccounts(origin:string|null){
 const [admins,members,aliases,legacyUsers]=await Promise.all([
  allRows("admin_users","user_id,role,created_at"),
  allRows("station_users","user_id,username,station_id,created_at"),
  allRows("account_logins","user_id,username,auth_email,created_at"),
  authApi("users?per_page=1000")
 ]);
 const lookup=new Map(aliases.map((a:any)=>[a.user_id,a]));
 const legacy=new Map((legacyUsers.body?.users||[]).map((u:any)=>[u.id,u.email]));
 return reply(origin,200,{accounts:[
  ...admins.map((a:any)=>({id:a.user_id,role:a.role,stationId:null,
    username:lookup.get(a.user_id)?.username||null,
    email:lookup.get(a.user_id)?.auth_email?null:legacy.get(a.user_id)||null,createdAt:a.created_at})),
  ...members.map((m:any)=>({id:m.user_id,role:"station",stationId:m.station_id,
    username:lookup.get(m.user_id)?.username||m.username,createdAt:m.created_at}))
 ]});
}
async function registerAlias(id:string,username:string,email:string){
 return rest("account_logins",{method:"POST",body:JSON.stringify({user_id:id,username,auth_email:email})});
}
async function aliasForLegacy(target:any){
 if(target.alias)return target.alias;
 const got=await authApi("users/"+encodeURIComponent(target.id));
 const user=got.body?.user||got.body;
 const email=user?.email;
 if(!got.ok||typeof email!=="string"||!email.includes("@"))throw Error("legacy_account_not_found");
 const username=target.role==="station"?String(target.username):email.toLowerCase();
 const inserted=await registerAlias(target.id,username,email);
 if(!inserted.ok)throw Error("legacy_alias_failed");
 return {user_id:target.id,username,auth_email:email};
}
Deno.serve(async request=>{
 const origin=request.headers.get("origin");
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers:headers(origin)});
 if(origin!==ORIGIN)return reply(origin,403,{error:"origin_not_allowed"});
 if(request.method!=="POST")return reply(origin,405,{error:"method_not_allowed"});
 if(!URL.startsWith("https://")||!SERVICE||!ANON)return reply(origin,503,{error:"server_unavailable"});
 const token=(request.headers.get("authorization")||"").replace(/^Bearer /,"");
 if(token.length<50||token.length>9000)return reply(origin,401,{error:"login_required"});
 try{
  const who=await fetch(URL+"/auth/v1/user",{
   headers:{apikey:ANON,Authorization:"Bearer "+token},signal:AbortSignal.timeout(9000)});
  if(!who.ok)return reply(origin,401,{error:"login_required"});
  const actor=await who.json();
  if(typeof actor?.id!=="string"||!UUID.test(actor.id))return reply(origin,401,{error:"login_required"});
  const role=await rest("admin_users?select=role&user_id=eq."+encodeURIComponent(actor.id)+"&limit=1");
  if(!role.ok)return reply(origin,503,{error:"permission_lookup_failed"});
  const actorRole=role.body?.[0]?.role;
  actor.account_role=actorRole||"station";
  const raw=await request.text();
  if(raw.length>4500)return reply(origin,413,{error:"request_too_large"});
  let body:any;
  try{body=JSON.parse(raw)}catch{return reply(origin,400,{error:"invalid_json"})}
  if(!body||typeof body!=="object"||Array.isArray(body))return reply(origin,400,{error:"invalid_request"});
  const action=body.action;

  if(action==="change_own_password"){
   const oldPassword=body.oldPassword,newPassword=body.password;
   if(typeof oldPassword!=="string"||oldPassword.length<1||oldPassword.length>128||!validPassword(newPassword))
    return reply(origin,422,{error:"invalid_password"});
   if(oldPassword===newPassword)return reply(origin,422,{error:"same_password"});
   const target=await getTarget(actor.id);
   if(!target)return reply(origin,403,{error:"account_role_missing"});
   const known=target.alias;
   const email=known?.auth_email||actor.email;
   const tryPassword=known?await derive(known.username,oldPassword):oldPassword;
   const signIn=async(password:string)=>{
    const r=await fetch(URL+"/auth/v1/token?grant_type=password",{
     method:"POST",headers:{apikey:ANON,"Content-Type":"application/json"},
     body:JSON.stringify({email,password}),signal:AbortSignal.timeout(12000)});
    return r.ok?await r.json().catch(()=>null):null;
   };
   let validated=await signIn(tryPassword);
   if(!validated?.access_token&&!known&&target.role==="station"&&target.username===oldPassword&&/^\d{4}$/.test(oldPassword))
    validated=await signIn(await derive(target.username,oldPassword));
   if(!validated?.access_token||validated?.user?.id!==actor.id)
    return reply(origin,401,{error:"incorrect_current_password"});
   const alias=await aliasForLegacy(target);
   const updated=await authApi("users/"+encodeURIComponent(actor.id),{
    method:"PUT",body:JSON.stringify({password:await derive(alias.username,newPassword)})});
   if(!updated.ok)return reply(origin,503,{error:"password_update_failed"});
   const audit_logged=await log(actor,"SELF_PASSWORD_CHANGE",actor.id,{
    target_username:alias.username,target_role:target.role});
   return reply(origin,200,{status:"changed",audit_logged});
  }
  if(!["admin","superadmin"].includes(actorRole))return reply(origin,403,{error:"admin_required"});
  if(actorRole!=="superadmin")return reply(origin,403,{error:"superadmin_required"});
  if(action==="list")return await listAccounts(origin);
  if(action==="create"){
   const wantedRole=["station","admin","superadmin"].includes(body.role)?body.role:"";
   if(actorRole!=="superadmin"&&wantedRole!=="station")return reply(origin,403,{error:"superadmin_required"});
   const username=normalize(body.username);
   const password=body.password;
   const stationId=String(body.stationId||"").trim();
   if(!wantedRole||!validUsername(username)||!validPassword(password))
    return reply(origin,422,{error:"invalid_account_data"});
   if(wantedRole==="station"&&!(await stationIsActive(stationId)))
    return reply(origin,404,{error:"station_not_active"});
   const [existingAlias,existingLegacy]=await Promise.all([
    rest("account_logins?select=user_id&username=eq."+encodeURIComponent(username)+"&limit=1"),
    rest("station_users?select=user_id&username=eq."+encodeURIComponent(username)+"&limit=1")
   ]);
   if(!existingAlias.ok||!existingLegacy.ok)return reply(origin,503,{error:"name_check_failed"});
   if(existingAlias.body?.length||existingLegacy.body?.length)return reply(origin,409,{error:"username_unavailable"});
   const email=await generatedEmail(username);
   const strong=await derive(username,password);
   const created=await authApi("users",{method:"POST",body:JSON.stringify({
    email,password:strong,email_confirm:true,
    app_metadata:{account_type:wantedRole},
    user_metadata:{display_name:username}
   })});
   if(!created.ok)return reply(origin,created.status===422?409:503,{error:created.status===422?"username_unavailable":"user_creation_failed"});
   const id=created.body?.id||created.body?.user?.id;
   if(!UUID.test(id||""))return reply(origin,503,{error:"user_creation_unconfirmed"});
   const granted=wantedRole==="station"
    ?await rest("station_users",{method:"POST",body:JSON.stringify({user_id:id,username,station_id:stationId})})
    :await rest("admin_users",{method:"POST",body:JSON.stringify({user_id:id,role:wantedRole})});
   const aliased=granted.ok?await registerAlias(id,username,email):{ok:false};
   if(!granted.ok||!aliased.ok){
    await authApi("users/"+encodeURIComponent(id),{method:"DELETE"}).catch(()=>{});
    return reply(origin,503,{error:"role_assignment_failed"});
   }
   const audit_logged=await log(actor,"CREATE_ACCOUNT",id,{target_username:username,target_role:wantedRole,
     to_station:wantedRole==="station"?stationId:null});
   return reply(origin,201,{status:"created",id,username,role:wantedRole,
    stationId:wantedRole==="station"?stationId:null,audit_logged});
  }
  if(["reset_password","delete","move_station"].includes(action)){
   const id=String(body.id||"");
   if(!UUID.test(id))return reply(origin,422,{error:"invalid_user_id"});
   const target=await getTarget(id);
   if(!target)return reply(origin,404,{error:"user_not_found"});
   if(target.role!=="station"&&actorRole!=="superadmin")return reply(origin,403,{error:"superadmin_required"});
   if(action==="reset_password"){
    if(!validPassword(body.password))return reply(origin,422,{error:"invalid_password"});
    const alias=await aliasForLegacy(target);
    const actual=await derive(alias.username,body.password);
    const changed=await authApi("users/"+encodeURIComponent(id),{method:"PUT",body:JSON.stringify({password:actual})});
    if(!changed.ok)return reply(origin,503,{error:"reset_failed"});
    const audit_logged=await log(actor,"RESET_PASSWORD",id,{target_username:alias.username,
     target_role:target.role,station_id:target.stationId});
    return reply(origin,200,{status:"password_reset",id,audit_logged});
   }
   if(action==="delete"){
    if(target.id===actor.id)return reply(origin,403,{error:"cannot_delete_current_account"});
    if(target.role==="superadmin"){
     const admins=await rest("admin_users?select=user_id&role=eq.superadmin");
     if(!admins.ok||admins.body?.length<=1)return reply(origin,403,{error:"last_superadmin"});
    }
    const deleted=await authApi("users/"+encodeURIComponent(id),{method:"DELETE"});
    if(!deleted.ok)return reply(origin,503,{error:"delete_failed"});
    const audit_logged=await log(actor,"DELETE_ACCOUNT",id,{
     target_username:target.username,target_role:target.role,from_station:target.stationId});
    return reply(origin,200,{status:"deleted",id,audit_logged});
   }
   if(target.role!=="station")return reply(origin,422,{error:"station_account_required"});
   if(actorRole!=="superadmin")return reply(origin,403,{error:"superadmin_required"});
   const stationId=String(body.stationId||"").trim();
   if(!(await stationIsActive(stationId)))return reply(origin,404,{error:"station_not_active"});
   const r=await rest("station_users?user_id=eq."+encodeURIComponent(id),{
    method:"PATCH",body:JSON.stringify({station_id:stationId})});
   if(!r.ok)return reply(origin,503,{error:"station_reassignment_failed"});
   const audit_logged=await log(actor,"MOVE_STATION",id,{
    target_username:target.username,from_station:target.stationId,to_station:stationId});
   return reply(origin,200,{status:"reassigned",id,stationId,audit_logged});
  }
  return reply(origin,400,{error:"unknown_action"});
 }catch(e){
  console.error("account_manager_error",String(e).slice(0,160));
  return reply(origin,503,{error:"service_unavailable"});
 }
});
