import {createClient} from 'npm:@supabase/supabase-js@2.117.0';
import {sendZaloTemplate} from './send.ts';
import {readCareBody} from '../custom-order-care/media.ts';
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Content-Type':'application/json','Cache-Control':'no-store'};
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers});
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers});if(req.method!=='POST')return json({error:'Method not allowed'},405);
 try{
  const b=await readCareBody(req,4096),w=b.workspaceId;if(typeof w!=='string'||!/^[a-f0-9-]{36}$/.test(w))return json({error:'Thiếu workspace'},400);
  const url=Deno.env.get('SUPABASE_URL')!,key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,bearer=req.headers.get('authorization')||'';
  const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  // Scheduled invocations must use a server-held service credential. Browser calls
  // must authenticate and pass the same management ACL as warranty decisions.
  if(bearer!==`Bearer ${key}`){
   const {data:{user},error}=await admin.auth.getUser(bearer.replace(/^Bearer\s+/i,''));if(error||!user)return json({error:'Phiên đăng nhập không hợp lệ'},401);
   const actor=createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:bearer}},auth:{persistSession:false,autoRefreshToken:false}});
   const {data:allowed}=await actor.rpc('can_manage_custom_care',{w});if(!allowed)return json({error:'Không có quyền gửi thông báo'},403);
  }
  const accessToken=Deno.env.get('ZALO_OA_ACCESS_TOKEN')||'',approved=Deno.env.get('ZALO_CARE_APPROVED_TEMPLATE')||'',ready=Deno.env.get('ZALO_CARE_READY_TEMPLATE')||'',base=Deno.env.get('CUSTOM_CARE_PUBLIC_URL')||'';
  const targetWorkspace=Deno.env.get('ZALO_CARE_WORKSPACE_ID')||'';if(targetWorkspace&&targetWorkspace!==w)return json({error:'OA chưa được cấu hình cho workspace này'},403);
  const templateId=/^[A-Za-z0-9_-]+$/;
  const configured=targetWorkspace===w&&!!accessToken&&templateId.test(approved)&&templateId.test(ready)&&/^https:\/\/[^?#]+\/order-status\.html$/.test(base);
  const {data:items,error}=await admin.rpc('claim_custom_care_zalo',{w,configured});if(error)throw error;
  let accepted=0;
  for(const item of items||[]){
   const result=await sendZaloTemplate({accessToken,templateId:item.stage==='ready'?ready:approved,phone:item.phone,trackingId:item.id,templateData:{order_code:item.orderId,warranty_code:item.warrantyId.slice(0,8),tracking_url:base+'#'+item.token}});
   const {error:finishError}=await admin.rpc('finish_custom_care_zalo',{oid:item.id,outcome:result.outcome,provider:result.providerId||null,reason:result.code||null});if(finishError)throw finishError;if(result.outcome==='sent')accepted++;
  }
  return json({configured,processed:(items||[]).length,accepted});
 }catch(error){if(error instanceof RangeError)return json({error:'Yêu cầu quá lớn'},413);if(error instanceof SyntaxError)return json({error:'Yêu cầu không hợp lệ'},400);return json({error:'Chưa xử lý được hàng chờ Zalo; kiểm tra trạng thái gửi trước khi thử lại.'},503);}
});
