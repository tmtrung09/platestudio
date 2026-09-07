import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const corsHeaders={
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
}
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders,'Content-Type':'application/json'}})
const allowedPage=new Set(['dashboard','models','orders','plates','projects','filaments','batches','reminders','fulfillment','packaging','print-plans','machine-setup','kiotviet','sales','inventory','devices','data','progress'])

Deno.serve(async req=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders})
  if(req.method!=='POST')return json({error:'Method not allowed'},405)
  const publicKey=Deno.env.get('VAPID_PUBLIC_KEY')||''
  if(!publicKey)return json({error:'Máy chủ chưa cấu hình VAPID_PUBLIC_KEY.'},503)
  let body:Record<string,any>={};try{body=await req.json()}catch(_){return json({error:'Dữ liệu không hợp lệ.'},400)}
  if(body.action==='public-key')return json({publicKey})
  const token=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'')
  const url=Deno.env.get('SUPABASE_URL')!,serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin=createClient(url,serviceKey)
  const {data:{user},error:userError}=await admin.auth.getUser(token)
  if(userError||!user)return json({error:'Phiên đăng nhập không hợp lệ.'},401)
  const privateKey=Deno.env.get('VAPID_PRIVATE_KEY')||'',subject=Deno.env.get('VAPID_SUBJECT')||'mailto:admin@example.com'
  if(!privateKey)return json({error:'Máy chủ chưa cấu hình VAPID_PRIVATE_KEY.'},503)
  webpush.setVapidDetails(subject,publicKey,privateKey)
  if(body.action==='test'){
    const {data:subs,error}=await admin.from('push_subscriptions').select('id,subscription').eq('user_id',user.id)
    if(error)throw error
    let sent=0
    for(const row of subs||[]){try{await webpush.sendNotification(row.subscription,JSON.stringify({title:'Plate Studio',body:'Thông báo đẩy đang hoạt động trên thiết bị này.',url:'./',tag:'plate-studio-test'}));sent++}catch(error:any){if([404,410].includes(Number(error?.statusCode)))await admin.from('push_subscriptions').delete().eq('id',row.id)}}
    return json({sent})
  }
  if(body.action!=='event')return json({error:'Thao tác không hợp lệ.'},400)
  const event=body.event||{},workspaceId=String(event.workspaceId||body.workspaceId||'')
  if(!workspaceId)return json({error:'Thiếu workspace.'},400)
  const {data:membership}=await admin.from('workspace_members').select('user_id,permissions').eq('workspace_id',workspaceId).eq('user_id',user.id).maybeSingle()
  if(!membership)return json({error:'Không có quyền gửi cho workspace này.'},403)
  const {data:workspace,error:workspaceError}=await admin.from('workspaces').select('owner_user_id').eq('id',workspaceId).maybeSingle()
  if(workspaceError||!workspace)return json({error:'Không tìm thấy workspace.'},404)
  const {data:members,error:membersError}=await admin.from('workspace_members').select('user_id,permissions').eq('workspace_id',workspaceId)
  if(membersError)throw membersError
  const recipients=new Set((Array.isArray(event.recipients)?event.recipients:[]).map(String))
  const permissions=new Set((Array.isArray(event.permissions)?event.permissions:[]).map(String))
  const targets=new Set<string>()
  if(recipients.size)recipients.forEach(id=>targets.add(id))
  else {
    targets.add(workspace.owner_user_id)
    for(const member of members||[]){const grants=Array.isArray(member.permissions)?member.permissions:[];if(!permissions.size||grants.some((grant:string)=>permissions.has(grant)))targets.add(member.user_id)}
  }
  if(event.actorUserId)targets.delete(String(event.actorUserId))
  if(!targets.size)return json({sent:0})
  const {data:subscriptions,error:subscriptionsError}=await admin.from('push_subscriptions').select('id,subscription').eq('workspace_id',workspaceId).in('user_id',[...targets])
  if(subscriptionsError)throw subscriptionsError
  const page=allowedPage.has(String(event.page||''))?String(event.page):'dashboard'
  const payload=JSON.stringify({title:String(event.title||'Plate Studio').slice(0,120),body:String(event.detail||'Có cập nhật mới.').slice(0,240),url:`./plate-studio.html#ps_page=${encodeURIComponent(page)}`,tag:`plate-event-${String(event.id||Date.now())}`})
  let sent=0
  for(const row of subscriptions||[]){try{await webpush.sendNotification(row.subscription,payload);sent++}catch(error:any){if([404,410].includes(Number(error?.statusCode)))await admin.from('push_subscriptions').delete().eq('id',row.id)}}
  return json({sent})
})
