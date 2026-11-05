import {createClient} from 'npm:@supabase/supabase-js@2.117.0';
import {isCareImage,sha256,readCareBody} from './media.ts';
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Cache-Control':'no-store','Content-Type':'application/json','Referrer-Policy':'no-referrer'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
const uuid=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v);
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers});
 if(req.method!=='POST')return json({error:'Method not allowed'},405);
 try{
  const b=await readCareBody(req),url=Deno.env.get('SUPABASE_URL')!,key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const call=async(client:typeof admin,name:string,args:Record<string,unknown>)=>{const {data,error}=await client.rpc(name,args);if(error)throw error;return data;};
  const sign=async(data:any)=>{
   for(const item of data?.warranties||[]){
    item.images=await Promise.all((item.images||[]).map(async(image:any)=>{
     const {data,error}=await admin.storage.from('custom-care-media').createSignedUrl(image.path,300);
     return {name:image.name,src:error?'':data?.signedUrl||''};
    }));
   }return data;
  };
  if(b.action==='inbox'||b.action==='decision'){
   const bearer=req.headers.get('authorization')||'';
   const {data:{user},error}=await admin.auth.getUser(bearer.replace(/^Bearer\s+/i,''));
   if(error||!user)return json({error:'Phiên đăng nhập không hợp lệ'},401);
   if(!uuid(b.workspaceId))return json({error:'Thiếu workspace'},400);
   const actor=createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:bearer}},auth:{persistSession:false,autoRefreshToken:false}});
   if(b.action==='decision'){
    if(!uuid(b.id)||!Number.isSafeInteger(b.revision)||typeof b.note!=='string'||b.note.length>2000)return json({error:'Yêu cầu không hợp lệ'},400);
    await call(actor,'decide_custom_care',{w:b.workspaceId,cid:b.id,expected:b.revision,decision:b.decision,message:b.note,part:b.partId||null,quantity:b.quantity??1});
   }
   return json({care:await sign(await call(actor,'custom_care_inbox',{w:b.workspaceId,off:Number.isSafeInteger(b.offset)?b.offset:0,focus:uuid(b.focusId)?b.focusId:null}))});
  }
  if(typeof b.token!=='string'||!/^[a-f0-9]{64}$/.test(b.token))return json({error:'Link đơn không hợp lệ'},404);
  if(b.action==='read')return json({care:await sign(await call(admin,'read_custom_care',{token:b.token}))});
  if(!uuid(b.requestId))return json({error:'Thiếu mã yêu cầu'},400);
  if(b.action==='reserve'||b.action==='submit'&&b.payload?.kind==='warranty'){
   const files=await call(admin,'reserve_custom_care_upload',{token:b.token,request:b.requestId,files:b.files});
   if(b.action==='reserve'){
    const uploads=await Promise.all(files.map(async(f:any)=>{const {data,error}=await admin.storage.from('custom-care-media').createSignedUploadUrl(f.path,{upsert:false});if(error)throw error;return {path:f.path,token:data.token};}));
    return json({uploads});
   }
   // Storage MIME declarations alone are not evidence of valid image bytes.
   for(const f of files){
    const {data,error}=await admin.storage.from('custom-care-media').download(f.path);
    if(error||!data)return json({error:'Ảnh chưa tải lên đầy đủ',code:'MEDIA_INCOMPLETE'},400);
    const bytes=new Uint8Array(await data.arrayBuffer());
    if(bytes.byteLength!==f.size||!isCareImage(bytes,f.type)||await sha256(bytes)!==f.sha256)return json({error:'Ảnh không khớp nội dung đã chọn. Vui lòng đối chiếu ảnh.',code:'MEDIA_MISMATCH'},409);
   }
  }
  if(b.action==='submit')return json({care:await sign(await call(admin,'submit_custom_care',{token:b.token,request:b.requestId,p:b.payload}))});
  if(b.action==='supplement'&&uuid(b.id)&&Number.isSafeInteger(b.revision)&&typeof b.message==='string'&&b.message.length<=2000)return json({care:await sign(await call(admin,'supplement_custom_care',{token:b.token,cid:b.id,request:b.requestId,expected:b.revision,message:b.message}))});
  return json({error:'Thao tác không hợp lệ'},400);
 }catch(error:any){
  if(error instanceof RangeError)return json({error:'Yêu cầu quá lớn'},413);
  if(error instanceof SyntaxError)return json({error:'Nội dung yêu cầu không hợp lệ'},400);
  const code=String(error?.code||'');const known=['P0001','PT409','42501'].includes(code);
  return json({error:known?error.message:'Chưa xử lý được yêu cầu. Vui lòng thử lại.',code:known?code:'UNAVAILABLE'},code==='42501'?403:code==='PT409'?409:code==='P0001'?400:503);
 }
});
