type Input={accessToken:string;templateId:string;phone:string;trackingId:string;templateData:Record<string,string>};
type Outcome={outcome:'sent'|'pending'|'blocked'|'failed'|'unknown';code?:string;providerId?:string};
export async function sendZaloTemplate(input:Input,transport:typeof fetch=fetch):Promise<Outcome>{
 const phone=String(input.phone||'').replace(/\D/g,'').replace(/^0/,'84');
 if(!/^84[0-9]{9,10}$/.test(phone))return {outcome:'blocked',code:'invalid_phone'};
 try{
  const response=await transport('https://business.openapi.zalo.me/message/template',{method:'POST',headers:{'Content-Type':'application/json',access_token:input.accessToken},
   body:JSON.stringify({phone,template_id:input.templateId,template_data:input.templateData,tracking_id:input.trackingId}),signal:AbortSignal.timeout(15000)});
  // A transport error/timeout can follow successful delivery. No automatic resend.
  if(response.status>=500)return {outcome:'unknown',code:'provider_unavailable'};
  if(response.status===429)return {outcome:'pending',code:'rate_limit'};
  const data=await response.json();
  if(response.ok&&data.error===0&&data.data?.msg_id)return {outcome:'sent',providerId:String(data.data.msg_id)};
  return {outcome:'blocked',code:Number.isInteger(data.error)?'zalo_'+data.error:'provider_rejected'};
 }catch{return {outcome:'unknown',code:'transport_uncertain'};}
}
