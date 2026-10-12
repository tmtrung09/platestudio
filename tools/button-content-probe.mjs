import assert from 'node:assert/strict';

// Measure rendered label/icon content, not just CSS alignment declarations.
export async function assertButtonContentCentered(button, state='normal') {
  const geometry=await button.evaluate(el=>{
    const rect=el.getBoundingClientRect(),boxes=[];
    const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);
    while(walker.nextNode()){
      const node=walker.currentNode,text=node.textContent,start=text.search(/\S/);
      if(start<0)continue;
      const range=document.createRange();range.setStart(node,start);range.setEnd(node,text.trimEnd().length);
      boxes.push(...[...range.getClientRects()].filter(box=>box.width>0&&box.height>0));
    }
    el.querySelectorAll('svg').forEach(icon=>boxes.push(icon.getBoundingClientRect()));
    const content={left:Math.min(...boxes.map(b=>b.left)),right:Math.max(...boxes.map(b=>b.right)),top:Math.min(...boxes.map(b=>b.top)),bottom:Math.max(...boxes.map(b=>b.bottom))};
    return {label:el.textContent.trim(),dx:Math.abs((content.left+content.right-rect.left-rect.right)/2),dy:Math.abs((content.top+content.bottom-rect.top-rect.bottom)/2),visible:boxes.length>0,overflow:el.scrollWidth>el.clientWidth+1};
  });
  assert.ok(geometry.visible&&geometry.dx<=1&&geometry.dy<=2&&!geometry.overflow,`${state}: button content centered and unclipped: ${JSON.stringify(geometry)}`);
}
