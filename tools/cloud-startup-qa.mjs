import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const html=process.env.QA_BOOT_BASELINE==='1'?execFileSync('git',['show','HEAD:plate-studio.html'],{encoding:'utf8',maxBuffer:16*1024*1024}):readFileSync(process.env.QA_BOOT_HTML||'plate-studio.html','utf8');
const start=html.indexOf('let cloudSessionStartPromise='),end=html.indexOf('async function initCloudApp()',start);
assert.ok(start>0&&end>start);
function fixture(){
 const timers=[];const ctx=vm.createContext({URLSearchParams,performance:{now:()=>0},console:{warn(){},error(){}},setTimeout(fn,delay){timers.push({fn,delay});return timers.length;},clearTimeout(){}});
 vm.runInContext(`
 let cloudReady=false,currentUser=null,loadingCloud=false,cloudSyncedSnapshot=null;
 let activeWorkspace={workspace_id:'workspace',role:'owner',permissions:['orders.manage']};
 const STAFF_RECEIVING_MODE=false,STAFF_REPORT_MODE=false;
 let curPage='dashboard',needsCloudBatchSeed=false,batchReports=[],cloudOutbox=[{id:'preserved-request'}],cloudSyncing=false;
 let failPage=false,failData=false,failOptional=false,holdData=false,releaseData,holdProfile=false,releaseProfile;
 let memberships=0,reads=0,accessReads=0,profileReads=0,mediaReads=0,readyPages=0,retries=0;
 const auth={style:{display:'flex'}};
 const document={getElementById:()=>auth};
 const window={KiotMappingSync:{restore:async()=>{},retry(){retries++;}},PlatePlanFiles:{resume(){}}};
 const location={search:''};
 const ensureCloudWorkspace=async()=>{memberships++;};
 const cloudWorkspaceId=()=>activeWorkspace.workspace_id;
 const loadCloudData=async(guard=()=>true)=>{const owner=currentUser.id;reads++;if(holdData){holdData=false;await new Promise(resolve=>{releaseData=resolve;});}if(failData)throw Error('Data transport failed');if(guard())activeWorkspace={...activeWorkspace,loadedBy:owner};};
 const loadWorkspaceAccessRows=async()=>{accessReads++;if(failOptional)throw Error('Directory failed');};
 const registerWorkspaceProfile=async()=>{profileReads++;if(holdProfile)await new Promise(resolve=>{releaseProfile=resolve;});if(failOptional)throw Error('Profile failed');};
 const migrateInlineMedia=async()=>{mediaReads++;if(failOptional)throw Error('Media failed');};
 const showAuth=()=>{auth.style.display='flex';};
 const goPage=()=>{if(failPage){failPage=false;throw Error('Page render failed after ready flag');}readyPages++;};
 const toast=()=>{},authMessage=()=>{},setSyncState=()=>{},setCloudLoadingOverlay=()=>{},setCardContentLoading=()=>{},syncAuthUI=()=>{};
 const recordPerformanceMetric=()=>{},restoreBatchLibraryView=()=>{},setFastCaptureAvailable=()=>{};
 const canCaptureBatchReports=()=>false,shouldAutoOpenBatchCamera=()=>false;
 const restoreBatchCameraQueue=async()=>{},drainBatchCameraQueue=async()=>{},announceDeliveryPhotoRequests=()=>{},primeSystemNotificationEvents=()=>{};
 const requiredWorkspacePermission=()=>null,canAccess=()=>true;
 const registerBatchDevice=async()=>{},installLocalWorkspaceSyncListeners=()=>{},installCloudRemoteReconcileListeners=()=>{},setupCloudRealtime=()=>{},primeCloudRemoteRevisions=async()=>{};
 const loadKiotSalesArchiveIndex=async()=>{},migrateLegacyKiotSalesArchive=async()=>{},retryKiotSalesPending=async()=>{},loadKiotSalesArchiveDetail=async()=>{},latestKiotSalesImport=()=>null;
 const persistBatchReportCloud=async()=>{},syncAllCloud=async()=>{},processTrashRetention=async()=>{},processCloudOutbox=()=>{},canAutoApplyRemoteRefresh=()=>false;
 ${html.slice(start,end)}
 const snapshot=()=>({cloudReady,loadingCloud,user:currentUser?.id,memberships,reads,accessReads,profileReads,mediaReads,readyPages,retries,auth:auth.style.display,pending:cloudOutbox.map(row=>row.id),loadedBy:activeWorkspace.loadedBy});
 `,ctx);
 return {run:code=>vm.runInContext(code,ctx),async flush(){for(const task of timers.splice(0).filter(task=>task.delay===0))task.fn();for(let i=0;i<12;i++)await Promise.resolve();}};
}
const session="{user:{id:'user-a'}}";
{
 const f=fixture();f.run('failPage=true');await f.run(`startCloudSession(${session})`);
 let state=f.run('snapshot()');assert.equal(state.cloudReady,false,'Failure after readiness must make the session retryable');assert.equal(state.auth,'flex');assert.equal(state.retries,0,'A failed bootstrap cannot drain the mapping outbox');
 await f.run(`startCloudSession(${session})`);state=f.run('snapshot()');assert.equal(state.memberships,2);assert.equal(state.readyPages,1);assert.equal(state.auth,'none');assert.deepEqual([...state.pending],['preserved-request']);
 console.log('PASS failed startup, same-user retry, preserved outbox and stopped background writes');
}
{
 const f=fixture();f.run('holdProfile=true;failOptional=true');await f.run(`startCloudSession(${session})`);await f.flush();
 const state=f.run('snapshot()');assert.equal(state.cloudReady,true);assert.equal(state.auth,'none');assert.equal(state.profileReads,1);assert.equal(state.accessReads,1);assert.equal(state.mediaReads,1);
 assert.equal(state.readyPages,1,'Slow profile and failed directory/media do not block or undo the opened page');f.run('releaseProfile()');
 console.log('PASS slow/failed optional maintenance never blocks authenticated UI');
}
{
 const f=fixture();f.run('failData=true');await f.run(`startCloudSession(${session})`);assert.equal(f.run('snapshot().cloudReady'),false);assert.equal(f.run('snapshot().auth'),'flex');assert.equal(f.run('snapshot().profileReads'),0);
 f.run('failData=false');await f.run(`startCloudSession(${session})`);assert.equal(f.run('snapshot().reads'),2);assert.equal(f.run('snapshot().auth'),'none');
 console.log('PASS required-data failure holds authorization gate and retries');
}
{
 const f=fixture();f.run('holdData=true');const first=f.run(`startCloudSession(${session})`),second=f.run(`startCloudSession(${session})`);assert.equal(first,second);await Promise.resolve();f.run('releaseData()');await first;assert.equal(f.run('snapshot().reads'),1);
 console.log('PASS duplicate auth events share one startup');
}
{
 const f=fixture();f.run('holdData=true');const previous=f.run(`startCloudSession(${session})`);await Promise.resolve();await f.run("startCloudSession({user:{id:'user-b'}})");f.run('releaseData()');await previous;await f.flush();const state=f.run('snapshot()');
 assert.equal(state.user,'user-b');assert.equal(state.loadedBy,'user-b');assert.equal(state.auth,'none');assert.equal(state.cloudReady,true);assert.equal(state.readyPages,1,'Late previous-user startup cannot open another page or reset readiness');
 console.log('PASS stale user startup cannot apply data or maintenance to a newer session');
}
// Execute the actual migration with a delayed upload; edits and account changes
// during that upload must preserve the source images and never sync a new owner.
const mediaStart=html.indexOf('async function migrateInlineMedia()'),mediaEnd=html.indexOf('function showRemoteDataRefreshNotice()',mediaStart);
for(const change of ['edit','scope']){
 const ctx=vm.createContext({console:{error(){}},Promise});vm.runInContext(`
 let currentUser={id:'user-a'},cloudReady=true,loadingCloud=false,workspace='workspace',saved=0,queued=0,release;
 let models=[{id:'m',images:['data:original']}],plates=[],batchReports=[];
 const cloudWorkspaceId=()=>workspace,isInlineImage=src=>String(src).startsWith('data:');
 const uploadInlineImage=()=>new Promise(resolve=>release=()=>resolve('https://example.test/uploaded'));
 const setSyncState=()=>{},toast=()=>{},saveLocalCollections=()=>{saved++;},scheduleCloudSync=()=>{queued++;};
 ${html.slice(mediaStart,mediaEnd)}
 `,ctx);
 const work=vm.runInContext('migrateInlineMedia()',ctx);vm.runInContext(change==='edit'?"models[0].images=['data:new-edit'];release()":"currentUser={id:'user-b'};workspace='other';release()",ctx);await work;
 assert.equal(vm.runInContext('models[0].images[0]',ctx),change==='edit'?'data:new-edit':'data:original');assert.equal(vm.runInContext('queued',ctx),0);
 console.log('PASS background image migration preserves '+change+' changes');
}
