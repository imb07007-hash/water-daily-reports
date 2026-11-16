
const URL=Deno.env.get("SUPABASE_URL")||"";
const SERVICE=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const ANON=Deno.env.get("SUPABASE_ANON_KEY")||"";
const ORIGIN="https://water-daily-reports.onrender.com";
const ALLOWED=new Set(["PRINT_REQUESTED","IMAGE_EXPORTED","SHARE_REQUESTED","VIEW_REPORT","DASHBOARD_VIEW"]);
const headers=(origin:string|null)=>({
 "Access-Control-Allow-Origin":origin===ORIGIN?ORIGIN:"null",
 "Access-Control-Allow-Headers":"authorization,content-type,apikey,x-client-info",
 "Access-Control-Allow-Methods":"POST,OPTIONS",
 "Content-Type":"application/json;charset=utf-8","Cache-Control":"no-store","Vary":"Origin"
});
const answer=(origin:string|null,status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:headers(origin)});
const svc=()=>({apikey:SERVICE,Authorization:"Bearer "+SERVICE});
async function select(path:string){
 const resp=await fetch(URL+"/rest/v1/"+path,{headers:svc(),signal:AbortSignal.timeout(10000)});
 if(!resp.ok)throw Error("db_"+resp.status);
 return await resp.json();
}
Deno.serve(async request=>{
 const origin=request.headers.get("origin");
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers:headers(origin)});
 if(origin!==ORIGIN)return answer(origin,403,{error:"origin_denied"});
 if(request.method!=="POST")return answer(origin,405,{error:"method_denied"});
 if(!SERVICE||!ANON||!URL.startsWith("https://"))return answer(origin,503,{error:"not_configured"});
 try{
  const authorization=request.headers.get("authorization")||"";
  const token=authorization.startsWith("Bearer ")?authorization.slice(7):"";
  if(token.length<50||token.length>9000)return answer(origin,401,{error:"login_required"});
  const verify=await fetch(URL+"/auth/v1/user",{
   headers:{apikey:ANON,Authorization:"Bearer "+token},signal:AbortSignal.timeout(8000)
  });
  if(!verify.ok)return answer(origin,401,{error:"session_invalid"});
  const user=await verify.json();
  if(typeof user?.id!=="string")return answer(origin,401,{error:"session_invalid"});
  const raw=await request.text();
  if(raw.length>1200)return answer(origin,413,{error:"too_large"});
  const payload=JSON.parse(raw);
  if(!payload||typeof payload!=="object"||!ALLOWED.has(payload.action))return answer(origin,422,{error:"invalid_action"});
  const sid=String(payload.stationId||"");
  const date=String(payload.reportDate||"");
  const reportId=String(payload.reportId||"");
  if(!/^[a-zA-Z0-9_-]{2,80}$/.test(sid)||!/^20\d\d-\d\d-\d\d$/.test(date))
   return answer(origin,422,{error:"invalid_report_context"});
  if(reportId&&!/^[0-9a-f-]{36}$/i.test(reportId))return answer(origin,422,{error:"invalid_report_id"});
  const [admin,member]=await Promise.all([
   select("admin_users?select=role&user_id=eq."+encodeURIComponent(user.id)+"&limit=1"),
   select("station_users?select=username,station_id&user_id=eq."+encodeURIComponent(user.id)+"&limit=1")
  ]);
  let role="",who="";
  if(admin.length&&["admin","superadmin"].includes(admin[0].role)){role=admin[0].role;who=user.email||user.id;}
  else if(member.length&&member[0].station_id===sid){role="station";who=member[0].username;}
  else return answer(origin,403,{error:"station_access_denied"});
  const station=await select("stations?select=id&id=eq."+encodeURIComponent(sid)+"&active=eq.true&limit=1");
  if(!station.length)return answer(origin,403,{error:"station_not_active"});
  const data={
   table_name:"activity",operation:payload.action,actor_id:user.id,actor_type:role,
   row_id:reportId||sid,details:{
    actor_name:who,station_id:sid,report_date:date,
    event_source:"authenticated_web_app",
    note:"Interface activity; printing/sharing depends on the user device."
   }
  };
  const posted=await fetch(URL+"/rest/v1/audit_logs",{
   method:"POST",headers:{...svc(),"Content-Type":"application/json"},
   body:JSON.stringify(data),signal:AbortSignal.timeout(10000)
  });
  if(!posted.ok)return answer(origin,503,{error:"audit_write_failed"});
  return answer(origin,200,{status:"logged"});
 }catch(e){console.error("activity-log",String(e).slice(0,130));return answer(origin,503,{error:"audit_unavailable"})}
});
