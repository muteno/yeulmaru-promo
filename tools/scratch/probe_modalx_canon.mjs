// 정본 실측 — 일반(비-flex) .modal 안에서 .modal-x가 앉는 자리(창 모서리 기준 offset)
//
// ⚠ [260805-13] 이 파일이 사고 원인이었다. 구판은 대조군 버튼을 `&times;`로 **손으로 다시 타이핑**했고,
//   그 글자(`×` U+00D7)가 그대로 실코드로 새어들어 앱의 나머지 52곳(`✕` U+2715)과 어긋났다.
//   자리는 정확히 쟀는데(21/29 맞음) 글자가 틀린 채로 「정본 확인」이 나간 것 —
//   **대조군을 다시 타이핑하는 순간 그건 더 이상 대조군이 아니다.**
//   그래서 지금은 index.html의 **실제 닫기 버튼 마크업을 그대로 뽑아** 대조군으로 쓴다(재타이핑 0).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { chromium } from 'playwright-core';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jfif':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2'};
const chrome=(()=>{const b=process.env.PLAYWRIGHT_BROWSERS_PATH||'/opt/pw-browsers';for(const d of readdirSync(b))if(d.startsWith('chromium-')&&!d.includes('headless')){const p=join(b,d,'chrome-linux','chrome');if(existsSync(p))return p;}return null;})();
// 대조군 = 실코드에서 뽑는다. onclick만 떼고(닫을 모달이 없으므로) 나머지 속성·글자는 실코드 그대로.
const CANON_BTN=(()=>{
  const m=readFileSync(join(ROOT,'index.html'),'utf8')
    .match(/<button[^>]*class="modal-x"[^>]*aria-label="닫기"[^>]*>[^<]*<\/button>/);
  if(!m) throw new Error('index.html에서 정본 닫기 버튼을 못 찾음 — 셀렉터 갱신 필요');
  return m[0].replace(/\sonclick="[^"]*"/,'');
})();
const browser=await chromium.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--no-proxy-server']});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
await page.route('**/*',route=>{const u=new NodeURL(route.request().url());
  if(u.hostname==='app.local'){let p=decodeURIComponent(u.pathname);if(p==='/')p='/index.html';
    try{return route.fulfill({status:200,body:readFileSync(join(ROOT,p)),contentType:MIME[extname(p)]||'application/octet-stream'});}catch{return route.fulfill({status:404,body:'nf'});}}
  return route.abort();});
await page.goto('https://app.local/index.html?qa=admin',{waitUntil:'domcontentloaded',timeout:30000});
await page.waitForTimeout(2000);
const r = await page.evaluate((btn)=>{
  document.body.insertAdjacentHTML('beforeend',
   '<div id="__t" class="modal-bg show"><div class="modal" style="width:min(760px,94vw)">'
   + btn
   +'<div style="font-size:17px;font-weight:800;padding:2px 0 10px">AI 홍보 · 점검</div>'
   +'<div style="height:200px">body</div></div></div>');
  const m=document.querySelector('#__t .modal').getBoundingClientRect();
  const xe=document.querySelector('#__t .modal-x');
  const x=xe.getBoundingClientRect();
  const t=document.querySelector('#__t .modal>div:nth-child(2)').getBoundingClientRect();
  const g=xe.textContent||'';
  const o={fromRight:+(m.right-x.right).toFixed(2), fromTop:+(x.top-m.top).toFixed(2),
           w:+x.width.toFixed(1), h:+x.height.toFixed(1),
           titleTopFromModal:+(t.top-m.top).toFixed(2),
           glyph:g, code:g.split('').map(c=>'U+'+c.charCodeAt(0).toString(16).toUpperCase().padStart(4,'0')).join(' ')};
  document.getElementById('__t').remove();
  return o;
}, CANON_BTN);
console.log('대조군(실코드에서 추출):', CANON_BTN);
console.log('정본 .modal-x 자리:', JSON.stringify(r));
await browser.close();
