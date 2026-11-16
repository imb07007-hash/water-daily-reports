
const URL=Deno.env.get("SUPABASE_URL")||"";
const ANON=Deno.env.get("SUPABASE_ANON_KEY")||"";
const SERVICE=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const ORIGIN="https://water-daily-reports.onrender.com";
const hdr=(origin:string|null)=>({
 "Access-Control-Allow-Origin":origin===ORIGIN?ORIGIN:"null",
 "Access-Control-Allow-Methods":"POST,OPTIONS",
 "Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info",
 "Content-Type":"application/json;charset=utf-8",
 "Cache-Control":"no-store",
 "Vary":"Origin",
 "X-Content-Type-Options":"nosniff"
});
const reply=(origin:string|null,status:number,body:unknown)=>
 new Response(JSON.stringify(body),{status,headers:hdr(origin)});
Deno.serve(async request=>{
 const origin=request.headers.get("origin");
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers:hdr(origin)});
 if(origin!==ORIGIN)return reply(origin,403,{error:"origin_denied"});
 if(request.method!=="POST")return reply(origin,405,{error:"method_not_allowed"});
 if(!URL.startsWith("https://")||!ANON||!SERVICE)return reply(origin,503,{error:"service_unavailable"});
 try{
  const token=(request.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
  if(token.length<80||token.length>9000)return reply(origin,401,{error:"login_required"});
  const identity=await fetch(URL+"/auth/v1/user",{headers:{apikey:ANON,Authorization:"Bearer "+token},
   signal:AbortSignal.timeout(11000)});
  if(!identity.ok)return reply(origin,401,{error:"login_required"});
  const who=await identity.json();
  const id=who?.id;
  if(typeof id!=="string"||!/^[0-9a-f-]{36}$/i.test(id))return reply(origin,401,{error:"invalid_user"});
  const raw=await request.text();
  if(raw.length>1000)return reply(origin,413,{error:"request_too_large"});
  const data=JSON.parse(raw);
  const label=typeof data?.label==="string"?data.label.trim():"";
  const unit=typeof data?.unit==="string"?data.unit.trim():"";
  if(label.length<2||label.length>70||unit.length>20||/[<>]/.test(label+unit))
   return reply(origin,422,{error:"invalid_metric"});
  const authHeaders={apikey:SERVICE,Authorization:"Bearer "+SERVICE};
  const row=await fetch(URL+"/rest/v1/station_users?select=station_id&user_id=eq."+encodeURIComponent(id)+"&limit=1",{
   headers:authHeaders,signal:AbortSignal.timeout(11000)});
  if(!row.ok)return reply(origin,503,{error:"profile_unavailable"});
  const account=await row.json();
  const stationId=account?.[0]?.station_id;
  if(!stationId)return reply(origin,403,{error:"station_member_required"});
  const replyApi=await fetch(URL+"/rest/v1/rpc/append_station_metric",{
   method:"POST",headers:{...authHeaders,"Content-Type":"application/json"},
   body:JSON.stringify({p_station_id:stationId,p_label:label,p_unit:unit}),
   signal:AbortSignal.timeout(12000)
  });
  const result=await replyApi.json().catch(()=>({}));
  if(!replyApi.ok){
   const message=String(result?.message||"");
   const error=message.includes("duplicate_metric")?"duplicate_metric":
    message.includes("metric_limit_reached")?"metric_limit_reached":"cannot_add_metric";
   return reply(origin,409,{error});
  }
  return reply(origin,201,{status:"added",metric:result,stationId});
 }catch(e){
  console.error("station_metric_add_error",String(e).slice(0,160));
  return reply(origin,503,{error:"service_unavailable"});
 }
});
