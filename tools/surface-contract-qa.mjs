import assert from 'node:assert/strict';
// Acceptance is based on semantic controls/surfaces in the rendered product,
// independent of which selectors implement the theme.
export async function checkSurfaces(page,label,scope='body'){
 const result=await page.locator(scope).evaluate(host=>{
  const nodes=[host,...host.querySelectorAll('*')],visible=el=>{
   const r=el.getBoundingClientRect(),s=getComputedStyle(el);
   return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'&&!el.closest('[hidden]');
  };
  const candidates=nodes.filter(el=>el.namespaceURI==='http://www.w3.org/1999/xhtml'&&visible(el)&&
   !el.matches('input[type="checkbox"],input[type="radio"],input[type="range"],input[type="color"],i')&&
   !el.closest('svg,[class*="-art"],[class*="spinner"],[class*="loader"],[class*="skeleton"],.timeline,.journey-art')&&(
   el.matches('button,.btn,textarea,select,fieldset,dialog,[role="button"],[role="tab"]')||
   el.matches('input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"])')||
   el.matches('div,section,article,header,footer,aside,nav,table,thead,tbody,tr,th,td,span,label')
  ));
  const edges=candidates.flatMap(el=>{
   const s=getComputedStyle(el),borders=['Top','Right','Bottom','Left'].filter(side=>parseFloat(s['border'+side+'Width'])>0&&s['border'+side+'Style']!=='none'&&!/rgba\([^)]*, 0\)/.test(s['border'+side+'Color']));
   const outline=parseFloat(s.outlineWidth)>0&&s.outlineStyle!=='none'&&!s.outlineColor.endsWith(', 0)')&&!el.matches(':focus-visible')&&!el.matches(':focus-within');
   const element=el.tagName.toLowerCase()+(el.id?'#'+el.id:'.'+[...el.classList].join('.'));
   const frames=['::before','::after'].flatMap(pseudo=>{
    const p=getComputedStyle(el,pseudo);if(['none','normal'].includes(p.content)||p.display==='none'||p.visibility==='hidden'||Number(p.opacity)===0||/spin|load/i.test(p.animationName))return [];
    const edges=['Top','Right','Bottom','Left'].filter(side=>parseFloat(p['border'+side+'Width'])>0&&p['border'+side+'Style']!=='none'&&!p['border'+side+'Color'].endsWith(', 0)'));
    return edges.length>=3||p.boxShadow.includes('inset')?[{element:element+pseudo,borders:edges,shadow:p.boxShadow}]:[];
   });
   return [...(borders.length||outline||/inset/.test(s.boxShadow)?[{element,parent:el.parentElement?.className,borders,outline,shadow:s.boxShadow}]:[]),...frames];
  });
  return {count:candidates.length,edges,overflow:document.documentElement.scrollWidth>innerWidth+1};
 });
 assert.ok(result.count>0,label+': real controls/surfaces present');
 assert.deepEqual(result.edges,[],label+': no persistent border/inset boundary');
 assert.equal(result.overflow,false,label+': no horizontal overflow');return result.count;
}
