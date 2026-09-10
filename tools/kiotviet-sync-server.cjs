/* Local bridge for the KiotViet Chrome extension.
   It listens only on 127.0.0.1 and exposes only the Excel file created by the
   current sync job. It never receives browser cookies or credentials. */
const http=require('http');
const fs=require('fs');
const path=require('path');
const os=require('os');
const crypto=require('crypto');

const PORT=Number(process.env.PLATE_STUDIO_SYNC_PORT)||41761;
const DOWNLOAD_DIR=process.env.PLATE_STUDIO_DOWNLOAD_DIR||path.join(os.homedir(),'Downloads');
const TIME_ZONE='Asia/Bangkok';
const STATE_DIR=path.join(process.env.LOCALAPPDATA||path.join(os.homedir(),'AppData','Local'),'Plate Studio');
const STATE_FILE=path.join(STATE_DIR,'kiotviet-sync-state.json');
let job=null;
let recording=null;

function loadState(){
  try{return {...{daily:{enabled:true,imported:{},lastAttempt:{}},range:{active:null,lastCompleted:null}},...JSON.parse(fs.readFileSync(STATE_FILE,'utf8'))};}
  catch{return {daily:{enabled:true,imported:{},lastAttempt:{}},range:{active:null,lastCompleted:null}};}
}
let state=loadState();
state.daily={enabled:state.daily?.enabled!==false,imported:state.daily?.imported||{},lastAttempt:state.daily?.lastAttempt||{}};
state.range={active:state.range?.active||null,lastCompleted:state.range?.lastCompleted||null};
function saveState(){
  try{fs.mkdirSync(STATE_DIR,{recursive:true});fs.writeFileSync(STATE_FILE,JSON.stringify(state,null,2),'utf8');}
  catch(error){console.warn('Không lưu được trạng thái lịch KiotViet:',error.message);}
}
function bangkokParts(now=new Date()){
  const values=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now).filter(item=>item.type!=='literal').map(item=>[item.type,item.value]));
  return {day:`${values.year}-${values.month}-${values.day}`};
}
function dayBefore(day){const date=new Date(`${day}T12:00:00Z`);date.setUTCDate(date.getUTCDate()-1);return date.toISOString().slice(0,10);}
function scheduledDay(){return dayBefore(bangkokParts().day);}
function dailyScheduleStatus(){
  const day=scheduledDay();
  return {enabled:state.daily.enabled!==false,mode:'on-open',timeZone:TIME_ZONE,day,alreadyImported:Boolean(state.daily.imported[day]),lastImported:state.daily.imported[day]||null};
}
function validDay(day){return /^\d{4}-\d{2}-\d{2}$/.test(String(day||''));}
function createJob(body={},origin='manual'){
  const period=String(body.period||'yesterday'),reportDay=validDay(body.reportDay)?String(body.reportDay):'',scheduledFor=period==='yesterday'?String(body.scheduledFor||scheduledDay()):reportDay;
  const dayLabel=scheduledFor?` ngày ${scheduledFor}`:'';
  job={id:crypto.randomUUID(),status:'requested',detail:origin==='scheduled'?`Lịch nền: đang chờ Chrome lấy báo cáo${dayLabel}…`:origin==='range'?`Đang chờ Chrome lấy báo cáo${dayLabel}…`:'Đang chờ extension trong Chrome…',requestedAt:Date.now(),categoryParent:String(body.categoryParent||'Rùm Beng'),category:String(body.category||'3D Rùm Beng'),period,report:String(body.report||'sales-by-product'),origin,scheduledFor,reportDay,rangeId:String(body.rangeId||'')};
  if(origin==='scheduled'){state.daily.lastAttempt[scheduledFor]=Date.now();saveState();}
  return job;
}
function isActiveJob(){return job&&['requested','claimed','running','downloaded'].includes(job.status);}
function queueDailyOnAppOpen(){
  const schedule=dailyScheduleStatus();if(!schedule.enabled||schedule.alreadyImported||isActiveJob())return {queued:false,...schedule,job:publicJob()};
  createJob({period:'yesterday',scheduledFor:schedule.day},'scheduled');
  console.log(`Plate Studio vừa mở: đã xếp lấy báo cáo KiotViet ngày ${schedule.day}.`);
  return {queued:true,...dailyScheduleStatus(),job:publicJob()};
}
function queueNextRangeDay(){
  const range=state.range.active;if(!range)return null;
  const day=range.days[range.cursor];
  if(!day){range.status='completed';range.completedAt=new Date().toISOString();state.range.lastCompleted={...publicRange()};state.range.active=null;saveState();return null;}
  createJob({report:range.report,categoryParent:range.categoryParent,category:range.category,period:'custom-day',reportDay:day,rangeId:range.id},'range');
  return job;
}
function startRange(body={}){
  const days=[...new Set((Array.isArray(body.days)?body.days:[]).map(String).filter(validDay))].sort();
  if(!days.length)throw new Error('Không có ngày thiếu hợp lệ để lấy.');
  if(days.length>730)throw new Error('Mỗi lượt tối đa 730 ngày để bảo vệ Chrome và KiotViet.');
  if(isActiveJob())throw new Error('Đang có một lượt đồng bộ chạy.');
  state.range.active={id:crypto.randomUUID(),status:'running',from:days[0],to:days.at(-1),days,cursor:0,report:String(body.report||'sales-by-product'),categoryParent:String(body.categoryParent||'Rùm Beng'),category:String(body.category||'3D Rùm Beng'),startedAt:new Date().toISOString(),detail:''};
  saveState();queueNextRangeDay();return {range:publicRange(),job:publicJob()};
}
function acknowledgeRangeDay(){
  const range=state.range.active;if(!range||job?.origin!=='range')return null;
  const day=job.reportDay||range.days[range.cursor];
  if(day!==range.days[range.cursor])throw new Error('Ngày báo cáo không khớp hàng chờ.');
  range.cursor+=1;range.detail=`Đã nhập ${day}`;saveState();queueNextRangeDay();return {range:publicRange(),job:publicJob()};
}

function publicRange(){
  const active=state.range.active;
  if(!active)return {status:'idle',total:0,completed:0,pending:0};
  const total=active.days.length,completed=Math.max(0,Math.min(total,Number(active.cursor)||0));
  return {id:active.id,status:active.status||'running',from:active.from,to:active.to,total,completed,pending:Math.max(0,total-completed),currentDay:active.days[completed]||'',failedDay:active.failedDay||'',detail:active.detail||''};
}
function publicJob(){
  if(!job)return {id:null,status:'idle',detail:'Chờ yêu cầu đồng bộ.'};
  const {id,status,detail,fileName,requestedAt,category,period,origin,scheduledFor,reportDay,rangeId}=job;
  return {id,status,detail,fileName,requestedAt,category,period,origin,scheduledFor,reportDay,rangeId};
}
function send(res,status,payload,headers={}){
  res.writeHead(status,{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type',...headers});
  res.end(typeof payload==='string'?payload:JSON.stringify(payload));
}
function readJson(req){
  return new Promise((resolve,reject)=>{
    let raw='';req.on('data',chunk=>{raw+=chunk;if(raw.length>1048576){reject(new Error('Payload quá lớn'));req.destroy();}});
    req.on('end',()=>{try{resolve(raw?JSON.parse(raw):{});}catch{reject(new Error('JSON không hợp lệ'));}});req.on('error',reject);
  });
}
function setJobStatus(status,detail=''){if(job){job.status=status;job.detail=detail||job.detail||'';}}
function newestDownload(){
  if(!job)return null;
  try{
    return fs.readdirSync(DOWNLOAD_DIR,{withFileTypes:true})
      .filter(entry=>entry.isFile()&&/\.(xls|xlsx)$/i.test(entry.name))
      .map(entry=>{const fullPath=path.join(DOWNLOAD_DIR,entry.name),stat=fs.statSync(fullPath);return {fullPath,name:entry.name,size:stat.size,mtimeMs:stat.mtimeMs};})
      .filter(file=>file.mtimeMs>=job.requestedAt-2000&&file.size>0)
      .sort((a,b)=>b.mtimeMs-a.mtimeMs)[0]||null;
  }catch{return null;}
}
function scanDownload(){
  if(!job||!['claimed','running'].includes(job.status))return;
  const file=newestDownload();if(!file)return;
  const previous=job.candidate;
  if(previous&&previous.fullPath===file.fullPath&&previous.size===file.size){
    if(Date.now()-previous.seenAt>1300){job.filePath=file.fullPath;job.fileName=file.name;job.status='downloaded';job.detail='Đã tải Excel từ KiotViet.';}
    return;
  }
  job.candidate={...file,seenAt:Date.now()};
}

const server=http.createServer(async (req,res)=>{
  if(req.method==='OPTIONS'){send(res,204,'');return;}
  const url=new URL(req.url,`http://127.0.0.1:${PORT}`);
  try{
    if(req.method==='GET'&&url.pathname==='/health'){send(res,200,{ok:true,downloadDir:DOWNLOAD_DIR});return;}
    if(req.method==='GET'&&url.pathname==='/job'){send(res,200,publicJob());return;}
    if(req.method==='GET'&&url.pathname==='/schedule'){send(res,200,dailyScheduleStatus());return;}
    if(req.method==='GET'&&url.pathname==='/range/status'){send(res,200,publicRange());return;}
    if(req.method==='GET'&&url.pathname==='/recording'){send(res,200,recording||{status:'empty',detail:'Chưa có bản ghi thao tác nào.'});return;}
    if(req.method==='POST'&&url.pathname==='/run'){
      if(isActiveJob()){send(res,409,{error:'Đang có một lượt đồng bộ chạy.'});return;}
      const body=await readJson(req);createJob(body,'manual');
      send(res,201,publicJob());return;
    }
    if(req.method==='POST'&&url.pathname==='/range/run'){
      const body=await readJson(req);send(res,201,startRange(body));return;
    }
    if(req.method==='POST'&&url.pathname==='/range/cancel'){
      await readJson(req);if(state.range.active){state.range.active.status='cancelled';state.range.active.cancelledAt=new Date().toISOString();state.range.lastCompleted={...publicRange()};state.range.active=null;}
      if(job?.origin==='range'){job.status='cancelled';job.detail='Đã dừng lượt bù báo cáo.';}
      saveState();send(res,200,{ok:true,range:publicRange(),job:publicJob()});return;
    }
    if(req.method==='POST'&&url.pathname==='/schedule'){
      const body=await readJson(req);if(typeof body.enabled==='boolean'){state.daily.enabled=body.enabled;saveState();}
      send(res,200,dailyScheduleStatus());return;
    }
    if(req.method==='POST'&&url.pathname==='/schedule/check'){await readJson(req);send(res,200,queueDailyOnAppOpen());return;}
    if(req.method==='POST'&&url.pathname==='/daily-imported'){
      const body=await readJson(req),day=String(body.day||'');
      if(!/^\d{4}-\d{2}-\d{2}$/.test(day)){send(res,400,{error:'Ngày báo cáo không hợp lệ.'});return;}
      state.daily.imported[day]=new Date().toISOString();saveState();send(res,200,dailyScheduleStatus());return;
    }
    if(req.method==='POST'&&url.pathname==='/daily-forget'){
      const body=await readJson(req),day=String(body.day||'');
      if(!/^\d{4}-\d{2}-\d{2}$/.test(day)){send(res,400,{error:'Ngày báo cáo không hợp lệ.'});return;}
      delete state.daily.imported[day];saveState();send(res,200,dailyScheduleStatus());return;
    }
    if(req.method==='POST'&&url.pathname==='/extension/claim'){
      if(!job||job.status!=='requested'){send(res,200,{run:false});return;}
      job.status='claimed';job.detail='Chrome đã nhận yêu cầu.';send(res,200,{run:true,job:publicJob()});return;
    }
    if(req.method==='POST'&&url.pathname==='/extension/progress'){
      const body=await readJson(req);if(job&&body.id===job.id&&['claimed','running'].includes(job.status)){setJobStatus('running',String(body.detail||'Chrome đang thao tác…'));}
      send(res,200,{ok:true});return;
    }
    if(req.method==='POST'&&url.pathname==='/extension/error'){
      const body=await readJson(req);if(job&&body.id===job.id){job.status='error';job.detail=String(body.detail||'Extension không hoàn thành thao tác.');}
      send(res,200,{ok:true});return;
    }
    if(req.method==='POST'&&url.pathname==='/extension/recording'){
      const body=await readJson(req);
      const actions=Array.isArray(body.actions)?body.actions.slice(0,800):[];
      recording={status:'ready',capturedAt:Number(body.capturedAt)||Date.now(),url:String(body.url||''),actions};
      send(res,200,{ok:true,actions:actions.length});return;
    }
    if(req.method==='GET'&&url.pathname==='/download'){
      if(!job||!['downloaded','imported'].includes(job.status)||!job.filePath||!fs.existsSync(job.filePath)){send(res,404,{error:'Chưa có file Excel từ lượt đồng bộ này.'});return;}
      res.writeHead(200,{'Access-Control-Allow-Origin':'*','Content-Type':'application/vnd.ms-excel','Content-Disposition':`attachment; filename="${encodeURIComponent(job.fileName)}"`});fs.createReadStream(job.filePath).pipe(res);return;
    }
    if(req.method==='POST'&&url.pathname==='/acknowledge'){
      const body=await readJson(req);let next=null;
      if(job&&body.id===job.id){
        job.status='imported';job.detail='Plate Studio đã nhập file Excel.';
        if(job.period==='yesterday'&&job.scheduledFor){state.daily.imported[job.scheduledFor]=new Date().toISOString();saveState();}
        if(job.origin==='range')next=acknowledgeRangeDay();
      }
      send(res,200,next||{job:publicJob(),range:publicRange()});return;
    }
    send(res,404,{error:'Không tìm thấy endpoint.'});
  }catch(error){send(res,500,{error:error.message||'Lỗi local bridge.'});}
});
setInterval(scanDownload,700);
server.listen(PORT,'127.0.0.1',()=>console.log(`KiotViet sync bridge đang chạy: http://127.0.0.1:${PORT}\nTheo dõi thư mục tải xuống: ${DOWNLOAD_DIR}`));
