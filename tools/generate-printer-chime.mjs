// Original four-note announcement cue. No recordings or external sound libraries.
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const rate=24000,duration=1.42,samples=new Float64Array(Math.round(rate*duration));
const notes=[[0,523.251,.78],[.18,659.255,.82],[.36,783.991,.86],[.59,1046.502,.92]];
for(const [start,hz,level] of notes)for(const [delay,reflection] of [[0,1],[.075,.14],[.145,.08],[.235,.04]]){
 for(let i=Math.round((start+delay)*rate);i<samples.length;i++){
  const t=i/rate-start-delay;if(t<0||t>.8)continue;
  const attack=1-Math.exp(-t/.006),tail=Math.exp(-t/.23);
  samples[i]+=level*reflection*attack*(Math.sin(2*Math.PI*hz*t)*tail+.22*Math.sin(4*Math.PI*hz*t)*Math.exp(-t/.12)+.07*Math.sin(6*Math.PI*hz*t)*Math.exp(-t/.075));
 }
}
const peak=Math.max(...samples.map(Math.abs)),bytes=Buffer.alloc(44+samples.length*2);
bytes.write('RIFF',0);bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVEfmt ',8);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);bytes.writeUInt32LE(rate,24);bytes.writeUInt32LE(rate*2,28);bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(samples.length*2,40);
for(let i=0;i<samples.length;i++){const fade=Math.min(1,(samples.length-1-i)/(.045*rate));bytes.writeInt16LE(Math.round(samples[i]/peak*.52*fade*32767),44+i*2);}
const path=resolve('assets/printer-voice/boarding-chime.wav');writeFileSync(path,bytes);console.log(`Created original announcement cue: ${duration}s, PCM16 mono ${rate}Hz, ${bytes.length} bytes.`);
