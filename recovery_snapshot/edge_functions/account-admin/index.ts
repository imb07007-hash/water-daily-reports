
const URL=Deno.env.get("SUPABASE_URL")||"";
const SERVICE=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const ANON=Deno.env.get("SUPABASE_ANON_KEY")||"";
const ORIGIN="https://water-daily-reports.onrender.com";
const headers=(origin:string|null)=>({
  "Access-Control-Allow-Origin":origin===ORIGIN?ORIGIN:"null",
  "Access-Control-Allow-Headers":"authorization,content-type,apikey,x-client-info",
  "Access-Control-Allow-Methods":"POST,OPTIONS",
  "Content-Type":"application/json; charset=utf-8",
  "Cache-Control":"no-store","Vary":"Origin",
  "X-Content-Type-Options":"nosniff"
});
const response=(origin:string|null,status:number,obj:unknown)=>new Response(JSON.stringify(obj),{status,headers:headers(origin)});
const svc=()=>({apikey:SERVICE,Authorization:"Bearer "+SERVICE});
const email=(username:string)=>"station-"+username+"@wsc-ops.example";
const validPwd=(s:unknown)=>typeof s==="string"&&s.length>=12&&s.length<=128&&/[A-Z]/.test(s)&&/[a-z]/.test(s)&&/[0-9]/.test(s);
Deno.serve(async req=>{
  const origin=req.headers.get("origin");
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:headers(origin)});
  if(origin!==ORIGIN)return response(origin,403,{error:"origin_denied"});
  if(!URL.startsWith("https://")||!SERVICE||!ANON)return response(origin,503,{error:"not_configured"});
  if(req.method!=="POST")return response(origin,405,{error:"method_denied"});
  const authHeader=req.headers.get("authorization")||"";
  const token=authHeader.startsWith("Bearer ")?authHeader.slice(7):"";
  if(token.length<50||token.length>8000)return response(origin,401,{error:"login_required"});
  try {
    const verified=await fetch(URL+"/auth/v1/user",{
      headers:{apikey:ANON,Authorization:"Bearer "+token},signal:AbortSignal.timeout(9000)
    });
    if(!verified.ok)return response(origin,401,{error:"session_invalid"});
    const actor=await verified.json();
    const uid=actor.id;
    if(typeof uid!=="string"||!/^[0-9a-f-]{36}$/i.test(uid))return response(origin,401,{error:"session_invalid"});
    const role=await fetch(URL+"/rest/v1/admin_users?select=role&user_id=eq."+encodeURIComponent(uid)+"&limit=1",{
      headers:svc(),signal:AbortSignal.timeout(9000)
    });
    if(!role.ok)return response(origin,503,{error:"permission_lookup_failed"});
    const rows=await role.json();
    if(!rows.length||!["admin","superadmin"].includes(rows[0].role))return response(origin,403,{error:"admin_required"});
    const raw=await req.text();
    if(raw.length>3000)return response(origin,413,{error:"too_large"});
    const input=JSON.parse(raw);
    if(!input||typeof input!=="object"||Array.isArray(input))return response(origin,400,{error:"invalid_request"});
    if(input.action==="create"){
      const name=String(input.username||"").trim().toLowerCase(),stationId=String(input.stationId||"");
      if(!/^[a-z][a-z0-9_-]{2,24}$/.test(name)||name==="admin")return response(origin,422,{error:"invalid_username"});
      if(!/^[a-z][a-z0-9_-]{2,80}$/.test(stationId))return response(origin,422,{error:"invalid_station"});
      if(!validPwd(input.password))return response(origin,422,{error:"weak_password"});
      const station=await fetch(URL+"/rest/v1/stations?select=id&id=eq."+encodeURIComponent(stationId)+"&active=eq.true&limit=1",{headers:svc()});
      if(!station.ok||!(await station.json()).length)return response(origin,404,{error:"station_unavailable"});
      const created=await fetch(URL+"/auth/v1/admin/users",{
        method:"POST",headers:{...svc(),"Content-Type":"application/json"},
        body:JSON.stringify({email:email(name),password:input.password,email_confirm:true,app_metadata:{account_type:"station"}}),
        signal:AbortSignal.timeout(13000)
      });
      const createdBody=await created.json().catch(()=>({}));
      if(!created.ok)return response(origin,409,{error:"username_unavailable"});
      const newId=createdBody?.id||createdBody?.user?.id;
      if(!newId)return response(origin,503,{error:"user_creation_unconfirmed"});
      const added=await fetch(URL+"/rest/v1/station_users",{
        method:"POST",headers:{...svc(),"Content-Type":"application/json","Prefer":"return=representation"},
        body:JSON.stringify({user_id:newId,station_id:stationId,username:name}),signal:AbortSignal.timeout(10000)
      });
      if(!added.ok){
        await fetch(URL+"/auth/v1/admin/users/"+encodeURIComponent(newId),{method:"DELETE",headers:svc()}).catch(()=>{});
        return response(origin,503,{error:"membership_creation_failed"});
      }
      return response(origin,201,{status:"created",username:name,stationId});
    }
    if(input.action==="reset_password"){
      const name=String(input.username||"").trim().toLowerCase();
      if(!/^[a-z][a-z0-9_-]{2,24}$/.test(name)||!validPwd(input.password))return response(origin,422,{error:"invalid_request"});
      const look=await fetch(URL+"/rest/v1/station_users?select=user_id&username=eq."+encodeURIComponent(name)+"&limit=1",{headers:svc()});
      if(!look.ok)return response(origin,503,{error:"lookup_failed"});
      const users=await look.json();
      if(!users.length)return response(origin,404,{error:"unknown_username"});
      const changed=await fetch(URL+"/auth/v1/admin/users/"+encodeURIComponent(users[0].user_id),{
         method:"PUT",headers:{...svc(),"Content-Type":"application/json"},
         body:JSON.stringify({password:input.password}),signal:AbortSignal.timeout(10000)
      });
      if(!changed.ok)return response(origin,503,{error:"password_reset_failed"});
      return response(origin,200,{status:"password_changed",username:name});
    }
    return response(origin,400,{error:"unknown_action"});
  } catch (e) {
    console.error("account-admin error",String(e).slice(0,180));
    return response(origin,503,{error:"temporarily_unavailable"});
  }
});
