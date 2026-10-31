/* Inline, fixed-camera keyboard illustration. One physical keys+text part. */
(() => {
  'use strict';
  const data=window.KeyboardRenderData,cache=new Map(),paintVersions=new WeakMap(),paintStates=new WeakMap();
  const displayGamma=Uint8Array.from({length:16385},(_,i)=>{const x=i/16384;return Math.round(255*(x<=.0031308?12.92*x:1.055*x**(1/2.4)-.055));});
  const labels={tray:'Khay bàn phím',buttons:'Nút bàn phím',characters:'Ký tự'};
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const color=s=>/^#[a-f\d]{6}$/i.test(s||'')?s:/^#[a-f\d]{3}$/i.test(s||'')?'#'+s.slice(1).split('').map(c=>c+c).join(''):null;
  function profile(line,model){const v=model?.variants?.find(v=>v.id===line.variantId),p=v&&Object.hasOwn(v,'keyboardProfile')?v.keyboardProfile:model?.keyboardProfile;return p?.version===1&&p.partIds?.tray&&p.partIds?.keys&&(!Array.isArray(v?.partIds)||[p.partIds.tray,p.partIds.keys].every(id=>v.partIds.includes(id)))?p:null;}
  function init(line,p){
    if(!line.keyboard)line.keyboard={version:1,text:'',partIds:{...p.partIds},colors:Object.fromEntries(Object.keys(labels).filter(r=>line.colorChoices?.[r==='tray'?p.partIds.tray:p.partIds.keys]).map(r=>[r,line.colorChoices[r==='tray'?p.partIds.tray:p.partIds.keys]]))};
    return line.keyboard;
  }
  function ids(line,p){return Object.fromEntries(Object.keys(labels).map(r=>[r,line.keyboard?.colors?.[r]||p?.defaults?.[r]||null]));}
  function fields(line,p,fils){
    const k=init(line,p);
    return `<section class="keyboard-custom" data-keyboard-line="${esc(line.id)}" aria-label="Phối màu bàn phím tên"><div class="keyboard-illustration"><canvas data-keyboard-canvas role="img" aria-label="Minh họa bàn phím tên"></canvas><span class="keyboard-render-message" role="status">Nhập ký tự để xem phối màu</span></div><div class="field"><label for="keyboard-text-${esc(line.id)}">Ký tự trên bàn phím <span class="required">*</span></label><input id="keyboard-text-${esc(line.id)}" data-keyboard-text="${esc(line.id)}" value="${esc(k.text)}" maxlength="120" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="Tên hoặc ký tự khách yêu cầu (IN HOA)"></div><fieldset class="part-colors keyboard-color-fields"><legend>Phối màu bàn phím</legend>${Object.keys(labels).map(role=>{
      const base=p.defaults?.[role],fil=fils.find(f=>f.id===base),sourceIds=p.sourceColorIds?.[role==='tray'?'tray':'keys']||[];
      const baseLabel=fil?.name||(sourceIds.length>1?'Chưa xác định màu gốc theo vùng':'Chưa chỉ định');
      return `<label class="part-color-field"><span>${labels[role]}</span><select class="br-color-native" data-keyboard-role="${role}" data-keyboard-line="${esc(line.id)}" aria-label="${labels[role]}"><option value="" data-filament-id="${esc(base||'')}">Giữ màu gốc: ${esc(baseLabel)}</option>${fils.map(f=>`<option value="${esc(f.id)}" ${k.colors?.[role]===f.id?'selected':''}>${esc([f.brand,f.name,f.mat].filter(Boolean).join(' · '))}</option>`).join('')}</select></label>`;
    }).join('')}</fieldset><p class="keyboard-preview-note">Hình minh họa phối màu. Nút và ký tự in chung một part; màu thực tế có thể chênh theo ánh sáng và màn hình.</p></section>`;
  }
  function validation(line,p,getFil){
    if(!p)return '';
    const k=line.keyboard;if(!k?.text?.trim())return 'Nhập ký tự trên bàn phím trước khi tiếp tục.';
    if(k.partIds?.tray!==p.partIds.tray||k.partIds?.keys!==p.partIds.keys)return 'Cấu hình bàn phím đã thay đổi; chọn lại đúng sản phẩm.';
    const resolved=ids(line,p);
    if(Object.values(resolved).some(id=>id&&!getFil(id)))return 'Màu bàn phím không còn trong thư viện; kiểm tra lại màu đã chọn.';
    if((k.colors?.buttons||k.colors?.characters)&&(p.sourceColorIds?.keys?.length||0)>1&&(!resolved.buttons||!resolved.characters))return 'Chọn đủ màu nút và ký tự để xác định hai vùng của part in chung.';
    return '';
  }
  function summary(line){
    const k=line.keyboard;if(!k?.text)return '';
    return `<p class="keyboard-confirmed-text"><b>Ký tự:</b> ${esc(k.text)}</p>`;
  }
  function image(src){
    if(!cache.has(src))cache.set(src,new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>{const c=document.createElement('canvas');c.width=im.naturalWidth;c.height=im.naturalHeight;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(im,0,0);resolve({width:c.width,height:c.height,pixels:ctx.getImageData(0,0,c.width,c.height)});};im.onerror=()=>{cache.delete(src);reject(Error('Chưa tải được bộ hình bàn phím.'));};im.src=src;}));
    return cache.get(src);
  }
  function tint(map,colors){
    const c=document.createElement('canvas');c.width=map.width;c.height=map.height;const ctx=c.getContext('2d'),output=ctx.createImageData(map.width,map.height),src=map.pixels.data,dst=output.data;
    const pigments=[null,...colors.map(hex=>(hex||'#a7aaa6').slice(1).match(/../g).map(v=>{const x=parseInt(v,16)/255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;}))];
    for(let i=0;i<src.length;i+=4){
      if(!src[i+3])continue;const role=Math.min(4,Math.round(src[i]/64)),pigment=pigments[role];
      if(pigment){const diffuse=2*(src[i+1]/255)**2,specular=(src[i+2]/255)**2;for(let channel=0;channel<3;channel++)dst[i+channel]=displayGamma[Math.min(16384,Math.round((pigment[channel]*diffuse+specular)*16384))];}
      else if(role!==4)continue;
      dst[i+3]=src[i+3];
    }
    ctx.putImageData(output,0,0);return c;
  }
  async function paint(holder,line,p,getFil){
    const canvas=holder.querySelector('[data-keyboard-canvas]');if(!canvas)return;
    const message=holder.querySelector('.keyboard-render-message'),chars=Array.from(new Intl.Segmenter('vi',{granularity:'grapheme'}).segment((line.keyboard?.text||'').trim()),x=>x.segment);
    const chosen=ids(line,p),colors=Object.keys(labels).map(r=>color(getFil(chosen[r])?.hex));
    const signature=JSON.stringify([chars,chosen,colors,Object.keys(labels).map(r=>getFil(chosen[r])?.name)]);
    if(paintStates.get(canvas)===signature)return;
    const version=(paintVersions.get(canvas)||0)+1;paintVersions.set(canvas,version);
    canvas.hidden=false;message.hidden=false;message.textContent='Đang dựng hình minh họa…';
    try{
      if(data?.version!==2||data.specularReflectanceApplied!==true||data.materialEncoding!=='spaced-red-v1')throw Error('Chưa tải được bộ hình bàn phím.');
      const n=chars.length||3,base=data.trays[String(Math.min(n,10))];
      const [map,glyphMaps]=await Promise.all([image(base.image),Promise.all(chars.map(c=>data.glyphs[c]?image(data.glyphs[c].image):null))]);
      const body=tint(map,colors);
      if(paintVersions.get(canvas)!==version||!holder.isConnected)return;
      const pitch=data.pitch*data.scale;
      const nativeWidth=n<=10?body.width:body.width+(n-10)*pitch,renderScale=Math.min(1,4096/nativeWidth);
      const next=document.createElement('canvas');next.width=Math.round(nativeWidth*renderScale);next.height=Math.round(body.height*renderScale);
      const ctx=next.getContext('2d');ctx.scale(renderScale,renderScale);let originX=base.origin[0];
      if(n<=10)ctx.drawImage(body,0,0);else{
        // Repeat complete original cells; never stretch tray ends or keycaps.
        const cut=Math.round(base.origin[0]-4*data.pitch*data.scale),right=Math.round(base.origin[0]+4*data.pitch*data.scale);
        ctx.drawImage(body,0,0,cut,body.height,0,0,cut,body.height);
        for(let i=0;i<n-2;i++)ctx.drawImage(body,cut,0,pitch,body.height,cut+i*pitch,0,pitch,body.height);
        ctx.drawImage(body,right,0,body.width-right,body.height,cut+(n-2)*pitch,0,body.width-right,body.height);
        originX=base.origin[0]+(n-10)*pitch/2;
      }
      const fallback=[];
      for(let i=0;i<chars.length;i++){
        const glyph=data.glyphs[chars[i]],center=originX+(i-(n-1)/2)*pitch;
        if(glyph){const g=tint(glyphMaps[i],colors);ctx.drawImage(g,Math.round(center+glyph.offset[0]),Math.round(base.origin[1]+glyph.offset[1]));}
        else if(chars[i]!==' '){fallback.push(chars[i]);ctx.fillStyle=colors[2]||'#a7aaa6';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`bold ${data.scale*11}px Georgia,serif`;ctx.fillText(chars[i],center,base.origin[1]-data.scale*22*Math.cos(data.cameraElevation*Math.PI/180));}
      }
      if(paintVersions.get(canvas)!==version||!holder.isConnected)return;
      // A rigid photo-style placement preserves the baked perspective and proportions.
      const angle=-6*Math.PI/180,width=Math.ceil(next.width*Math.cos(angle)+next.height*Math.abs(Math.sin(angle))),height=Math.ceil(next.height*Math.cos(angle)+next.width*Math.abs(Math.sin(angle)));
      if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
      const display=canvas.getContext('2d');display.clearRect(0,0,canvas.width,canvas.height);display.save();display.translate(width/2,height/2);display.rotate(angle);display.drawImage(next,-next.width/2,-next.height/2);display.restore();paintStates.set(canvas,signature);
      const notes=[];if(!chars.length)notes.push('Nhập ký tự để xem hình theo tên khách.');if(colors.some(c=>!c))notes.push('Vùng chưa có màu xác định đang được tô trung tính.');if(fallback.length)notes.push('Ký tự chưa có mẫu đang dùng font minh họa thay thế.');
      message.hidden=!notes.length;message.textContent=notes.join(' ');canvas.setAttribute('aria-label',`Minh họa ${chars.join('')||'chưa nhập ký tự'}; ${Object.keys(labels).map(r=>labels[r]+': '+(getFil(chosen[r])?.name||'chưa xác định')).join('; ')}`);
    }catch(error){if(paintVersions.get(canvas)!==version)return;paintStates.delete(canvas);canvas.hidden=true;message.hidden=false;message.textContent=error.message;}
  }
  window.CustomKeyboardPreview={profile,init,ids,fields,validation,summary,paint,labels};
})();
