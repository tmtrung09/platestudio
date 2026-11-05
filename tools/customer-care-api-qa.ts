import assert from 'node:assert/strict';
import {isCareImage,sha256,readCareBody} from '../supabase/functions/custom-order-care/media.ts';
import {sendZaloTemplate} from '../supabase/functions/custom-care-zalo/send.ts';
const png=new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0]);
Deno.test('image signatures, byte limit and streamed request limit',async()=>{
 assert.equal(isCareImage(png,'image/png'),true);assert.equal(isCareImage(png,'image/jpeg'),false);
 assert.equal(isCareImage(new TextEncoder().encode('<svg onload="alert(1)"></svg>'),'image/png'),false);
 assert.equal(isCareImage(new Uint8Array(5242881),'image/png'),false);
 assert.equal((await sha256(png)).length,64);
 await assert.rejects(()=>readCareBody(new Request('https://test',{method:'POST',body:' '.repeat(32769)})),RangeError);
 await assert.rejects(()=>readCareBody(new Request('https://test',{method:'POST',body:'null'})),SyntaxError);
});
Deno.test('Zalo payload and definite/uncertain outcomes; no blind retry',async()=>{
 const input={accessToken:'fixture-not-a-secret',phone:'0901234567',templateId:'123',trackingId:'stable-id',templateData:{order_code:'order',warranty_code:'code'}};
 let calls=0;
 const transport:typeof fetch=async(url,init)=>{calls++;assert.equal(url,'https://business.openapi.zalo.me/message/template');const b=JSON.parse(String((init as {body?:unknown})?.body));assert.equal(b.phone,'84901234567');assert.equal(b.tracking_id,input.trackingId);assert.equal(new Headers((init as {headers?:HeadersInit})?.headers).get('access_token'),input.accessToken);return Response.json({error:0,data:{msg_id:'provider-id'}});};
 assert.deepEqual(await sendZaloTemplate(input,transport),{outcome:'sent',providerId:'provider-id'});assert.equal(calls,1);
 for(const [status,outcome] of [[429,'pending'],[503,'unknown']] as const)assert.equal((await sendZaloTemplate(input,async()=>new Response('',{status}))).outcome,outcome);
 assert.equal((await sendZaloTemplate(input,async()=>Response.json({error:-201}))).outcome,'blocked');
 assert.equal((await sendZaloTemplate(input,async()=>{throw Error('Response lost');})).outcome,'unknown');
 assert.equal((await sendZaloTemplate({...input,phone:'invalid'},()=>{throw Error('Must not call provider');})).outcome,'blocked');
});
// Capture the actual Edge entry point; all HTTP transports below are isolated.
let handler:(req:Request)=>Promise<Response>;
const originalServe=Deno.serve;
Object.defineProperty(Deno,'serve',{value:(fn:typeof handler)=>{handler=fn;return {};},configurable:true});
await import('../supabase/functions/custom-order-care/index.ts');
let worker:(req:Request)=>Promise<Response>;Object.defineProperty(Deno,'serve',{value:(fn:typeof handler)=>{worker=fn;return {};},configurable:true});await import('../supabase/functions/custom-care-zalo/index.ts');
Object.defineProperty(Deno,'serve',{value:originalServe,configurable:true});
Deno.test('actual Edge routing: token validation, signing boundary, media digest and staff JWT',async()=>{
 const originalFetch=globalThis.fetch;const names=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_ANON_KEY'];const previous=names.map(n=>Deno.env.get(n));
 Deno.env.set(names[0],'https://backend.test');Deno.env.set(names[1],'fixture-service');Deno.env.set(names[2],'fixture-anon');
 let calls:string[]=[],actorHeader='',denyStaff=false,corrupt=false;
 const manifest=[{path:'workspace/request/file.png',size:png.length,type:'image/png',sha256:await sha256(png),name:'photo.png'}];
 globalThis.fetch=async(input,init)=>{
  const url=String(input);calls.push(url);
  if(url.includes('/auth/v1/user'))return Response.json({id:'user',email:'fixture@example.test'});
  if(url.includes('/rest/v1/rpc/')){
   const fn=url.split('/').pop();
   if(fn==='custom_care_inbox'||fn==='decide_custom_care'){actorHeader=new Headers((init as {headers?:HeadersInit})?.headers).get('authorization')||'';if(denyStaff)return Response.json({code:'42501',message:'Không có quyền'},{status:403});}
   if(fn==='reserve_custom_care_upload')return Response.json(manifest);
   return Response.json({eligible:true,review:null,warranties:[{id:'care',images:[{path:manifest[0].path,name:'photo.png'}]}]});
  }
  if(url.includes('/storage/v1/object/sign/'))return Response.json({signedURL:'/object/sign/own-photo?token=fixture'});
  if(url.includes('/storage/v1/object/'))return new Response(corrupt?new Uint8Array(12):png,{headers:{'Content-Type':'image/png'}});
  throw Error('Unexpected mock route');
 };
 const token='a'.repeat(64),requestId='11111111-1111-4111-8111-111111111111';
 const invoke=(body:unknown,bearer='')=>handler(new Request('https://edge.test',{method:'POST',headers:{'Content-Type':'application/json',...(bearer?{Authorization:'Bearer '+bearer}:{})},body:JSON.stringify(body)}));
 try{
  assert.equal((await invoke({action:'read',token:'bad'})).status,404);assert.equal(calls.length,0);
  let response=await invoke({action:'read',token,path:'foreign/private.png'});assert.equal(response.status,200);let result=await response.json();assert.equal(result.care.warranties[0].images[0].path,undefined);assert.ok(!calls.some(c=>c.includes('foreign')));
  corrupt=true;response=await invoke({action:'submit',token,requestId,files:manifest,payload:{kind:'warranty'}});assert.equal(response.status,409);assert.equal((await response.json()).code,'MEDIA_MISMATCH');assert.ok(!calls.some(c=>c.endsWith('/submit_custom_care')));
  corrupt=false;response=await invoke({action:'submit',token,requestId,files:manifest,payload:{kind:'warranty'}});assert.equal(response.status,200);
  calls=[];response=await invoke({action:'inbox',workspaceId:requestId});assert.equal(response.status,401);
  response=await invoke({action:'inbox',workspaceId:requestId},'fixture-user-token');assert.equal(response.status,200);assert.equal(actorHeader,'Bearer fixture-user-token','Staff RPC must use actor JWT, not service role');
  denyStaff=true;response=await invoke({action:'inbox',workspaceId:requestId},'fixture-outsider');assert.equal(response.status,403);
  response=await handler(new Request('https://edge.test',{method:'POST',body:'a'.repeat(33000)}));assert.equal(response.status,413);
  response=await handler(new Request('https://edge.test',{method:'GET'}));assert.equal(response.status,405);
 }finally{globalThis.fetch=originalFetch;names.forEach((n,i)=>previous[i]===undefined?Deno.env.delete(n):Deno.env.set(n,previous[i]!));}
});

Deno.test('actual Zalo worker: authenticated manager, fixed OA workspace and missing-config safety',async()=>{
 const names=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_ANON_KEY','ZALO_CARE_WORKSPACE_ID','ZALO_OA_ACCESS_TOKEN','ZALO_CARE_APPROVED_TEMPLATE','ZALO_CARE_READY_TEMPLATE','CUSTOM_CARE_PUBLIC_URL'];
 const previous=names.map(n=>Deno.env.get(n)),originalFetch=globalThis.fetch,w='11111111-1111-4111-8111-111111111111';
 Deno.env.set(names[0],'https://backend.test');Deno.env.set(names[1],'fixture-service');Deno.env.set(names[2],'fixture-anon');names.slice(3).forEach(n=>Deno.env.delete(n));
 let allowed=false,claims=0,configured=true;
 globalThis.fetch=async(input,init)=>{const url=String(input);if(url.includes('/auth/v1/user'))return Response.json({id:'fixture-user'});if(url.endsWith('/can_manage_custom_care'))return Response.json(allowed);if(url.endsWith('/claim_custom_care_zalo')){claims++;configured=JSON.parse(String((init as {body?:unknown})?.body)).configured;return Response.json([]);}throw Error('Unexpected transport; must never send real Zalo');};
 const invoke=()=>worker(new Request('https://edge.test',{method:'POST',headers:{Authorization:'Bearer fixture-user-token'},body:JSON.stringify({workspaceId:w})}));
 try{
  assert.equal((await invoke()).status,403);assert.equal(claims,0);
  allowed=true;let response=await invoke();assert.equal(response.status,200);assert.equal(configured,false);assert.equal((await response.json()).accepted,0);
  Deno.env.set('ZALO_CARE_WORKSPACE_ID','11111111-1111-4111-8111-111111111111');
  Deno.env.set('ZALO_OA_ACCESS_TOKEN','fixture-token');
  Deno.env.set('ZALO_CARE_APPROVED_TEMPLATE','7895417a7d3f9461cd2e');
  Deno.env.set('ZALO_CARE_READY_TEMPLATE','123456');
  Deno.env.set('CUSTOM_CARE_PUBLIC_URL','https://example.test/platestudio/order-status.html');
  response=await invoke();assert.equal(response.status,200);assert.equal(configured,true,'ZBS accepts alphanumeric template IDs');assert.equal((await response.json()).accepted,0);
  Deno.env.set('ZALO_CARE_WORKSPACE_ID','22222222-2222-4222-8222-222222222222');const before=claims;assert.equal((await invoke()).status,403);assert.equal(claims,before,'Another workspace cannot use the OA');
 }finally{globalThis.fetch=originalFetch;names.forEach((n,i)=>previous[i]===undefined?Deno.env.delete(n):Deno.env.set(n,previous[i]!));}
});
