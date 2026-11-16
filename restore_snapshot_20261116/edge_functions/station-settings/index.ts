
const URL=Deno.env.get("SUPABASE_URL")||"";
const SERVICE=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const ANON=Deno.env.get("SUPABASE_ANON_KEY")||"";
const ORIGIN="https://water-daily-reports.onrender.com";
const headers=(o:string|null)=>({
 "Access-Control-Allow-Origin":o===ORIGIN?ORIGIN:"null",
 "Access-Control-Allow-Headers":"apikey,authorization,content-type,x-client-info",
 "Access-Control-Allow-Methods":"POST,OPTIONS",
 "Content-Type":"application/json;charset=utf-8",
 "Cache-Control":"no-store",
 "Vary":"Origin",
 "X-Content-Type-Options":"nosniff"
});
const reply=(o:string|null,status:number,data:unknown)=>
 new Response(JSON.stringify(data),{status,headers:headers(o)});
const serverHeaders=()=>({apikey:SERVICE,Authorization:"Bearer "+SERVICE});
const validId=(v:any)=>typeof v==="string"&&/^[a-zA-Z0-9_-]{2,80}$/.test(v);
const validFieldId=(v:any)=>typeof v==="string"&&/^[a-zA-Z0-9_-]{1,80}$/.test(v);
const validText=(v:any,min:number,max:number)=>typeof v==="string"&&v.trim().length>=min&&v.length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f<>]/.test(v);
const isObj=(v:any)=>!!v&&typeof v==="object"&&!Array.isArray(v);
async function rest(path:string,method="GET",body?:any){
 const r=await fetch(URL+"/rest/v1/"+path,{
  method,headers:{...serverHeaders(),...(body===undefined?{}:{"Content-Type":"application/json"})},
  ...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(12000)
 });
 return {ok:r.ok,status:r.status,data:await r.json().catch(()=>null)};
}
function configOk(config:any){
 if(!isObj(config)||!validId(config.id)||!validText(config.name,2,200))return false;
 if(!Array.isArray(config.metrics)||config.metrics.length>100
  ||!Array.isArray(config.groups)||config.groups.length>40
  ||!Array.isArray(config.noteFields)||config.noteFields.length>30)return false;
 const mIds=new Set<string>(),gIds=new Set<string>(),nIds=new Set<string>();
 for(const m of config.metrics){
  if(!isObj(m)||!validFieldId(m.id)||!validText(m.label,1,200)||typeof m.unit!=="string"&&m.unit!==undefined
     ||typeof m.unit==="string"&&m.unit.length>40||mIds.has(m.id))return false;
  mIds.add(m.id);
 }
 for(const g of config.groups){
  if(!isObj(g)||!validFieldId(g.id)||!validText(g.title,1,200)||!["tanks","bars","values","wtp","meter"].includes(g.kind)
     ||!Array.isArray(g.items)||g.items.length>100||gIds.has(g.id))return false;
  gIds.add(g.id);
  const seen=new Set<string>();
  for(const it of g.items){
   if(!isObj(it)||!validFieldId(it.id)||!validText(it.label,1,200)||it.unit!==undefined&&typeof it.unit!=="string"
     ||typeof it.unit==="string"&&it.unit.length>40||seen.has(it.id))return false;
   seen.add(it.id);
  }
 }
 for(const item of config.noteFields){
  if(!isObj(item)||!validFieldId(item.id)||!validText(item.label,1,200)||nIds.has(item.id))return false;
  nIds.add(item.id);
 }
 return true;
}
Deno.serve(async req=>{
 const origin=req.headers.get("origin");
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:headers(origin)});
 if(origin!==ORIGIN)return reply(origin,403,{error:"origin_denied"});
 if(req.method!=="POST")return reply(origin,405,{error:"method_not_allowed"});
 if(!URL.startsWith("https://")||!SERVICE||!ANON)return reply(origin,503,{error:"service_unavailable"});
 try{
  const token=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
  if(token.length<70||token.length>9000)return reply(origin,401,{error:"login_required"});
  const auth=await fetch(URL+"/auth/v1/user",{
   headers:{apikey:ANON,Authorization:"Bearer "+token},signal:AbortSignal.timeout(11000)});
  if(!auth.ok)return reply(origin,401,{error:"login_required"});
  const user=await auth.json();
  if(typeof user?.id!=="string"||!/^[a-f0-9-]{36}$/i.test(user.id))
   return reply(origin,401,{error:"login_required"});
  const uid=encodeURIComponent(user.id);
  const [admins,members]=await Promise.all([
   rest("admin_users?select=role&user_id=eq."+uid+"&limit=1"),
   rest("station_users?select=station_id&user_id=eq."+uid+"&limit=1")
  ]);
  if(!admins.ok||!members.ok)return reply(origin,503,{error:"permission_lookup_failed"});
  const role=Array.isArray(admins.data)?admins.data[0]?.role:null;
  const isManager=role==="superadmin"||role==="admin";
  const ownStation=Array.isArray(members.data)?members.data[0]?.station_id:null;
  if(!isManager&&!ownStation)return reply(origin,403,{error:"station_access_denied"});

  const raw=await req.text();
  if(raw.length>280000)return reply(origin,413,{error:"request_too_large"});
  const body=JSON.parse(raw);
  if(!isObj(body))return reply(origin,400,{error:"invalid_request"});
  const action=body.action;
  if(!["save","deactivate"].includes(action))return reply(origin,400,{error:"invalid_action"});
  const targetId=action==="save"?body.config?.id:body.stationId;
  if(!validId(targetId))return reply(origin,422,{error:"invalid_station"});
  if(!isManager&&targetId!==ownStation)return reply(origin,403,{error:"foreign_station_denied"});
  if(action==="deactivate"&&!isManager)return reply(origin,403,{error:"station_management_required"});
  if(action==="save"&&!configOk(body.config))return reply(origin,422,{error:"invalid_station_configuration"});

  const existing=await rest("stations?select=id,updated_at,active&id=eq."+encodeURIComponent(targetId)+"&limit=1");
  if(!existing.ok)return reply(origin,503,{error:"station_lookup_failed"});
  const prior=Array.isArray(existing.data)?existing.data[0]:null;
  if(!isManager&&(!prior||!prior.active))return reply(origin,403,{error:"station_not_active"});
  const updatedAt=typeof body.expectedUpdatedAt==="string"?body.expectedUpdatedAt:null;
  if(prior&&(!updatedAt||updatedAt!==prior.updated_at))return reply(origin,409,{error:"station_settings_conflict"});
  if(!prior&&(!isManager||action==="deactivate"))return reply(origin,403,{error:"station_creation_denied"});

  const proc=action==="save"?"save_station_settings":"deactivate_station_settings";
  const args=action==="save"
   ?{p_station_id:targetId,p_config:body.config,p_expected_updated_at:updatedAt,p_allow_create:isManager}
   :{p_station_id:targetId,p_expected_updated_at:updatedAt};
  const saved=await rest("rpc/"+proc,"POST",args);
  if(!saved.ok){
   const detail=String(saved.data?.message||"");
   if(detail.includes("station_settings_conflict"))return reply(origin,409,{error:"station_settings_conflict"});
   if(detail.includes("station_create_not_allowed"))return reply(origin,403,{error:"station_creation_denied"});
   if(detail.includes("last_active_station"))return reply(origin,422,{error:"last_active_station"});
   return reply(origin,422,{error:"station_save_failed"});
  }
  return reply(origin,200,{status:action==="save"?"saved":"deactivated",station:saved.data});
 }catch(err){
  console.error("station_settings_error",String(err).slice(0,140));
  return reply(origin,503,{error:"service_unavailable"});
 }
});
