// Actual range functions, isolated reports/storage; no live writes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const src=fs.readFileSync(new URL('../plate-studio.html',import.meta.url),'utf8');
function fn(name){const start=src.search(new RegExp('^(?:async )?function '+name+'\\(','m'));assert.ok(start>=0,name);const e=src.indexOf('\n',start),line=src.slice(start,e).trimEnd();return line.endsWith('}')?line:src.slice(start,src.indexOf('\n}',e)+2);}
const c=vm.createContext({console,Date,Map,Set,Promise,currentUser:null,sb:null,kiotSalesArchiveAvailable:true,kiotSalesArchiveLoaded:true,kiotSalesDetailCache:{},kiotViet:{salesImports:[],sales:[]},modelKiotReadError:'',cloudWorkspaceId:()=> 'qa',fmtDate:d=>d,kvNorm:s=>s.toLowerCase(),salesPageDatePreset:'all',salesPageCustomRange:{from:'',to:''},kiotSalesRangeToday:()=> '2026-10-14'});
for(const name of ['hydrateKiotSalesDetail','kiotSalesProductRow','kiotSalesRows','kiotSalesImportMetrics','kiotSalesImportPeriodLabel','kiotSalesDetailReady','kiotSalesSnapshot','salesPageShiftDay','salesPageDateRange','salesRangeSelection','salesRangeReport','salesPageReport','ensureSalesRangeDetails','kiotSalesReportDay','kiotSalesDailySeries'])vm.runInContext(fn(name),c);
vm.runInContext("const SALES_PAGE_DATE_PRESETS=[];let salesRangeDetailsRequest=null,salesRangeDetailsScope='';",c);
const day=(id,date,qty,sku='A',revenue=qty*100)=>({id,period:{from:date,to:date},importedAt:date+'T00:00:00Z',sales:[{sku,name:sku,qty,revenue}]});
let passed=0;
function test(name,run){run();passed++;console.log('PASS',name);}
function all(reports){c.kiotViet.salesImports=reports;c.salesPageDatePreset='all';c.salesPageCustomRange={from:'',to:''};}
test('Range aggregates products/revenue and distinct SKUs without changing source',()=>{
 all([day('a','2026-10-01',3),day('b','2026-10-02',7),day('c','2026-10-03',2,'B')]);const before=JSON.stringify(c.kiotViet),r=c.salesPageReport();
 assert.equal(r.qtyTotal,12);assert.equal(r.revenueTotal,1200);assert.equal(r.sales.length,2);assert.equal(r.sales.find(row=>row.sku==='A').qty,10);assert.equal(c.kiotSalesSnapshot().ready,true);assert.equal(JSON.stringify(c.kiotViet),before);
 c.salesPageDatePreset='custom';c.salesPageCustomRange={from:'2026-10-02',to:'2026-10-02'};assert.equal(c.salesPageReport().qtyTotal,7);assert.equal(c.salesPageReport().rangeReports.length,1);
 c.salesPageCustomRange={from:'2026-10-04',to:'2026-10-04'};assert.equal(c.salesPageReport(),null);assert.equal(c.kiotViet.salesImports.length,3);
});
test('Newest duplicate wins, exact daily reports replace fully covered wide report',()=>{
 const wide={...day('wide','2026-10-01',99),period:{from:'2026-10-01',to:'2026-10-02'}};all([day('old','2026-10-01',1),{...day('new','2026-10-01',4),importedAt:'2026-10-15'},day('two','2026-10-02',6),wide]);
 assert.equal(c.salesPageReport().qtyTotal,10);assert.equal(c.kiotSalesSnapshot().ready,true);assert.equal(c.salesPageReport().rangeSelection.skipped.length,2);assert.equal(c.kiotSalesDailySeries(c.kiotViet.salesImports).length,2);
});
test('Partial overlap never prorates/assigns totals to final day; blocks decisions',()=>{
 const wide={...day('wide','2026-10-01',99),period:{from:'2026-10-01',to:'2026-10-03'}};all([wide]);assert.equal(c.salesPageReport().qtyTotal,99);assert.equal(c.kiotSalesDailySeries(c.kiotViet.salesImports).length,0);
 all([wide,day('one','2026-10-01',4)]);assert.equal(c.salesPageReport().qtyTotal,4);assert.equal(c.kiotSalesSnapshot().ready,false);assert.match(c.salesPageReport().rangeNote,/không cộng/);
 c.salesPageDatePreset='custom';c.salesPageCustomRange={from:'2026-10-02',to:'2026-10-03'};assert.equal(c.salesRangeSelection().reports.length,0);assert.equal(c.salesRangeSelection().skipped[0].reason,'partial');
});
test('Unloaded/revision-mismatched detail is unknown, not zero; totals metadata retained',()=>{
 all([day('a','2026-10-01',3),{id:'lean',period:{from:'2026-10-02',to:'2026-10-02'},archiveRevision:'r2',skuCount:1,qtyTotal:8,revenueTotal:800}]);c.kiotSalesDetailCache.lean={revision:'r1',sales:[{sku:'A',qty:99}]};
 const r=c.salesPageReport();assert.equal(r.qtyTotal,11);assert.equal(r.rangeMetrics.sku,null);assert.equal(c.kiotSalesSnapshot().ready,false);assert.equal(c.kiotSalesSnapshot().rows.length,0);
 c.kiotViet.salesImports[1].detailError='network';assert.equal(c.kiotSalesSnapshot().error,'network');
 c.kiotViet.salesImports[1].sales=[{sku:'A',qty:8,revenue:800}];delete c.kiotViet.salesImports[1].detailError;assert.equal(c.kiotSalesSnapshot().ready,true);assert.equal(c.kiotSalesSnapshot().rows[0].qty,11);
});
test('True loaded zero, period/revision identity, weekly/month presets',()=>{
 all([{id:'zero',period:{from:'2026-10-01',to:'2026-10-01'},sales:[],skuCount:0,detailLoaded:true}]);assert.equal(c.kiotSalesSnapshot().ready,true);assert.equal(c.salesPageReport().qtyTotal,0);
 const revision=c.salesPageReport().archiveRevision;c.salesPageDatePreset='custom';c.salesPageCustomRange={from:'2026-10-01',to:'2026-10-04'};assert.notEqual(c.salesPageReport().archiveRevision,revision);
 for(const preset of ['this-week','last-week','last-7','this-month','last-month','last-30']){const range=c.salesPageDateRange(preset);assert.ok(range.from<=range.to);}
});
all(Array.from({length:7},(_,i)=>({id:String(i),period:{from:'2026-10-0'+(i+1),to:'2026-10-0'+(i+1)},skuCount:1,qtyTotal:1,revenueTotal:100})));
c.currentUser={id:'user'};c.sb={};let active=0,max=0,calls=0;
c.loadKiotSalesArchiveDetail=async entry=>{calls++;active++;max=Math.max(max,active);await new Promise(resolve=>setTimeout(resolve,8));entry.sales=[{sku:'A',qty:1,revenue:100}];entry.detailLoaded=true;active--;};
await Promise.all([c.ensureSalesRangeDetails(),c.ensureSalesRangeDetails()]);assert.equal(calls,7);assert.ok(max<=3);assert.equal(c.kiotSalesSnapshot().ready,true);passed++;console.log('PASS bounded three-worker archive loader and concurrent deduplication');
all(Array.from({length:7},(_,i)=>({id:'scope-'+i,period:{from:'2026-10-0'+(i+1),to:'2026-10-0'+(i+1)},qtyTotal:1})));
calls=0;c.salesPageDatePreset='custom';c.salesPageCustomRange={from:'2026-10-01',to:'2026-10-01'};
c.loadKiotSalesArchiveDetail=async entry=>{calls++;if(calls===1)c.salesPageCustomRange={from:'2026-10-06',to:'2026-10-07'};entry.sales=[{sku:'A',qty:1}];};
await c.ensureSalesRangeDetails();assert.equal(calls,3);assert.equal(c.kiotSalesSnapshot().ready,true);assert.equal(c.salesPageReport().qtyTotal,2);passed++;console.log('PASS change date range during load finishes new range without another click');
all(Array.from({length:7},(_,i)=>({id:'scope-'+i,period:{from:'2026-10-0'+(i+1),to:'2026-10-0'+(i+1)},qtyTotal:1})));
calls=0;c.loadKiotSalesArchiveDetail=async()=>{calls++;c.currentUser={id:'other'};};await c.ensureSalesRangeDetails();assert.ok(calls<=3);passed++;console.log('PASS changed user stops queue dispatch');
assert.ok(!src.includes('id="sales-period"'));assert.match(fn('openSalesRestockPlan'),/reportId==='sales-range'/);assert.match(fn('openKiotSalesComparison'),/id==='sales-range'/);
console.log(`PASS ${passed} sales range policy groups, shared model/AI source and read-only UI wiring`);
