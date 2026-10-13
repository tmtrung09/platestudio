import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
const baseline=process.argv.includes('--baseline');
const source=baseline?execFileSync('git',['show','HEAD:push-sw.js'],{encoding:'utf8'}):fs.readFileSync(new URL('../push-sw.js',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setTimeout(resolve,15));
async function probe({cached=false,offline=false,quota=false,navigate=false,versioned=false}={}){
 const handlers={},waits=[],failures=[],writes=[];let respond,openCache;
 const opened=new Promise(resolve=>{openCache=resolve;});
 const onReject=error=>failures.push(error.message);process.on('unhandledRejection',onReject);
 try{
  const context=vm.createContext({URL,Response,Promise,console,self:{location:{origin:'https://qa.invalid'},addEventListener:(name,handler)=>{handlers[name]=handler;}},fetch:async()=>{if(offline)throw new Error('offline');return new Response('fresh-body');},caches:{match:async(request,options)=>cached||versioned&&options?.ignoreSearch?new Response('cached-body'):undefined,open:()=>opened}});
  vm.runInContext(source,context);
  handlers.fetch({request:{method:'GET',url:'https://qa.invalid/asset.js'+(versioned?'?v=revision':''),mode:navigate?'navigate':'cors'},respondWith:promise=>{respond=promise;},waitUntil:promise=>waits.push(promise)});
  const response=await respond,body=await response.text();
  openCache({put:async(request,copy)=>{if(quota)throw new Error('cache quota');writes.push(await copy.text());}});
  await tick();await Promise.all(waits);await tick();
  assert.equal(body,cached||versioned?'cached-body':'fresh-body');assert.deepEqual(failures,[],'No dangling network/cache/clone rejection');
  if(!offline&&!quota)assert.deepEqual(writes,['fresh-body'],'Cache receives an unconsumed synchronous clone');
  assert.ok(waits.length>0,'Background work is registered with event lifetime');
 }finally{process.off('unhandledRejection',onReject);}
}
await probe();await probe({cached:true,offline:true});await probe({quota:true});await probe({cached:true,offline:true,navigate:true});
await probe({versioned:true,offline:true});
console.log('PASS service worker: consumed response race, cached/offline network failure, cache quota, navigation/versioned asset fallback, waitUntil lifetime');
