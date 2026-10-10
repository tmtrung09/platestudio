import {handle} from '../supabase/functions/bambu-monitor/api.ts'
const assert=(value:boolean,message:string)=>{if(!value)throw new Error(message)}
Deno.test('Bambu API: authenticated workspace boundary; readers cannot connect; no control route or secret response',async()=>{
 const original=globalThis.fetch;Deno.env.set('SUPABASE_URL','https://qa.invalid');Deno.env.set('SUPABASE_SERVICE_ROLE_KEY','qa-service-key');
 const ws='11111111-1111-4111-8111-111111111111',user='22222222-2222-4222-8222-222222222222';let role='reader',calls=0;
 globalThis.fetch=async(input:RequestInfo|URL,options?:RequestInit)=>{const url=String(input),respond=(data:unknown,status=200)=>Promise.resolve(new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}}));calls++;
  if(url.includes('/auth/v1/user'))return respond({id:user,app_metadata:{},user_metadata:{},aud:'authenticated',created_at:'2026-10-10'});
  if(url.includes('/rest/v1/workspaces'))return respond({owner_user_id:role==='owner'?user:'33333333-3333-4333-8333-333333333333'});
  if(url.includes('/rest/v1/workspace_members'))return respond(role==='outsider'?null:{permissions:['progress.view']});
  if(url.includes('/rest/v1/printer_cloud_connections'))return respond(null);
  if(url.includes('/rest/v1/printer_monitor_states'))return respond(null);
  if(url.includes('/rest/v1/printer_monitor_events')||url.includes('/rest/v1/printer_monitor_runs'))return respond([]);
  throw new Error('Unexpected request '+new URL(url).pathname+' '+options?.method);
 };
 try{
  const call=(action:string,auth=true)=>handle(new Request('https://edge.invalid',{method:'POST',headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer qa-user-jwt'}:{})},body:JSON.stringify({workspaceId:ws,action})}));
  const unauth=await call('read',false);assert(unauth.status===401,'No anonymous reads');assert(calls===0,'Unauthorized request does not call cloud');
  const read=await call('read');assert(read.status===200,'Progress reader can view status');const data=await read.text();assert(!/sealed_session|qa-service-key|accessToken/.test(data),'No credentials returned');
  for(const action of ['email','connect','disconnect','models'])assert((await call(action)).status===403,'Reader cannot mutate '+action);
  role='outsider';assert((await call('read')).status===403,'Cross-workspace reader denied');role='owner';assert((await call('pause')).status===400,'No printer control endpoint');assert((await call('stream')).status===409,'Never fake a connected printer');
  const bad=await handle(new Request('https://edge.invalid',{method:'POST',headers:{Authorization:'Bearer qa-user-jwt','Content-Type':'application/json'},body:'{}'}));assert(bad.status===400,'Missing workspace denied');
 }finally{globalThis.fetch=original;}
});
