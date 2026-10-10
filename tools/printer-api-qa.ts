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

Deno.test('Bambu connect accepts success envelopes with null code and preserves old connection on rejection',async()=>{
 const original=globalThis.fetch;Deno.env.set('SUPABASE_URL','https://qa.invalid');Deno.env.set('SUPABASE_SERVICE_ROLE_KEY','qa-service-key');
 const ws='11111111-1111-4111-8111-111111111111',user='22222222-2222-4222-8222-222222222222';let writes=0,preferenceCalls=0;
 let login:unknown={accessToken:'qa-opaque-bambu-token'},loginHttp=200,preference:unknown={code:null,error:null,uid:'12345'},bind:unknown={code:null,error:null,message:'success',devices:[]},email:unknown={code:null,error:null};
 globalThis.fetch=async(input:RequestInfo|URL)=>{const url=String(input),respond=(data:unknown)=>Promise.resolve(new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}}));
  if(url.includes('/auth/v1/user'))return respond({id:user});
  if(url.includes('/rest/v1/workspaces'))return respond({owner_user_id:user});
  if(url.includes('/rest/v1/workspace_members'))return respond(null);
  if(url.includes('/user/login'))return new Response(JSON.stringify(login),{status:loginHttp});
  if(url.includes('/my/preference')){preferenceCalls++;return respond(preference);}
  if(url.includes('/user/bind'))return respond(bind);
  if(url.includes('/sendemail/code'))return respond(email);
  if(url.includes('/rpc/claim_printer_login_code'))return respond(true);
  if(url.includes('/rest/v1/printer_cloud_connections')){writes++;return respond(null);}
  throw new Error('Unexpected fixture request');
 };
 try{
  const call=(action='connect')=>handle(new Request('https://edge.invalid',{method:'POST',headers:{Authorization:'Bearer qa-user-jwt','Content-Type':'application/json'},body:JSON.stringify({workspaceId:ws,action,email:'qa@example.invalid',code:'123456'})}));
  const result=await call();
  assert(result.status===200,'Valid code:null business response must not reject a successful login: '+await result.text());
  assert(writes===1,'Connection saved only after required login steps');
  const payload=btoa(JSON.stringify({username:'u_6789',ignored:'qa-private'})).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  login={accessToken:'qa.'+payload+'.signature',code:null};preference={code:999};
  assert((await call()).status===200,'JWT username avoids unnecessary failing preference request');
  assert(preferenceCalls===1,'Preference only used for tokens without a usable username');
  const before=writes;
  for(const status of [200,400])for(const code of [1,2]){
    loginHttp=status;login={code,message:'qa@example.invalid secret-token 123456'};
    const r=await call(),text=await r.text();assert(r.status===502,'Rejected codes are never saved');
    assert(text.includes('Xác nhận mã email')&&text.includes(code===1?'hết hạn':'chưa đúng'),'Specific expired/incorrect error, not generic rejection');
    assert(!/qa@example|secret-token|123456/.test(text),'Upstream messages must not disclose secrets');
  }
  loginHttp=200;login={accessToken:'qa.'+payload+'.signature'};bind={code:987,error:'unsafe secret-token'};
  assert((await (await call()).text()).includes('Đọc danh sách máy'),'Bind failure is not described as an invalid email code');
  bind={code:null,error:null,devices:[]};email={code:null,success:false};
  assert((await call('email')).status===502,'HTTP 200 success:false is not successful email sending');
  assert(writes===before,'All rejected requests preserve previous connection');
 }finally{globalThis.fetch=original;}
});
