/* WS-PTW native print adapter (server-confirmed drafts only) */
(()=>{'use strict';
const target=k=>k==='main'?'/assets/ptw-print-st7-1.html?v=1.5.0':'/assets/ptw-print-st7-11.html?v=1.5.0';
async function open(kind){
 if(!['main','iso'].includes(kind))throw Error('Invalid print form');
 const tab=window.open(target(kind),'_blank');if(!tab){alert('اسمح بفتح نافذة المعاينة');return;}
 let ready=false,data=null,disposed=false;const cleanup=()=>{if(disposed)return;disposed=true;window.removeEventListener('message',onMessage);clearTimeout(timer);};
 function send(){if(ready&&data&&!tab.closed)tab.postMessage({type:'WS_PTW_PRINT_DATA',kind,payload:data},location.origin);}
 function onMessage(e){if(e.source!==tab||e.origin!==location.origin||!e.data)return;if(e.data.type==='WS_PTW_PRINT_READY'&&e.data.kind===kind){ready=true;send()}if(e.data.type==='WS_PTW_PRINT_LOADED'&&e.data.kind===kind)cleanup();}
 window.addEventListener('message',onMessage);
 const timer=setTimeout(()=>{if(!disposed){cleanup();if(!tab.closed)tab.close();alert('انتهت مهلة المعاينة');}},20000);
 try{data=await window.WSPTW.snapshotForPrint();send();}catch(e){cleanup();if(!tab.closed)tab.close();alert('لم تفتح المعاينة: '+e.message);}
}
window.WSPTWPrint=Object.freeze({open});
})();