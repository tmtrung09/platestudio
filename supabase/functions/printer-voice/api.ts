import {createClient} from 'npm:@supabase/supabase-js@2.117.0';
import '../../../assets/printer-voice-policy.js';
const policy=(globalThis as any).PlatePrinterVoicePolicy;
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS'};
const json=(error:string,status:number)=>new Response(JSON.stringify({error}),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
const check=(result:any)=>{if(result.error)throw new Error('Storage/database request failed');return result.data;};
const dictionary=(name:string)=>{try{return JSON.parse(Deno.env.get(name)||'{}').default;}catch{return undefined;}};
const model='gemini-3.8-flash-tts',voice='Enya';
const style='Đọc bằng tiếng Việt tự nhiên, giọng thông báo chuyên nghiệp, điềm tĩnh và rõ ràng. Nhịp vừa gọn, ngắt nhẹ giữa các câu. Không đọc kiểu quảng cáo, không cường điệu cảm xúc.';
const hash=async(text:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))).map(byte=>byte.toString(16).padStart(2,'0')).join('');
function pcmWave(data:Uint8Array,rate=24000){
 const bytes=new Uint8Array(44+data.length),view=new DataView(bytes.buffer),write=(at:number,text:string)=>{for(let i=0;i<text.length;i++)bytes[at+i]=text.charCodeAt(i);};
 write(0,'RIFF');view.setUint32(4,36+data.length,true);write(8,'WAVEfmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,rate,true);view.setUint32(28,rate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);write(36,'data');view.setUint32(40,data.length,true);bytes.set(data,44);return bytes;
}
function normalizeWave(bytes:Uint8Array){
 const tag=(offset:number)=>new TextDecoder().decode(bytes.subarray(offset,offset+4));
 if(bytes.length<44||tag(0)!=='RIFF'||tag(8)!=='WAVE')throw new Error('Missing WAV audio');
 const header=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let rate=0,pcm:Uint8Array|undefined;
 for(let offset=12;offset+8<=bytes.length;){
  const length=header.getUint32(offset+4,true),start=offset+8;if(start+length>bytes.length)throw new Error('Truncated WAV');
  if(tag(offset)==='fmt '){
   if(length<16||header.getUint16(start,true)!==1||header.getUint16(start+2,true)!==1||header.getUint16(start+12,true)!==2||header.getUint16(start+14,true)!==16)throw new Error('Unsupported WAV');
   rate=header.getUint32(start+4,true);
  }else if(tag(offset)==='data')pcm=bytes.subarray(start,start+length);
  offset=start+length+(length%2);
 }
 if(!pcm||rate<8000||rate>48000||pcm.length%2||pcm.length/(rate*2)<.5||pcm.length/(rate*2)>35)throw new Error('Unexpected audio length');
 return pcmWave(pcm,rate);
}
export async function handle(req:Request){
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(req.method!=='POST')return json('Method not allowed',405);
 const authorization=req.headers.get('Authorization')||'';
 if(!authorization.startsWith('Bearer '))return json('Cần đăng nhập để dùng giọng đọc máy.',401);
 if(Number(req.headers.get('content-length')||0)>2048)return json('Yêu cầu quá lớn.',413);
 try{
  const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||dictionary('SUPABASE_SECRET_KEYS'));
  const {data:auth,error:authError}=await admin.auth.getUser(authorization.slice(7));
  if(authError||!auth.user)return json('Phiên đăng nhập đã hết hạn.',401);
  const raw=await req.text();if(raw.length>2048)return json('Yêu cầu quá lớn.',413);
  let body:any;try{body=JSON.parse(raw);}catch{return json('Yêu cầu không hợp lệ.',400);}
  const workspace=String(body.workspaceId||''),eventId=String(body.eventId||'').replace(/^printer:/,''),preview=body.mode==='preview';
  if(!/^[a-f0-9-]{36}$/i.test(workspace)||!preview&&!eventId||eventId.length>240||body.mode!==undefined&&!preview||!/^[a-f0-9]{64}$/.test(String(body.expectedHash||''))||body.text!==undefined||body.voice!==undefined||body.model!==undefined)return json('Yêu cầu thông báo không hợp lệ.',400);
  const ws=check(await admin.from('workspaces').select('owner_user_id').eq('id',workspace).maybeSingle());
  if(!ws)return json('Không có quyền xem máy của xưởng này.',403);
  const member=check(await admin.from('workspace_members').select('permissions').eq('workspace_id',workspace).eq('user_id',auth.user.id).maybeSingle());
  if(ws.owner_user_id!==auth.user.id&&!member?.permissions?.some((value:string)=>['progress.view','plates.plan'].includes(value)))return json('Không có quyền xem máy của xưởng này.',403);
  let text=policy.textFor({event:{type:'preview'}});
  if(!preview){
  const record=check(await admin.from('printer_monitor_events').select('data,seq').eq('workspace_id',workspace).eq('id',eventId).maybeSingle());
  const snapshot=check(await admin.from('printer_monitor_states').select('data').eq('workspace_id',workspace).maybeSingle());
  const event=record?.data&&{...record.data,printerSequence:Number(record.seq||0)},device=snapshot?.data?.devices?.[event?.deviceId];
  if(!event||!device)return json('Chưa có đúng thông báo máy để đọc.',409);
  const transitions=check(await admin.from('printer_monitor_events').select('data,seq').eq('workspace_id',workspace).order('seq',{ascending:false}).limit(128));
  if(!policy.eligible(event,device,(transitions||[]).map((row:any)=>({...row.data,printerSequence:Number(row.seq||0)})).filter((row:any)=>row.deviceId===event.deviceId)))return json('Thông báo máy không còn hiệu lực.',409);
  const name=policy.cleanName(body.name||device.name);text=policy.textFor({event,issues:device.issues,name});
  }
  const audioHash=await hash(policy.version+'\n'+text),token=crypto.randomUUID();
  if(audioHash!==body.expectedHash)return json('Nội dung máy đã thay đổi. Chờ cập nhật thông báo rồi thử lại.',409);
  const path=`${ws.owner_user_id}/printer-voice-enya/${workspace}/${audioHash}.wav`;
  const bucketName='camera-sounds',metadata=check(await admin.storage.getBucket(bucketName));
  if(metadata?.public!==false)throw new Error('Voice storage must be private');
  const reservation=check(await admin.rpc('claim_printer_voice',{p_workspace:workspace,p_hash:audioHash,p_token:token}));
  const bucket=admin.storage.from(bucketName);
  if(reservation==='quota')return json('Đã chạm giới hạn tạo câu đọc mới hôm nay. Các câu đã lưu vẫn nghe được.',429);
  if(reservation==='busy')return json('Đang chuẩn bị giọng Enya. Hãy thử lại sau ít giây.',425);
  if(reservation==='ready'){
   const blob=check(await bucket.download(path));
   return new Response(blob,{headers:{...cors,'Content-Type':'audio/wav','Cache-Control':'private, max-age=86400'}});
  }
  if(reservation!=='claimed')return json('Chưa chuẩn bị được giọng đọc.',503);
  const finish=(storagePath:string|null)=>admin.rpc('finish_printer_voice',{p_workspace:workspace,p_hash:audioHash,p_token:token,p_path:storagePath});
  try{
   const key=Deno.env.get('GEMINI_API_KEY');if(!key)throw new Error('Voice provider unavailable');
   const response=await fetch('https://generativelanguage.googleapis.com/v1beta/interactions',{method:'POST',headers:{'x-goog-api-key':key,'Content-Type':'application/json'},body:JSON.stringify({model,input:[{type:'user_input',content:[{type:'text',text,annotations:[{type:'speech_metadata',style}]}]}],response_format:{type:'audio',mime_type:'audio/wav'},generation_config:{speech_config:[{voice}]},store:false}),signal:AbortSignal.timeout(70000)});
   if(!response.ok)throw new Error('Voice provider request failed');
   const result=await response.json();
   const part=(result.steps||[]).filter((step:any)=>step.type==='model_output').flatMap((step:any)=>step.content||[]).filter((item:any)=>item.type==='audio').at(-1);
   if(!part?.data||part.data.length>4000000)throw new Error('Invalid voice response');
   // Parse chunks and normalize the header while preserving the generated PCM samples.
   const bytes=normalizeWave(Uint8Array.from(atob(part.data),(char:string)=>char.charCodeAt(0)));
   check(await bucket.upload(path,bytes,{contentType:'audio/wav',upsert:true}));
   if(check(await finish(path))!==true)throw new Error('Voice reservation expired');
   return new Response(bytes,{headers:{...cors,'Content-Type':'audio/wav','Cache-Control':'private, max-age=86400'}});
  }catch{await finish(null);return json('Chưa tạo được giọng Enya. Thông báo vẫn được giữ; chọn Đọc thông báo để thử lại.',503);}
 }catch{return json('Chưa tải được giọng Enya. Hãy thử lại.',503);}
}
