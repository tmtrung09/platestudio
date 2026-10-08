// Actual source functions in isolated storage/network mocks. No live data.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
const src=fs.readFileSync(new URL('../plate-studio.html',import.meta.url),'utf8');
function fn(name){
 const start=src.search(new RegExp('^(?:async )?function '+name+'\\(','m'));assert.ok(start>=0,name);
 const e=src.indexOf('\n',start),line=src.slice(start,e).trimEnd();
 return line.endsWith('}')?line:src.slice(start,src.indexOf('\n}',e)+2);
}
function context(){
 const store=new Map(),c=vm.createContext({console:{warn(){}},crypto:webcrypto,kiotViet:{salesImports:[]},kiotSalesDetailCache:{},KIOT_SALES_DETAIL_CACHE_LIMIT:31,
 K:{kiotSalesDetails:'details'},saveLocalValue(){},currentUser:{id:'user'},cloudWorkspaceId:()=> 'workspace',
 localStorage:{get length(){return store.size},key:i=>[...store.keys()][i],getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},
 kiotSalesArchiveAvailable:true,kiotSalesArchiveReadyForSettings:true,kiotSalesArchiveLoaded:false,KIOT_SALES_LINES_TABLE:'lines',KIOT_SALES_REPORTS_TABLE:'reports',
 kiotInventoryLedger:{},kiotInventoryUpsertLocalMovements(){},kiotInventoryDayEnd:d=>d,curPage:'test',setTimeout:()=>0,clearTimeout(){},saveKiotViet(){},markKiotDailyImport(){},toast(){},loadKiotSalesArchiveIndex:async()=>[],
 sb:{rpc:async()=>({data:[{id:'cloud',updated_at:'rev'}]})}});
 for(const name of ['kvNorm','persistKiotSalesDetail','hydrateKiotSalesDetail','compactKiotSalesInMemory','kiotSalesProductRow','kiotSalesRows','kiotSalesImportMetrics','kiotSalesReportDay','kiotSalesSingleDay','persistKiotSalesArchive','kiotSalesArchiveRow','kiotSalesImportKey','sortKiotSalesImports','mergeKiotSalesArchiveIndex','loadKiotSalesArchiveDetail','kiotSalesArchiveEntry','kiotVietForCloudSettings','kiotSalesPendingPrefix','preserveKiotSalesLegacy','kiotSalesPendingEntries','saveKiotSalesPending','retryKiotSalesPending','deleteKiotSalesArchive','kvMappingComponents','salesRestockComponents'])vm.runInContext(fn(name),c);
 vm.runInContext('let kiotSalesPendingSync=null,kiotSalesPendingTimer=0;const kiotSalesDetailRequests=new WeakMap();',c);vm.runInContext(fn('fetchKiotSalesArchiveDetail'),c);vm.runInContext(fn('preserveKiotSalesBeforeRefresh'),c);vm.runInContext(fn('retainKiotSalesLocalDetails'),c);return c;
}
let passed=0;
async function test(name,run){await run();passed++;console.log('PASS',name)}
await test('100 unconfirmed reports survive compaction and settings',()=>{
 const c=context();c.kiotViet.salesImports=Array.from({length:100},(_,i)=>({id:'r'+i,sales:[{sku:'a',qty:1}]}));
 c.compactKiotSalesInMemory();assert.equal(c.kiotVietForCloudSettings().salesImports.filter(e=>e.sales?.length).length,100);
});
await test('Multi-day input never writes or changes period',async()=>{
 const c=context();let calls=0;c.sb.rpc=async()=>calls++;
 const e={period:{from:'2026-09-01',to:'2026-09-30'},sales:[{sku:'a',qty:2}]};
 assert.equal(await c.persistKiotSalesArchive(e),false);assert.equal(calls,0);assert.equal(e.period.from,'2026-09-01');
});
await test('Server revision invalidates cache and preserves legacy recovery',()=>{
 const c=context();c.kiotViet.salesImports=[{id:'same',period:{from:'2026-09-30',to:'2026-09-30'},sales:[{sku:'a',qty:1}]}];
 c.kiotSalesDetailCache.same={sales:[{sku:'a',qty:1}],revision:'old'};
 c.mergeKiotSalesArchiveIndex([{id:'same',report_day:'2026-09-30',quantity_total:20,sku_count:1,updated_at:'new'}]);
 assert.equal(c.kiotSalesImportMetrics(c.kiotViet.salesImports[0]).qty,20);assert.equal(c.localStorage.length,1);
});
await test('Undated legacy reports retain distinct identities on archive merge',()=>{
 const c=context();c.kiotViet.salesImports=[{id:'old-1',sales:[{sku:'a',qty:1}]},{id:'old-2',sales:[{sku:'b',qty:2}]}];c.mergeKiotSalesArchiveIndex([]);assert.equal(c.kiotViet.salesImports.length,2);assert.equal(c.localStorage.length,2);
});
await test('Settings refresh cannot replace unarchived local detail with metadata',()=>{
 const c=context(),period={from:'2026-10-08',to:'2026-10-08'};c.kiotViet.salesImports=[{id:'local',period,qtyTotal:2}];
 c.retainKiotSalesLocalDetails([{id:'local',period,sales:[{sku:'a',qty:2}]}]);assert.equal(c.kiotViet.salesImports[0].sales[0].qty,2);
});
await test('Network failure stops automatic detail retry loop',async()=>{
 const c=context();let calls=0;c.sb.from=()=>({select(){return this},eq(){return this},order(){return this},range:async()=>{calls++;return {error:new Error('offline')}}});
 const e={id:'r',skuCount:4,qtyTotal:4};await c.loadKiotSalesArchiveDetail(e);await c.loadKiotSalesArchiveDetail(e);
 assert.ok(e.detailError);assert.equal(calls,1);assert.equal(c.kiotSalesImportMetrics(e).qty,4);
 assert.ok(fn('renderSalesPageContent').includes('!report.detailError'));assert.ok(fn('openKiotSalesComparison').includes('!current.detailError'));
});
await test('Concurrent detail consumers share one request',async()=>{
 const c=context();let release,calls=0;c.sb.from=()=>({select(){return this},eq(){return this},order(){return this},range:()=>{calls++;return new Promise(resolve=>release=resolve)}});
 const e={id:'empty',skuCount:0},a=c.loadKiotSalesArchiveDetail(e),b=c.loadKiotSalesArchiveDetail(e);assert.equal(a,b);assert.equal(calls,1);release({data:[]});await a;assert.equal(e.detailLoaded,true);
});
await test('1200 SKUs paginated despite API cap of 200',async()=>{
 const c=context(),all=Array.from({length:1200},(_,i)=>({sku:'s'+i,quantity:1}));let calls=0;
 c.sb.from=()=>({select(){return this},eq(){return this},order(){return this},range:async start=>{calls++;return {data:all.slice(start,start+200)}}});
 const e={id:'r',skuCount:1200,qtyTotal:1200};await c.loadKiotSalesArchiveDetail(e);
 assert.equal(e.sales.length,1200);assert.equal(e.detailLoaded,true);assert.equal(calls,7);
});
await test('Incomplete detail and changed revision never marked complete',async()=>{
 const c=context();c.sb.from=()=>({select(){return this},eq(){return this},order(){return this},range:async()=>({data:[]})});
 const e={id:'r',skuCount:1};await c.loadKiotSalesArchiveDetail(e);assert.ok(e.detailError);assert.ok(!e.detailLoaded);
 let page=0;c.sb.from=()=>({select(){return this},eq(){return this},order(){return this},range:async()=>({data:page++?[]:[{sku:'a',quantity:1}]}),single:async()=>({data:{updated_at:'new'}})});
 const other={id:'r',skuCount:1,archiveRevision:'old'};await c.loadKiotSalesArchiveDetail(other);assert.ok(other.detailError);assert.ok(!other.sales);
});
await test('Failure retains 91 old reports; pending survives reload and retry',async()=>{
 const c=context();Object.assign(c,{kvReadRows:async()=>[{sku:'new',qty:1},{sku:'new',qty:2}],kvReadSalesReportPeriod:async()=>({from:'2026-10-08',to:'2026-10-08'}),
 kvField:(r,a)=>a[0]==='Mã hàng'?r.sku:a[0]==='Tên hàng'?'Test':'',kiotSalesQuantityForRow:r=>r.qty,kiotSalesRevenueForRow:()=>10,uid:()=> 'new',closeDialog(){},fmtDate:d=>d});
 c.sb.rpc=async()=>({error:{message:'offline'}});let marks=0;c.markKiotDailyImport=()=>marks++;
 c.kiotViet.salesImports=Array.from({length:91},(_,i)=>({id:'old'+i,period:{from:'2026-01-01',to:'2026-01-01'},sales:[{sku:'a',qty:1}]}));
 vm.runInContext(fn('importKiotSalesFile'),c);
 assert.equal(await c.importKiotSalesFile({files:[{name:'test.xls'}]}),false);assert.equal(c.kiotViet.salesImports.length,91);assert.equal(marks,0);
 const pending=c.kiotSalesPendingEntries();assert.equal(pending.length,1);assert.equal(pending[0].sales[0].qty,3);
 const next=context();next.localStorage=c.localStorage;next.kiotViet=c.kiotViet;let request;
 next.sb.rpc=async(name,p)=>{assert.equal(name,'commit_kiot_sales_report');request=p.p_request_id;return {data:[{id:'cloud',updated_at:'rev'}]}};
 assert.equal(await next.retryKiotSalesPending(),true);assert.equal(next.kiotSalesPendingEntries().length,0);assert.equal(next.kiotViet.salesImports.length,92);assert.equal(request,pending[0].requestId);
});
await test('Conflict retained, quota errors surfaced, account scope isolated',async()=>{
 const c=context(),e={requestId:'r',period:{from:'2026-10-08',to:'2026-10-08'},sales:[{sku:'a',qty:1}]};c.saveKiotSalesPending(e);
 let calls=0;c.sb.rpc=async()=>{calls++;return {error:{code:'40001',message:'changed'}}};
 await c.retryKiotSalesPending();await c.retryKiotSalesPending();assert.equal(calls,1);assert.equal(c.kiotSalesPendingEntries().length,1);
 c.cloudWorkspaceId=()=> 'other';assert.equal(c.kiotSalesPendingEntries().length,0);
 c.localStorage.setItem=()=>{throw new Error('quota')};assert.throws(()=>c.saveKiotSalesPending(e),/quota/);
});
await test('Deletion is atomic and refuses offline deletion',async()=>{
 const c=context();let called=false;c.sb.rpc=async name=>{called=name==='delete_kiot_sales_report';return {error:null}};
 assert.equal(await c.deleteKiotSalesArchive({id:'r',archiveRevision:'rev'}),true);assert.ok(called);c.sb=null;assert.equal(await c.deleteKiotSalesArchive({id:'r'}),false);
});
await test('Restock required components and quantities, no implicit alternative',()=>{
 const c=context();c.models=[{id:'m1'},{id:'m2',variants:[{id:'v'}]}];c.partsForVariant=()=>[{id:'p'}];c.openKiotMappingDialog=()=>{};
 const need={sku:'set',mapping:{components:[{modelId:'m1',qty:2},{modelId:'m2',variantId:'v',qty:3}]}};
 assert.equal(c.salesRestockComponents(need).length,2);need.mapping.components[1].mode='alternative';assert.equal(c.salesRestockComponents(need),null);
 assert.ok(fn('openSalesRestockPlan').includes('need.suggestedQty*component.qty'));assert.ok(fn('openSalesRestockOrder').includes('components.forEach'));
});
await test('Legacy duplicate SKU groups correctly; missing SKU cannot be discarded',async()=>{
 const c=context();let calls=0;c.sb.rpc=async()=>{calls++;return {data:[{id:'r',updated_at:'rev'}]}};
 const e={period:{from:'2026-10-08',to:'2026-10-08'},sales:[{sku:'a',qty:2},{sku:'a',qty:3}]};assert.equal(await c.persistKiotSalesArchive(e),true);assert.equal(e.sales.length,1);assert.equal(e.skuCount,1);assert.equal(e.qtyTotal,5);
 const missing={period:e.period,sales:[{name:'Missing',qty:1}]};assert.equal(await c.persistKiotSalesArchive(missing),false);assert.equal(calls,1);assert.equal(missing.sales.length,1);
});
console.log(JSON.stringify({mode:'isolated, no live data',passed}));
