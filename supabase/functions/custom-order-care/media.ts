export function isCareImage(bytes:Uint8Array,type:string):boolean{
 if(bytes.length<12||bytes.length>5242880)return false;
 if(type==='image/png')return [137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v);
 if(type==='image/jpeg')return bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 if(type==='image/webp')return String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';
 return false;
}
export async function sha256(bytes:Uint8Array):Promise<string>{
 return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes as BufferSource)),v=>v.toString(16).padStart(2,'0')).join('');
}
export async function readCareBody(req:Request,limit=32768):Promise<any>{
 if(Number(req.headers.get('content-length')||0)>limit)throw new RangeError('body');
 const reader=req.body?.getReader();if(!reader)throw new SyntaxError('body');
 const chunks:Uint8Array[]=[];let size=0;
 while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw new RangeError('body');}chunks.push(value);}
 const bytes=new Uint8Array(size);let off=0;for(const chunk of chunks){bytes.set(chunk,off);off+=chunk.length;}
 const body=JSON.parse(new TextDecoder().decode(bytes));if(!body||Array.isArray(body)||typeof body!=='object')throw new SyntaxError('body');return body;
}
