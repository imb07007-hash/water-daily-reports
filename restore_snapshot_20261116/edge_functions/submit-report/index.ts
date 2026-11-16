
const ORIGIN="https://water-daily-reports.onrender.com";
Deno.serve((req:Request)=>{
 const origin=req.headers.get("origin");
 const h={
  "Access-Control-Allow-Origin":origin===ORIGIN?ORIGIN:"null",
  "Access-Control-Allow-Headers":"authorization,content-type,apikey",
  "Access-Control-Allow-Methods":"OPTIONS,GET,POST",
  "Content-Type":"application/json",
  "Cache-Control":"no-store",
  "Vary":"Origin"
 };
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:h});
 return new Response(JSON.stringify({error:"endpoint_disabled",message:"Sign in to the updated website; legacy public APIs are closed."}),{status:410,headers:h});
});
