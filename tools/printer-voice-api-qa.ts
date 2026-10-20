import {handle} from '../supabase/functions/printer-voice/api.ts';
const assert=(value:boolean,label:string)=>{if(!value)throw new Error(label);};
const ws='11111111-1111-4111-8111-111111111111',owner='22222222-2222-4222-8222-222222222222';
function wave(){const data=new Uint8Array(44+96000),view=new DataView(data.buffer);for(const [at,text] of [[0,'RIFF'],[8,'WAVEfmt '],[36,'data']] as const)for(let i=0;i<text.length;i++)data[at+i]=text.charCodeAt(i);view.setUint32(4,data.length-8,true);view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,24000,true);view.setUint32(28,48000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);view.setUint32(40,96000,true);return data;}
Deno.test('Enya API: JWT user/workspace/event boundaries, bounded generation, private cache and safe errors',async()=>{
 const original=fetch;Deno.env.set('SUPABASE_URL','https://qa.invalid');Deno.env.set('SUPABASE_SERVICE_ROLE_KEY','qa-private-admin');Deno.env.set('GEMINI_API_KEY','qa-private-gemini');
 const now=new Date().toISOString(),event={id:'event-1',deviceId:'machine-1',jobKey:'run-1',type:'printer_paused',createdAt:now},device={id:'machine-1',name:'Mỹ Mỹ',phase:'PAUSE',online:true,lastReport:now,run:{id:'run-1',result:'running'},issues:[{severity:'error',code:'03004006',original:'The nozzle is clogged.'}]};
 let role='owner',authenticated=true,publicBucket=false,claim='claimed',providerCalls=0,uploads=0,failed=false,malformed=false,generatedText='',latest:any[]=[event];
 const respond=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
 globalThis.fetch=async(input:RequestInfo|URL,options?:RequestInit)=>{
  const url=String(input),body=options?.body&&typeof options.body==='string'?JSON.parse(options.body):{};
  if(url.includes('/auth/v1/user'))return authenticated?respond({id:owner}):respond({message:'invalid'},401);
  if(url.includes('/rest/v1/workspaces'))return respond({owner_user_id:role==='owner'?owner:'33333333-3333-4333-8333-333333333333'});
  if(url.includes('/rest/v1/workspace_members'))return respond(role==='outsider'?null:{permissions:['progress.view']});
  if(url.includes('/rest/v1/printer_monitor_events'))return respond(/[?&]id=/.test(url)?{data:event,seq:1}:latest.map((data,index)=>({data,seq:index+2})));
  if(url.includes('/rest/v1/printer_monitor_states'))return respond({data:{devices:{'machine-1':device}}});
  if(url.includes('/rpc/claim_printer_voice'))return respond(claim);
  if(url.includes('/rpc/finish_printer_voice')){if(body.p_path)claim='ready';return respond(true);}
  if(url.includes('/storage/v1/bucket/camera-sounds'))return respond({public:publicBucket});
  if(url.includes('/storage/v1/object/')){if(options?.method==='POST'){uploads++;return respond({Key:'private.wav'});}return new Response(wave(),{headers:{'Content-Type':'audio/wav'}});}
  if(url==='https://generativelanguage.googleapis.com/v1beta/interactions'){
   providerCalls++;assert(body.generation_config.speech_config[0].voice==='Enya','Only approved Enya');assert(body.model==='gemini-3.8-flash-tts','Only fixed model');generatedText=body.input[0].content[0].text;
   if(failed)return respond({error:{message:'qa-private-gemini must never leak'}},500);
   const audio=wave();if(malformed)new DataView(audio.buffer).setUint32(40,99999999,true);
   return respond({steps:[{type:'model_output',content:[{type:'audio',data:btoa(String.fromCharCode(...audio))}]}]});
  }
  throw new Error('Unexpected fixture request');
 };
 const call=async(patch:any={},auth=true)=>{
  const policy=(globalThis as any).PlatePrinterVoicePolicy,text=policy.textFor({event:patch.mode==='preview'?{type:'preview'}:event,issues:device.issues,name:patch.name||'Tiểu Mỹ Thụ'});
  const expectedHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(policy.version+'\n'+text)))).map(value=>value.toString(16).padStart(2,'0')).join('');
  return handle(new Request('https://edge.invalid',{method:'POST',headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer qa-jwt'}:{})},body:JSON.stringify({workspaceId:ws,eventId:'printer:event-1',name:'Tiểu Mỹ Thụ',expectedHash,...patch})}));
 };
 try{
  assert((await call({},false)).status===401,'Anonymous request rejected before provider');authenticated=false;assert((await call()).status===401,'Invalid JWT denied');authenticated=true;
  role='outsider';assert((await call()).status===403,'Cross-workspace denied');role='reader';assert((await call({text:'arbitrary text'})).status===400,'Freeform TTS denied');role='owner';
  assert(providerCalls===0,'Denied requests never invoke generation');
  assert((await call({expectedHash:'0'.repeat(64)})).status===409,'Changed cause/name cannot return a different spoken message');
  device.phase='RUNNING';assert((await call()).status===409,'Running machine cannot speak an old error');device.phase='PAUSE';
  latest=[{...event,id:'newer',type:'printer_resumed',createdAt:new Date(Date.now()+1000).toISOString()}];assert((await call()).status===409,'Superseded event denied');
  latest=[{...event,id:'same-time',type:'printer_resumed'}];assert((await call()).status===409,'Sequence resolves same-timestamp transitions');latest=[];
  publicBucket=true;assert((await call()).status===503&&providerCalls===0,'Public storage is rejected before generation');publicBucket=false;
  claim='quota';assert((await call()).status===429,'Quota denied before provider');claim='busy';assert((await call()).status===425,'Concurrent generation is not repeated');claim='claimed';
  const result=await call();assert(result.status===200&&result.headers.get('Content-Type')==='audio/wav','Generated WAV returned');assert(generatedText.includes('Tiểu Mỹ Thụ')&&generatedText.includes('Đầu phun bị tắc'),'Server derives confirmed text');
  assert((await call()).status===200&&providerCalls===1&&uploads===1,'Ready cache reused without provider charge');
  claim='claimed';device.phase='RUNNING';assert((await call({mode:'preview'})).status===200&&generatedText.startsWith('Thông báo minh họa.'),'Authenticated preview uses a fixed demonstration without faking machine state');device.phase='PAUSE';
  claim='claimed';malformed=true;assert((await call()).status===503&&uploads===2,'Malformed provider audio is never cached');malformed=false;
  failed=true;const error=await call();assert(error.status===503&&!/qa-private/.test(await error.text()),'Safe retryable provider failure');
  assert(!/qa-private/.test(await result.clone().text().catch(()=>'')),'No credential returned');
 }finally{globalThis.fetch=original;}
});
