import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {chromium} from 'playwright-core';
import {createServer} from 'node:http';
const wave=readFileSync('assets/printer-voice/boarding-chime.wav');
assert.equal(wave.toString('ascii',0,4),'RIFF');assert.equal(wave.readUInt16LE(22),1);assert.equal(wave.readUInt32LE(24),24000);
assert.equal(wave.readUInt32LE(40)/48000,1.42);let peak=0;for(let i=44;i<wave.length;i+=2)peak=Math.max(peak,Math.abs(wave.readInt16LE(i))/32768);assert.ok(peak>.45&&peak<.6,'The cue has headroom and no clipping');
const out=resolve('qa-results/printer-chime');mkdirSync(out,{recursive:true});
const hits=[],fixture=resolve(out,'real-audio.html'),allowed=new Set(['/fixture.html','/assets/printer-voice-policy.js','/assets/printer-voice.js','/assets/printer-voice/enya-preview.wav','/assets/printer-voice/boarding-chime.wav']);let cueMissing=false;
const server=createServer((req,res)=>{const path=new URL(req.url,'http://localhost').pathname;if(!allowed.has(path)||cueMissing&&path.endsWith('/boarding-chime.wav')){res.writeHead(404).end();return;}hits.push(path);res.writeHead(200,{'Content-Type':path.endsWith('.wav')?'audio/wav':path.endsWith('.js')?'application/javascript':'text/html; charset=utf-8'});res.end(readFileSync(path==='/fixture.html'?fixture:resolve('.'+path)));});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port,asset=name=>base+'/assets/'+name;
writeFileSync(fixture,`<!doctype html><meta charset="utf-8"><div id="panel"><footer class="notification-panel-footer"></footer></div><script>window.trace=[];window.players=0;window.appIcon=()=>'<svg></svg>';const NativeAudio=Audio;window.Audio=function(src){players++;const audio=new NativeAudio(src);for(const type of ['playing','ended','error'])audio.addEventListener(type,()=>trace.push({type,src:audio.src,duration:audio.duration,at:performance.now()}));return audio;};</script><script src="${asset('printer-voice-policy.js')}"></script><script src="${asset('printer-voice.js')}"></script><script>PlatePrinterVoice.mount(document.getElementById('panel'),{scope:'chime-real-audio',allowed:true});</script>`);
let browser;
try{
 browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const page=await browser.newPage();await page.goto(base+'/fixture.html');await page.locator('[data-voice-test]').click();
 await page.waitForFunction(()=>trace.filter(row=>row.type==='ended').length===2,{},{timeout:22000});
 const result=await page.evaluate(()=>({trace,players})),starts=result.trace.filter(row=>row.type==='playing'),ends=result.trace.filter(row=>row.type==='ended');
 assert.equal(result.players,1,'The same media element plays both parts');assert.equal(result.trace.filter(row=>row.type==='error').length,0);assert.equal(starts.length,2);
 assert.match(starts[0].src,/boarding-chime\.wav$/);assert.match(starts[1].src,/^blob:/);assert.ok(Math.abs(starts[1].duration-12.88)<.03,'The approved full Enya sample plays');
 assert.ok(hits.indexOf('/assets/printer-voice/enya-preview.wav')<hits.indexOf('/assets/printer-voice/boarding-chime.wav'),'Voice bytes are ready before the intro plays');
 const gap=starts[1].at-ends[0].at;assert.ok(gap>=150&&gap<1500,`Cue ends before Enya with a short pause (${gap}ms)`);
 cueMissing=true;const fallbackPage=await browser.newPage();await fallbackPage.goto(base+'/fixture.html');await fallbackPage.locator('[data-voice-test]').click();
 await fallbackPage.waitForFunction(()=>trace.some(row=>row.type==='playing'&&row.src.startsWith('blob:')),{},{timeout:10000});
 const fallback=await fallbackPage.evaluate(()=>({trace,players}));assert.equal(fallback.players,1);assert.equal(fallback.trace.filter(row=>row.type==='error').length,1,'Missing cue produces one media error, then real Enya still plays');await fallbackPage.evaluate(()=>PlatePrinterVoice.stop());
 const proof={status:'PASS',cueSeconds:1.42,gapMs:gap,peak,missingCueFallback:'PASS',scope:'Real Chrome media decode/playback; fixed approved Enya preview, no provider or printer requests',...result};
 writeFileSync(resolve(out,'summary.json'),JSON.stringify(proof,null,2));console.log(`PASS real announcement audio: original cue 1.42s, ${Math.round(gap)}ms gap, Enya WAV decoded and played, one media element, no overlap.`);
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
