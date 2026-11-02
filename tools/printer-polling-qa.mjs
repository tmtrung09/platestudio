import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=readFileSync(process.env.QA_PRINTER_SOURCE||'printer-monitor.js','utf8');
function extract(name){
 const match=new RegExp('(?:async )?function '+name+'\\(').exec(source);assert.ok(match,'Missing '+name);
 let close=source.indexOf('(',match.index),parens=0;
 for(;close<source.length;close++){if(source[close]==='(')parens++;if(source[close]===')'&&!--parens)break;}
 const begin=source.indexOf('{',close+1);
 let depth=0;for(let i=begin;i<source.length;i++){if(source[i]==='{')depth++;if(source[i]==='}'&&!--depth)return source.slice(match.index,i+1);}
 throw Error('Unclosed '+name);
}
const context=source.match(/const context = \(\) => \(([\s\S]*?)\);/)[1];
assert.match(source,/if \(data\.kind === "update"\) scheduleUpdateRead\(\)/,'Actual SSE updates use the coalesced reader');
function fixture(){
 const timers=new Map();let id=0;const clock={now:10000};
 const ctx=vm.createContext({Response,ReadableStream,TextDecoder,Uint8Array,AbortController,navigator:{onLine:true},Date:{now:()=>clock.now},setTimeout(fn,delay){timers.set(++id,{fn,at:clock.now+Math.max(0,delay)});return id;},clearTimeout(key){timers.delete(key);}});
 vm.runInContext(`
 let scope='workspace:user',generation=1,polling=false,streaming=true,connected=true,cursor=0,lastPoll=0,abort=null;
 let snapshot={devices:{}},updatePending=false,updateTimer=0,pollFailures=0,pollRetryAt=0,streamReconnectTimer=0,streamFailures=0;
 const UPDATE_READ_MS=1000;
 let currentUser={id:'user'},sb={},cloudReady=true,loadingCloud=false,STAFF_REPORT_MODE=false,STAFF_RECEIVING_MODE=false;
 const cloudWorkspaceId=()=> 'workspace',canAccess=()=>true,context=()=>(${context});
 let calls=0,apiCalls=0,failReads=false,holdRead=false,releaseRead,streamMode='busy',message='',curPage='dashboard',view='live';
 const received=[];
 const render=()=>{},batchCameraHasPending=()=>false;
 const receive=data=>{cursor=data.events.at(-1)||cursor;received.push(...data.events);};
 const request=async()=>{calls++;if(holdRead){holdRead=false;await new Promise(resolve=>releaseRead=resolve);}if(failReads)throw Error('Isolated read failure');return {events:[calls],moreEvents:false};};
 const api=async()=>{apiCalls++;if(streamMode==='error')throw Error('Isolated stream failure');if(streamMode==='updates')return new Response(new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode(Array.from({length:100},()=>JSON.stringify({kind:'update'})+'\\n').join('')));controller.close();}}),{headers:{'Content-Type':'application/x-ndjson'}});return new Response(JSON.stringify({busy:true}),{headers:{'Content-Type':'application/json'}});};
 ${extract('scheduleUpdateRead')}
 ${extract('poll')}
 ${extract('startStream')}
 const state=()=>({calls,apiCalls,cursor,received:[...received],polling,pollRetryAt,streamReconnectTimer,allowed:context().allowed});
 `,ctx);
 // TextEncoder is only used by the isolated NDJSON transport, not application internals.
 ctx.TextEncoder=TextEncoder;
 const flush=async()=>{for(let i=0;i<24;i++)await Promise.resolve();};
 return {run:code=>vm.runInContext(code,ctx),flush,async advance(ms){const end=clock.now+ms;for(let turns=0;turns<1000;turns++){await flush();const next=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next){clock.now=end;await flush();return;}timers.delete(next[0]);clock.now=next[1].at;next[1].fn();}throw Error('Timer flood');}};
}
{
 const f=fixture();f.run('cloudReady=false;loadingCloud=true');await f.run('poll({initial:true,force:true})');assert.equal(f.run('state().calls'),0);f.run('streaming=false');await f.run('startStream(generation)');assert.equal(f.run('state().apiCalls'),0);
 f.run('cloudReady=true;loadingCloud=false;streaming=true');await f.run('poll({initial:true,force:true})');assert.equal(f.run('state().calls'),1);
 console.log('PASS printer read and collector wait for completed workspace startup');
}
{
 const f=fixture();f.run('streaming=false;streamMode="updates"');await f.run('startStream(generation)');await f.advance(0);assert.equal(f.run('state().calls'),1,'100 actual SSE updates coalesce into one read');
 await f.advance(999);assert.equal(f.run('state().calls'),1);
 f.run('for(let i=0;i<100;i++)scheduleUpdateRead()');await f.advance(1);assert.equal(f.run('state().calls'),2);assert.deepEqual([...f.run('state().received')],[1,2]);
 console.log('PASS NDJSON bursts are bounded to one read per second and retain cursor events');
}
{
 const f=fixture();f.run('holdRead=true;scheduleUpdateRead()');await f.advance(0);assert.equal(f.run('state().calls'),1);
 f.run('for(let i=0;i<100;i++)scheduleUpdateRead();releaseRead()');await f.flush();await f.advance(1000);assert.equal(f.run('state().calls'),2,'Updates during an in-flight read get one trailing read');
 assert.equal(f.run('state().cursor'),2);
 console.log('PASS in-flight update bursts retain a trailing read without parallel requests');
}
{
 const f=fixture();f.run('failReads=true;scheduleUpdateRead()');await f.advance(0);assert.equal(f.run('state().calls'),1);
 for(let i=0;i<4;i++){f.run('for(let i=0;i<100;i++)scheduleUpdateRead()');await f.advance(1000);await f.run('poll()');}
 assert.equal(f.run('state().calls'),1,'Automatic notifications and ticks honor retry backoff');await f.advance(1000);assert.equal(f.run('state().calls'),2);
 f.run('cloudReady=false;loadingCloud=true');await f.advance(10000);assert.equal(f.run('state().calls'),2,'A failed session cannot wake a delayed read');
 console.log('PASS repeated read failures back off and cannot run after readiness is lost');
}
{
 const f=fixture();f.run('streaming=false');await f.run('startStream(generation)');assert.equal(f.run('state().apiCalls'),1);
 await f.run('poll({force:true})');await f.advance(29999);assert.equal(f.run('state().apiCalls'),1,'Busy collector does not reclaim every poll');await f.advance(1);assert.equal(f.run('state().apiCalls'),2);
 console.log('PASS another collector is respected for 30 seconds without repeated claims');
}
{
 const f=fixture();f.run('streaming=false;streamMode="error"');await f.run('startStream(generation)');await f.advance(9999);assert.equal(f.run('state().apiCalls'),1);await f.advance(1);assert.equal(f.run('state().apiCalls'),2);await f.advance(19999);assert.equal(f.run('state().apiCalls'),2);
 console.log('PASS stream failures use increasing reconnect backoff');
}
