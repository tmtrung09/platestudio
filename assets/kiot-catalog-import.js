(() => {
  'use strict';

  const W = 700;
  const H = 326;
  const celebrationDuration = 850;
  const faultHold = 340;
  const inspectionMove = 480;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const stages = {
    read: { step: 0, title: 'Đang đọc file', scene: 'Đọc file', detail: 'Mở file và nhận diện các cột dữ liệu.' },
    validate: { step: 1, title: 'Đang kiểm tra mã hàng', scene: 'Quét mã hàng', detail: 'Đối chiếu cột mã hàng và gom các dòng theo SKU.' },
    save: { step: 2, title: 'Đang lưu danh mục', scene: 'Cập nhật danh mục', detail: 'Đang ghi danh mục sản phẩm và mốc tồn kho.' },
    wait: { step: 2, title: 'Đang chờ server xác nhận', scene: 'Chờ xác nhận', detail: 'Hệ thống đang chờ kết quả lưu trên cloud.' }
  };
  const faults = {
    reader: { title: 'Không tải được bộ đọc Excel', alarm: 'Bộ đọc Excel chưa tải', bounds: [55,418,66,275] },
    file: { title: 'Không đọc được danh mục từ file', alarm: 'File không hợp lệ', bounds: [55,418,66,275] },
    network: { title: 'Mất kết nối khi lưu', alarm: 'Đứt đường truyền', bounds: [284,655,117,280] },
    timeout: { title: 'Server chưa phản hồi', alarm: 'Server không phản hồi', bounds: [365,656,80,270] },
    session: { title: 'Phiên đăng nhập đã hết hạn', alarm: 'Hết phiên đăng nhập', bounds: [353,640,112,284] },
    permission: { title: 'Tài khoản không có quyền lưu', alarm: 'Không có quyền lưu', bounds: [353,640,112,282] },
    unavailable: { title: 'Dịch vụ lưu chưa sẵn sàng', alarm: 'Dịch vụ lưu gián đoạn', bounds: [353,660,96,274] },
    server: { title: 'Server không lưu được danh mục', alarm: 'Server báo lỗi lưu', bounds: [369,650,78,291] },
    unconfirmed: { title: 'Chưa xác nhận lưu', alarm: 'Chưa xác nhận lưu', bounds: [365,656,80,270] }
  };
  const clamp = value => Math.max(0, Math.min(1, value));
  const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
  const mix = (from, to, t) => from + (to - from) * t;

  let ui;
  let ctx;
  let observer;
  let returnFocus;
  let state = 'idle';
  let stageName = 'read';
  let faultKind = '';
  let fileFormat = 'FILE';
  let detail = '';
  let startedAt = 0;
  let frameId = 0;

  function createDialog() {
    const dialog = document.createElement('dialog');
    dialog.id = 'kiot-catalog-import-dialog';
    dialog.setAttribute('aria-labelledby', 'kiot-catalog-import-title');
    dialog.innerHTML = `
      <header class="import-header">
        <p class="import-kicker">KIOTVIET / DANH MỤC &amp; TỒN KHO</p>
        <h2 id="kiot-catalog-import-title" tabindex="-1" autofocus>Nhập file danh mục sản phẩm</h2>
        <p class="import-filename"></p>
      </header>
      <div class="import-scene" aria-hidden="true">
        <div class="scene-label"><span class="scene-lamp"></span><span class="scene-caption"></span></div>
        <div class="scene-file"></div>
        <div class="scene-alarm" hidden>
          <span class="alarm-tag">Xử lý thất bại</span>
          <strong></strong>
        </div>
        <canvas></canvas>
        <div class="scene-legend">
          <span>01 <b>File nguồn</b></span><span>02 <b>Quét dữ liệu</b></span><span>03 <b>Kho danh mục</b></span>
        </div>
      </div>
      <div class="import-body">
        <div class="import-status" role="status" aria-atomic="true">
          <strong></strong><p></p>
        </div>
        <ol class="import-steps" aria-label="Các bước nhập danh mục">
          <li><span aria-hidden="true">01</span> Đọc file</li>
          <li><span aria-hidden="true">02</span> Kiểm tra mã hàng</li>
          <li><span aria-hidden="true">03</span> Lưu danh mục</li>
        </ol>
      </div>
      <footer class="import-footer" hidden>
        <button type="button" class="btn btn-ghost">Đóng</button>
      </footer>`;
    const find = selector => dialog.querySelector(selector);
    ui = {
      dialog, heading: find('h2'), fileName: find('.import-filename'), scene: find('.import-scene'),
      caption: find('.scene-caption'), fileType: find('.scene-file'), alarm: find('.scene-alarm'),
      alarmText: find('.scene-alarm strong'), canvas: find('canvas'), title: find('.import-status strong'),
      detail: find('.import-status p'), steps: [...dialog.querySelectorAll('.import-steps li')],
      footer: find('footer'), closeButton: find('button')
    };
    ctx = ui.canvas.getContext('2d');
    if (typeof ResizeObserver === 'function') observer = new ResizeObserver(render);
    dialog.addEventListener('keydown', event => {
      if (event.key === 'Escape') event.stopPropagation();
    });
    dialog.addEventListener('cancel', event => {
      event.preventDefault();
      event.stopPropagation();
      if (state !== 'busy') close();
    });
    dialog.addEventListener('close', () => {
      if (!dialog.open && state !== 'idle') reset();
    });
    ui.closeButton.addEventListener('click', close);
    document.body.append(dialog);
  }

  function updateStatus() {
    const step = stages[stageName].step;
    const busy = state === 'busy';
    const failed = state === 'error';
    const fault = faults[faultKind];
    ui.dialog.dataset.outcome = state;
    ui.title.textContent = failed ? fault.title : busy ? stages[stageName].title : 'Đã nhập danh mục';
    ui.detail.textContent = detail || (busy ? stages[stageName].detail : '');
    ui.steps.forEach((item, index) => {
      const current = index === step && state !== 'done';
      item.dataset.state = current ? failed ? 'error' : 'active'
        : state === 'done' || index < step ? 'done' : 'pending';
      if (current) item.setAttribute('aria-current', 'step');
      else item.removeAttribute('aria-current');
    });
    ui.footer.hidden = busy;
  }

  function begin(fileName, trigger) {
    if (!ui) createDialog();
    if (state === 'busy') return false;
    if (!ui.dialog.open) returnFocus = trigger || document.activeElement;
    const name = String(fileName || '');
    fileFormat = name.match(/\.(xlsx|xls|csv)$/i)?.[1].toUpperCase() || 'FILE';
    ui.fileName.textContent = name;
    ui.fileType.textContent = fileFormat;
    state = 'busy';
    stageName = 'read';
    faultKind = '';
    detail = '';
    startedAt = performance.now();
    updateStatus();
    if (!ui.dialog.open) {
      ui.dialog.showModal();
      observer?.observe(ui.canvas);
    }
    ui.dialog.scrollTop = 0;
    ui.heading.focus({ preventScroll: true });
    render();
    return true;
  }

  function stage(next, message) {
    if (state !== 'busy' || !Object.hasOwn(stages,next)) return;
    if (stageName !== next) startedAt = performance.now();
    stageName = next;
    detail = message || '';
    updateStatus();
    render();
  }

  function finish(next, message) {
    if (state !== 'busy') return;
    state = next;
    detail = message || '';
    startedAt = performance.now();
    updateStatus();
    render();
  }

  function success(message) {
    finish('done', message);
  }

  function fail(kind, message) {
    if (state !== 'busy') return;
    faultKind = Object.hasOwn(faults,kind) ? kind : 'unconfirmed';
    finish('error', message);
  }

  function reset() {
    state = 'idle';
    cancelAnimationFrame(frameId);
    frameId = 0;
    observer?.disconnect();
    const fallback = document.getElementById('kiot-catalog-import-button');
    const focusTarget = returnFocus instanceof HTMLElement && returnFocus.isConnected &&
      returnFocus.getClientRects().length ? returnFocus : fallback;
    returnFocus = null;
    if (focusTarget && focusTarget !== document.body) focusTarget.focus({ preventScroll: true });
  }

  function close() {
    if (!ui?.dialog.open) return;
    ui.dialog.close();
    reset();
  }

  function render() {
    if (!ui?.dialog.open) return;
    cancelAnimationFrame(frameId);
    frameId = 0;
    if (document.hidden) return;
    const elapsed = Math.max(0, performance.now() - startedAt);
    const failed = state === 'error';
    const still = reducedMotion.matches;
    const reactionDuration = faultKind === 'timeout' || faultKind === 'unconfirmed' ? 560 : 900;
    const total = failed ? reactionDuration+faultHold+inspectionMove : celebrationDuration;
    const impact = !failed ? 0 : still ? 1 : clamp(elapsed/reactionDuration);
    const inspection = !failed ? 0 : still ? 1 : smooth((elapsed-reactionDuration-faultHold)/inspectionMove);
    const alarm = failed && (still || elapsed >= total || !ctx);
    ui.alarm.hidden = !alarm;
    if (alarm && ui.alarmText.textContent !== faults[faultKind].alarm) {
      ui.alarmText.textContent = faults[faultKind].alarm;
    }
    ui.scene.dataset.phase = alarm ? 'error' : state === 'done' ? 'done' : stageName === 'wait' ? 'waiting' : stageName;
    ui.scene.dataset.inspection = String(inspection > 0);
    const caption = failed ? 'Góc cận sự cố'
      : state === 'done' ? 'Hoàn tất' : stages[stageName].scene;
    if (ui.caption.textContent !== caption) ui.caption.textContent = caption;
    if (ctx) draw(elapsed, impact, inspection);

    const stageDuration = stageName === 'read' ? 1500 : stageName === 'validate' ? 1850 : 2750;
    const moving = !still && ctx && (state === 'busy' ? stageName === 'wait' || elapsed < stageDuration : elapsed < total);
    if (moving) frameId = requestAnimationFrame(render);
  }

  function shape(points, fill, stroke, width = 1) {
    ctx.beginPath();
    points.forEach(([x,y], index) => index ? ctx.lineTo(x,y) : ctx.moveTo(x,y));
    if (fill) { ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.lineWidth = width; ctx.strokeStyle = stroke; ctx.stroke(); }
  }

  function ellipse(x,y,rx,ry,fill,stroke,width = 1) {
    ctx.beginPath();
    ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.lineWidth = width; ctx.strokeStyle = stroke; ctx.stroke(); }
  }

  function glow(x,y,r,color) {
    const light = ctx.createRadialGradient(x,y,0,x,y,r);
    light.addColorStop(0,color);
    light.addColorStop(1,'transparent');
    ellipse(x,y,r,r,light);
  }

  function label(value,x,y,color,size = 10) {
    ctx.fillStyle = color;
    ctx.font = '600 '+size+'px ui-monospace, monospace';
    ctx.fillText(value,x,y);
  }

  function block(x,y,w,d,h,colors) {
    const a = [x,y], b = [x+w,y], c = [x+w+d,y-d*.46], e = [x+d,y-d*.46];
    shape([b,c,[c[0],c[1]-h],[b[0],b[1]-h]],colors[2],colors[3]);
    shape([a,b,[b[0],b[1]-h],[a[0],a[1]-h]],colors[1],colors[3]);
    shape([[x,y-h],[x+w,y-h],[c[0],c[1]-h],[e[0],e[1]-h]],colors[0],colors[3]);
  }

  function crate(x,y,scale,tone) {
    ctx.save();
    ctx.translate(x,y);
    ctx.scale(scale,scale);
    const colors = {
      green:['#9bdcaf','#426d52','#294a38','#a1ebaf','#d1f7b2'],
      amber:['#d6b278','#6a5335','#483821','#efce92','#ffe6ad'],
      red:['#dd8a72','#6c4339','#522d29','#ffad96','#ffcfb9']
    }[tone];
    block(0,0,28,11,21,colors);
    shape([[11,-21],[19,-21],[30,-26],[22,-26]],colors[4]);
    for (let col=0; col<5; col++) {
      shape([[5+col*2,-6],[5+col*2,-12]],null,colors[4]);
    }
    ctx.restore();
  }

  function drawFile(time, phase, seated = 0) {
    const shift = smooth((time-550)/2300);
    const x = mix(85,286,shift);
    const bob = phase === 'ready' ? 0 : Math.sin(time/380)*3;
    const y = mix(mix(83,65,shift)+bob,115,seated);
    glow(x+36,y+59,96,'#58f99628');
    ellipse(x+49,234,45,9,'#02090688');
    ctx.save();
    ctx.translate(x,y);
    ctx.transform(1, -.10, -.17, 1, 0, 0);
    const paper = [[0,0],[65,0],[84,19],[84,114],[0,114]];
    shape(paper.map(([x,y]) => [x+12,y+10]),'#243e32','#537061');
    shape(paper.map(([x,y]) => [x+6,y+5]),'#345844','#76a88b');
    const pageColor = ctx.createLinearGradient(0,0,84,115);
    pageColor.addColorStop(0,'#c1f2cb');
    pageColor.addColorStop(1,'#67977d');
    shape(paper,pageColor,'#dcf6de',1.2);
    shape([[65,0],[65,19],[84,19]],'#e1f7d9','#759c82');
    label(fileFormat,9,22,'#1e4733',15);
    shape([[9,34],[74,34],[74,99],[9,99]],'#285741','#548366');
    for(let row=0;row<6;row++) {
      const rowY=40+row*10;
      shape([[10,rowY+4],[73,rowY+4]],null,'#537d67');
      shape([[14,rowY],[29-row%2*4,rowY]],null,'#b6e7bc',2);
      shape([[35,rowY],[54+row%3*4,rowY]],null,'#86b797',2);
      shape([[64,rowY],[69,rowY]],null,'#d0efb4',2);
    }
    if (time >= 450) {
      const scanY = 34 + 65*clamp((time-450)/2400);
      const scan = ctx.createLinearGradient(0,scanY-12,0,scanY+1);
      scan.addColorStop(0,'#c5ffb000');
      scan.addColorStop(1,'#c5ffb097');
      ctx.fillStyle = scan;
      ctx.fillRect(4,scanY-12,76,12);
      shape([[4,scanY],[80,scanY]],null,'#e7ffcf',1.5);
    }
    ctx.restore();
  }

  function drawRack(fill) {
    const litCount = Math.floor(fill*6+0.001);
    const x=502, right=612, depth=43, frontFloor=243, frontTop=144;
    const rearLift=depth*.46;
    const rearFloor=frontFloor-rearLift, rearTop=frontTop-rearLift;
    for(const post of [x+depth,right+depth-4]) {
      shape([[post,rearFloor],[post,rearTop],[post+4,rearTop],[post+4,rearFloor]],'#40564a','#71887a');
    }
    block(502,243,110,43,8,['#506259','#263a30','#1c2b23','#667c70']);
    block(502,197,110,43,7,['#4a6053','#2e4437','#23352c','#71877b']);
    block(502,151,110,43,7,['#465b50','#2a4034','#203228','#73897c']);
    for(let level=0;level<2;level++) {
      for(let col=0;col<3;col++) {
        const index = level*3+col;
        const x = 514 + col*31;
        const y = 233-level*46;
        if(index < litCount) crate(x,y,.83,'green');
        else {
          ctx.setLineDash([3,3]);
          shape([[x,y],[x+23,y],[x+23,y-18],[x,y-18],[x,y]],null,'#758c7b');
          ctx.setLineDash([]);
        }
      }
    }
    for(const post of [x,right-4]) {
      shape([[post,frontFloor],[post,frontTop],[post+4,frontTop],[post+4,frontFloor]],'#63786c','#9aaea2');
    }
    for(let i=0;i<5;i++) {
      const x=511+i*19;
      shape([[x,246],[x+9,246]],null,i<litCount ? '#bbf0a6' : '#72877b',2);
    }
  }

  function drawScanner(time, active) {
    const neon = '#a0f4b6';
    const portal = [[287,217],[287,122],[315,96],[380,96],[400,117],[400,203]];
    shape(portal,null,'#26382e',16);
    shape(portal,null,'#658172',2);
    const front = portal.map(([x,y]) => [x-13,y+9]);
    shape(front,null,'#364b3f',12);
    shape(front,null,active ? neon : '#708a7b',2);
    if (active) {
      const y = reducedMotion.matches ? 157 : 132+(Math.sin(time/235)+1)*30;
      shape([[278,y+8],[387,y+8],[400,y],[290,y]],'#94ffa451',neon);
      glow(335,y,65,'#73ff903a');
    }
    for(let n=0;n<5;n++) ellipse(313+n*11,109,2,2,active ? neon : '#779082');
  }

  function drawPackets(time) {
    const checked = time>=6250;
    for (let index=0; index<9; index++) {
      const launch=(checked ? 6250 : 3000)+index*(checked ? 175 : 240);
      const p=clamp((time-launch)/(checked ? 1600 : 1050));
      if (p<=0 || p>=1) continue;
      const x=checked ? mix(344,512,p) : mix(337,376,p);
      const lane=checked ? mix(176,216,p) : 140+index%5*13;
      const y=lane+Math.sin(index*2.3+p*6)*8;
      const color='#b3fac3';
      const trail=16+index%4*5;
      const beam=ctx.createLinearGradient(x-trail,0,x+6,0);
      beam.addColorStop(0,'transparent');
      beam.addColorStop(1,color);
      shape([[x-trail,y],[x+6,y]],null,beam,1.5);
      shape([[x-4,y-4],[x+7,y-4],[x+7,y+4],[x-4,y+4]],'#254636',color);
    }
  }

  function drawReaderFault(impact) {
    const fade = smooth(impact*1.45);
    const amber = '#f5c17e';
    // The power carriage backs out of the scanner and leaves the source document in its tray.
    block(227,240,49,26,11,['#4c5b51','#314137','#24362d','#7b8d80']);
    const head = mix(266,207,fade);
    shape([[178,246],[212,246],[244,221],[head+20,221]],null,'#8c7351',3);
    block(head,228,24,12,13,['#b88b59','#684d35','#4c3829',amber]);
    shape([[head+25,218],[head+31,215]],null,amber,2);
    shape([[head+25,223],[head+31,220]],null,amber,2);
    glow(252,221,63,'#de8c4a48');
    for(let i=0;i<4;i++) {
      const x = mix(267,241,fade)-i*8;
      shape([[x,216-i*2],[x+4,214-i*2]],null,amber,1.6);
    }
    drawFile(0,'ready',fade);
  }

  function drawUnavailable(impact) {
    const shutdown = smooth(impact*1.35);
    const rackCover = ctx.createLinearGradient(499,115,656,244);
    rackCover.addColorStop(0,'#111a16e0');
    rackCover.addColorStop(1,'#111a16fa');
    ctx.save();
    ctx.globalAlpha=shutdown;
    shape([[496,237],[496,144],[541,121],[657,121],[657,220],[612,249],[496,249]],rackCover,'#596960',1.3);
    ctx.restore();

    // The shelf modules retract into their housing and go dark from top to bottom.
    for(let row=0;row<3;row++) {
      const off=smooth((impact-row*.13)*2.8);
      const x=510+25*off, y=153+row*43;
      const led=off<.75 ? '#d2f2bb' : '#896144';
      block(x,y,95-17*off,27,17,off<.75
        ? ['#586c60','#3c4c43','#25372e','#849787']
        : ['#303b35','#202a25','#19231e','#536259']);
      ellipse(x+9,y-8,2.4,2.4,led);
      for(let n=0;n<8;n++) {
        const vent=x+23+n*5;
        shape([[vent,y-5],[vent,y-12]],null,'#7a8b80',1.2);
      }
    }
    const stopped=mix(494,405,shutdown);
    shape([[397,241],[stopped,241]],null,'#e6ad74',2.4);
    ellipse(stopped,241,4,4,'#f0c387');
    drawHeldCrates(8950,[[450,227],[413,233],[376,239]],'amber');
  }

  function drawFinish(time) {
    const flare = reducedMotion.matches ? 1 : smooth(time/celebrationDuration);
    const x = 567, y = 125;
    glow(x,y,131,'#80ff8c35');
    if (flare<1) {
      for (let i=0;i<2;i++) {
        const wave=clamp(flare-i*.14);
        ellipse(x,y,20+98*wave,10+55*wave,null,'rgba(186,252,172,'+(.66*(1-wave))+')',1.2);
      }
      for(let i=0;i<26;i++) {
        const angle=i*2.399;
        const r=(38+(i*19)%100)*flare;
        ellipse(x+Math.cos(angle)*r,y+Math.sin(angle)*r*.65,1.6,1.6,'rgba(212,255,190,'+(1-flare)+')');
      }
    }
    ellipse(x,y-26,20,20,'#b6f8ba','#e6ffda');
    shape([[x-9,y-26],[x-3,y-20],[x+9,y-33]],null,'#224831',3);
  }

  function conveyorFracture(x,gap) {
    return [[x,230],[x+12+gap*5,224],[x+26-gap*5,218],[x+36+gap*5,213],[x+55,204.7]];
  }

  function drawConveyor(gap,scroll,active) {
    const colors=['#364b40','#25392e','#24372d','#617d6d'];
    const start=78, end=501;
    const leftEnd=mix(460,401,gap);
    const rightStart=mix(460,485,gap);
    const track=gap>0 ? [[start,leftEnd],[rightStart,end]] : [[start,end]];
    if(gap>0) {
      const left=conveyorFracture(leftEnd,gap);
      const right=conveyorFracture(rightStart,gap);
      for(const edge of [left,right]) {
        const underside=edge.map(([x,y])=>[x,y+11]).reverse();
        shape([...edge,...underside],colors[2],colors[3]);
      }
      for(const [a,b] of track) {
        shape([[a,230],[b,230],[b,241],[a,241]],colors[1],colors[3]);
      }
      shape([[start,230],...left,[start+55,204.7]],colors[0],colors[3]);
      shape([...right,[end+55,204.7],[end,230]],colors[0],colors[3]);
    } else {
      block(start,241,end-start,55,11,colors);
    }
    for(const [a,b] of track) {
      for(let x=a+8+scroll;x<b-6;x+=17) {
        shape([[x,228],[x+35,212]],null,'#64867577');
      }
      shape([[a+3,242],[b-3,242]],null,active ? '#a5f6b3' : '#79a992',1.8);
    }
  }

  function drawShutter(drop,edge,body) {
    const left=497, right=548, floor=233;
    const point=(x,y)=>[x,y-(x-left)*.46];
    for(const x of [left,right]) {
      shape([point(x,floor),point(x,111)],null,'#33463d',10);
      shape([point(x,floor),point(x,111)],null,'#84998c',2);
    }
    shape([point(left,111),point(right,111)],null,'#556b5d',9);
    const bottom=mix(121,floor,drop);
    shape([point(left+4,116),point(right-4,116),point(right-4,bottom),point(left+4,bottom)],body,edge,1.5);
    for(let y=126;y<bottom;y+=10) {
      shape([point(left+4,y),point(right-4,y)],null,edge,1.1);
    }
    shape([point(left+4,bottom),point(right-4,bottom)],null,edge,3);
  }

  function drawHeldCrates(time,positions,tone) {
    positions.forEach(([x,y],i)=>{
      const p=smooth((time-6340-i*250)/1650);
      if(p>0) crate(mix(349,x,p),y-Math.sin(p*Math.PI)*15,.76,tone);
    });
  }

  function drawTimeout(pulseTime) {
    const edge='#e6b975';
    drawShutter(.88,edge,'#504533');
    glow(486,201,98,'#f3bc6740');
    drawHeldCrates(8950,[[463,219],[427,228],[391,236]],'amber');
    // Send several light sweeps to the closed gate. The space beyond stays dark.
    const step = pulseTime === null ? .8 : pulseTime % 1500 / 1500;
    const pulse=mix(382,495,step);
    for(let n=0;n<3;n++) {
      const y=147+n*10;
      shape([[pulse-33-n*7,y],[pulse,y]],null,n===0 ? '#ffda9a' : '#be965e',2);
    }
    shape([[498,136],[498,196]],null,edge,3);
  }

  function drawNetworkBreak(gap) {
    const edge='#ffc78a';
    const left=mix(460,401,gap), right=mix(460,485,gap);
    glow(468,222,73,'#efad5338');
    for(const x of [left,right]) {
      shape(conveyorFracture(x,gap),null,edge,2);
    }
    shape([[left+5,239],[left+19,247],[left+26,259]],null,'#e0a969',2);
    shape([[right-2,238],[right-12,245],[right-15,253]],null,'#e0a969',2);
    ctx.save();
    for(let i=0;i<9;i++) {
      const opacity=i<4 ? .75 : (1-gap)*.75;
      if(opacity<=0) continue;
      const dx=(i*29)%44-22;
      const y=mix(226,224+(i*13)%31,gap);
      const x=mix(460,(left+right)/2+17+dx,gap);
      const size=2+i%3;
      ctx.globalAlpha=opacity;
      shape([[x,y],[x+size*2,y-2],[x+size,y+size],[x-2,y+size]],i%3 ? '#e9ad70' : '#f9de9d');
    }
    ctx.restore();
    const positions=[[452,225],[416,234],[380,239]].map(([x,y])=>[x-87*gap,y]);
    drawHeldCrates(8950,positions,'amber');
  }

  function drawRejected(impact) {
    const edge='#ff9d82';
    // A lowered barrier diverts arriving parcels to a foreground return chute.
    const tray=[[470,224],[513,228],[448,284],[376,282],[388,265]];
    shape(tray.map(([x,y])=>[x,y+6]),'#462b27','#b36b58',1.5);
    shape(tray,'#6b4136',edge,1.5);
    shape([[478,232],[493,233],[436,273],[399,273]],'#9a59454d','#c77861',1.5);
    for(let i=0;i<4;i++) {
      const x=469-i*13,y=235+i*10;
      shape([[x,y],[x-2,y+6],[x+7,y+4]],null,'#ffbd9e',1.8);
    }
    glow(495,191,112,'#ff795d43');
    drawShutter(smooth(impact*4),edge,'#633e36');
    for(let i=2;i>=0;i--) {
      const p=smooth((impact-i*.13)/.66);
      const x=mix(463-i*36,426-i*22,p);
      const y=mix(219+i*8,273+i*3,p)-Math.sin(p*Math.PI)*23;
      ctx.save();
      ctx.translate(x,y);
      ctx.rotate(Math.sin(p*Math.PI)*(.6-i*.16));
      crate(0,0,.83,'red');
      ctx.restore();
    }
    if(impact<.55) {
      const wave=smooth(impact/.55);
      ellipse(492,209,12+66*wave,5+25*wave,null,'rgba(255,158,126,'+(1-wave)+')',2);
    }
  }
  function drawCredentialBadge(x,y,power) {
    const edge=power>.35 ? '#b7f4be' : '#b89d83';
    glow(x,y,49,power>.35 ? '#81efa843' : '#c9a37424');
    ctx.save();
    ctx.translate(x,y);
    shape([[-28,-12],[21,-12],[28,-5],[28,17],[-28,17]],'#17241f','#748377',1.5);
    shape([[-28,-16],[21,-16],[28,-9],[28,13],[-28,13]],power>.35 ? '#476552' : '#413c32',edge,1.6);
    shape([[-23,-11],[-7,-11],[-7,8],[-23,8]],'#243b30',edge);
    ellipse(-15,-5,2.7,2.7,edge);
    shape([[-20,3],[-17,-1],[-13,-1],[-10,3]],edge);
    for(let i=0;i<3;i++) {
      const y=-8+i*6;
      const lit=power>i/3+.1;
      shape([[0,y],[18-i*3,y]],null,lit ? '#d0ffd0' : '#777264',2.2);
    }
    ctx.restore();
  }

  function drawExpiredSession(impact) {
    const power=1-smooth((impact-.06)/.32);
    const release=smooth((impact-.16)/.58);
    const lower=smooth((impact-.31)/.46);
    const pivot=[552,194];
    const angle=mix(-Math.PI*.44,-Math.PI*.99,lower);
    const tip=[pivot[0]+Math.cos(angle)*63,pivot[1]+Math.sin(angle)*63];
    drawHeldCrates(8950,[[450,228],[413,235],[376,239]],'amber');
    glow(517,201,88,'#ff995230');
    block(486,242,13,11,49,['#9a7d62','#3f3c32','#292d27','#a28b70']);
    block(545,215,14,11,27,['#927357','#4c4033','#2d2a25','#a28b70']);
    shape([pivot,tip],null,'#241c18',12);
    shape([pivot,tip],null,'#df9c63',8);
    for(let i=1;i<8;i++) {
      const x=mix(pivot[0],tip[0],i/8),y=mix(pivot[1],tip[1],i/8);
      shape([[x+Math.sin(angle)*3,y-Math.cos(angle)*3],[x-Math.sin(angle)*3,y+Math.cos(angle)*3]],null,'#795038',3);
    }
    ellipse(pivot[0],pivot[1],5,5,'#68523f','#edbd8e',1.6);
    const badgeX=mix(478,430,release),badgeY=mix(202,258,release);
    if(power>.1) {
      ctx.globalAlpha=power;
      shape([[badgeX+28,badgeY],[508,badgeY],[530,191]],null,'#b8ffb4',1.7);
      ctx.globalAlpha=1;
    }
    drawCredentialBadge(badgeX,badgeY,power);
  }

  function drawPermissionDenied(impact) {
    const lift=smooth((impact-.04)/.54);
    const bolt=smooth((impact-.43)/.41);
    const edge='#ffa48a';
    drawHeldCrates(8950,[[450,228],[413,235],[376,239]],'green');
    glow(522,213,101,'#fa7b573b');
    block(489,241,16,56,10,['#7b6052','#523c34','#3a302a','#d38d73']);
    // The credential remains live as the interlock lifts across the route.
    for(let i=0;i<6;i++) {
      const x=495+i*9;
      const y=232-i*4.1;
      const top=y-lift*33;
      if(lift>0) block(x, y, 5, 5, y-top, ['#ec9679','#8c4d42','#5b3732',edge]);
    }
    const railY=mix(232,201,lift);
    shape([[496,railY],[543,railY-21]],null,'#462722',10);
    shape([[496,railY],[543,railY-21]],null,edge,4);
    // Two opposed locking cylinders close around the raised rail.
    for(const [x,y,direction] of [[480,211,1],[557,188,-1]]) {
      block(x-7,y+6,13,9,12,['#896958','#563c34','#3b2e28','#d18b73']);
      shape([[x,y],[x+direction*bolt*20,y-direction*bolt*9]],null,'#ffe1bb',4);
      ellipse(x,y,3,3,'#8b5547',edge,1.4);
    }
    drawCredentialBadge(mix(448,429,bolt),258,1);
  }

  function drawFileFault() {
    drawFile(0,'ready',1);
    const edge = '#ffab88';
    glow(253,210,86,'#ff9c6448');
    shape([[229,228],[263,228],[282,218],[248,218]],'#693e30',edge,2);
    for (let x=238;x<=260;x+=7) shape([[x,222],[x-5,226]],null,edge,1.7);
    shape([[276,215],[223,215],[235,207]],null,edge,2.4);
  }

  function draw(elapsed, impact, inspection) {
    const {canvas} = ui;
    const dpr = Math.min(2,window.devicePixelRatio || 1);
    const width = Math.round(canvas.clientWidth*dpr);
    const height = Math.round(canvas.clientHeight*dpr);
    if (width <= 0 || height <= 0) return;
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;

    const phase = stages[stageName].step;
    const still = reducedMotion.matches;
    const busy = state === 'busy';
    const failed = state === 'error';
    const completed = state === 'done';
    const held = stageName === 'wait' && busy || failed && (faultKind === 'timeout' || faultKind === 'unconfirmed');
    const fileFault = faultKind === 'reader' || faultKind === 'file';
    const gap = faultKind === 'network' ? smooth(impact*2.1) : 0;
    const focus = smooth(impact*1.9);
    const zoom = 1+.16*focus;
    const paintScale = Math.min(width/W,height/H);
    let scale = paintScale*zoom;
    let x = (width-W*paintScale)/2-(fileFault ? -44 : 139)*focus*paintScale;
    let y = (height-H*paintScale)/2-32*focus*paintScale;
    const time = phase === 0 ? (still ? 0 : Math.min(1850,elapsed*1.2))
      : phase === 1 ? 2950+(still ? 1050 : Math.min(1850,elapsed))
      : 6250+(still ? 2100 : Math.min(2750,elapsed));
    const floor = ctx.createLinearGradient(0,0,0,height);
    floor.addColorStop(0,'#18241f');
    floor.addColorStop(.62,'#111b17');
    floor.addColorStop(1,'#121a17');
    ctx.setTransform(1,0,0,1,0,0);
    ctx.fillStyle=floor;
    ctx.fillRect(0,0,width,height);
    ctx.save();
    if (inspection>0) {
      const [left,right,top,bottom]=faults[faultKind].bounds;
      const bandTop=height/2+44*dpr;
      const bandBottom=height-12*dpr;
      const targetScale=Math.min((width-24*dpr)/(right-left),(bandBottom-bandTop)/(bottom-top));
      const targetX=(width-(left+right)*targetScale)/2;
      const targetY=(bandTop+bandBottom-(top+bottom)*targetScale)/2;
      const clipTop=bandTop*inspection;
      const clipBottom=mix(height,bandBottom,inspection);
      ctx.beginPath();
      ctx.rect(0,clipTop,width,clipBottom-clipTop);
      ctx.clip();
      scale=mix(scale,targetScale,inspection);
      x=mix(x,targetX,inspection);
      y=mix(y,targetY,inspection);
    }
    ctx.setTransform(scale,0,0,scale,x,y);
    ctx.save();
    ctx.globalAlpha=1-.62*inspection;
    glow(332,161,255,'#32674b47');
    for (let i=0;i<64;i++) {
      const px=(i*127+43)%700, py=29+(i*61)%195;
      const size=i%9===0 ? 1.5 : .7;
      ellipse(px,py,size,size,i%5===0 ? '#a7d3a17a' : '#74968a46');
    }
    for(let n=-7;n<=10;n++) shape([[338+n*23,145],[356+n*112,324]],null,'#405f4c66');
    for(let n=0;n<9;n++) {
      const lineY=152+n*n*2.42;
      shape([[0,lineY],[W,lineY]],null,'#405f4c66');
    }
    ctx.restore();
    block(47,275,547,100,17,['#293e32','#1e2e26','#1a2a22','#4c6857']);
    const scroll = busy && !held && !still ? (time/42)%17 : 0;
    drawConveyor(gap,scroll,busy && phase===2 && !held);
    for(let i=0;i<13;i++) {
      const lineX=83+i*34;
      shape([[lineX,264],[lineX+14,264]],null,'#608772',1.4);
    }
    ctx.save();
    ctx.globalAlpha=fileFault ? 1 : 1-inspection;
    block(65,250,111,35,12,['#42594c','#2b3e34','#23352d','#6c8f7e']);
    ellipse(129,230,33,7,'#77e7a128','#91e9ae');
    ellipse(129,230,20,4,null,'#7bb890');
    drawScanner(time,busy && phase===1);
    ctx.restore();

    if (busy && phase===0) drawFile(time,still ? 'ready' : 'busy');
    if (busy && phase===1) {
      drawPackets(time);
      const scan = still ? 1 : smooth((time-2950)/620);
      for(let line=0;line<5;line++) {
        const lineY=131+line*13;
        const length=mix(11,66-(line%3)*8,scan);
        shape([[297,lineY],[297+length,lineY],[301+length,lineY+6],[297,lineY+6]],'#7fe4a44d','#a3edb28f');
      }
      label('SKU',323,202,'#d3f6d4',12);
    }
    if (busy && phase===2 && !held) {
      drawPackets(time);
      drawHeldCrates(time,[[463,219],[427,227],[391,235]],'green');
    }

    ctx.save();
    ctx.globalAlpha=fileFault ? 1-inspection
      : faultKind === 'unavailable' ? 1-smooth(impact*1.8) : 1;
    drawRack(completed ? 1 : 0);
    ctx.restore();
    if (completed) drawFinish(elapsed);
    if (held) drawTimeout(busy && !still ? elapsed : null);
    if (failed) {
      switch(faultKind) {
        case 'network': drawNetworkBreak(gap); break;
        case 'server': drawRejected(impact); break;
        case 'file': drawFileFault(); break;
        case 'reader': drawReaderFault(impact); break;
        case 'session': drawExpiredSession(impact); break;
        case 'permission': drawPermissionDenied(impact); break;
        case 'unavailable': drawUnavailable(impact); break;
      }
    }
    ctx.restore();
  }

  document.addEventListener('visibilitychange', render);
  window.addEventListener('resize', render);
  reducedMotion.addEventListener('change', render);
  window.PlateKiotCatalogImport = Object.freeze({begin,stage,success,fail,close});
})();
