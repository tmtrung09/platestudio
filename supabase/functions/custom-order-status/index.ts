import {createClient} from 'npm:@supabase/supabase-js@2';
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Cache-Control':'no-store','Content-Type':'application/json','Referrer-Policy':'no-referrer'};
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers});
Deno.serve(async request=>{
 if(request.method==='OPTIONS')return new Response('ok',{headers});
 if(request.method!=='POST')return json({error:'Method not allowed'},405);
 try{
  if(Number(request.headers.get('content-length')||0)>2048)return json({error:'Yêu cầu quá lớn'},413);
  const text=await request.text();if(text.length>2048)return json({error:'Yêu cầu quá lớn'},413);
  const body=JSON.parse(text);if(typeof body.token!=='string'||!/^[a-f0-9]{64}$/.test(body.token))return json({error:'Không tìm thấy đơn hàng'},404);
  const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:order,error}=await admin.rpc('read_custom_order_public',{token:body.token});
  if(error)return json({error:'Chưa đọc được tiến độ. Vui lòng thử lại.'},503);
  if(!order)return json({error:'Không tìm thấy đơn hàng'},404);
  for(const line of order.lines||[]){
   line.images=await Promise.all((line.images||[]).slice(0,4).map(async(image:{path:string;name:string})=>{
    const {data,error:signError}=await admin.storage.from('custom-order-media').createSignedUrl(image.path,300);
    return {name:image.name,src:signError?'':data?.signedUrl||''};
   }));
  }
  return json({order});
 }catch{return json({error:'Chưa đọc được tiến độ. Vui lòng thử lại.'},400);}
});
