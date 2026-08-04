#!/usr/bin/env node
// 4면(고객 분석) 스샷 + DOM 실측 — smoke_layout.mjs의 서빙/목데이터 배선 그대로 재사용(실API·PII 미접촉).
// 사용: node shot4.mjs <출력png> [폭 높이]
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { INIT_SCRIPT, FEED_SCRIPT } from '/home/user/yeulmaru-promo/tools/qa_mock_ops.mjs';

const ROOT = '/home/user/yeulmaru-promo';
const OUT = process.argv[2] || 'shot.png';
const W = parseInt(process.argv[3] || '1920', 10), H = parseInt(process.argv[4] || '1080', 10);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jfif': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };

function findChromium() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  for (const d of readdirSync(base)) {
    if (d.startsWith('chromium-') && !d.includes('headless')) {
      const p = join(base, d, 'chrome-linux', 'chrome');
      if (existsSync(p)) return p;
    }
  }
  return null;
}

const MEASURE = `(()=>{
  const R=e=>{if(!e)return null;const b=e.getBoundingClientRect();return {t:+b.top.toFixed(1),b:+b.bottom.toFixed(1),l:+b.left.toFixed(1),r:+b.right.toFixed(1),w:+b.width.toFixed(1),h:+b.height.toFixed(1)};};
  const box=document.querySelector('#biz-main [data-bizmbox]');
  const inner=box?(()=>{const c=getComputedStyle(box);const b=box.getBoundingClientRect();return +(b.bottom-(parseFloat(c.borderBottomWidth)||0)-(parseFloat(c.paddingBottom)||0)).toFixed(1);})():null;
  const inl=document.getElementById('mem-ov-inline');
  const cards=inl?[...inl.querySelectorAll(':scope > div')]:[];
  const svg=inl?inl.querySelector('svg[role=img]'):null;
  const ai=document.getElementById('mem-ai-log-i');
  // 흰 도형 최하단(스모크와 같은 판정)
  const lightBg=e=>{const m=/^rgba?\\(([^)]+)\\)/.exec(getComputedStyle(e).backgroundColor);if(!m)return false;const p=m[1].split(',').map(parseFloat),a=p.length>3?p[3]:1;return a>=0.5&&p[0]>=240&&p[1]>=240&&p[2]>=240;};
  const clipBottom=el=>{let b=el.getBoundingClientRect().bottom,n=el.parentElement;while(n){const c=getComputedStyle(n);if(/auto|scroll|hidden/.test(c.overflowY)){const rr=n.getBoundingClientRect();b=Math.min(b,rr.bottom-(parseFloat(c.borderBottomWidth)||0));}if(n===box)break;n=n.parentElement;}return b;};
  let white=null,whiteEl=null;
  if(box)box.querySelectorAll('*').forEach(e=>{if(e.offsetParent===null)return;const rr=e.getBoundingClientRect();if(rr.height<2||rr.width<20||!lightBg(e))return;const b=clipBottom(e);if(white===null||b>white){white=b;whiteEl=e.getAttribute('id')||e.className||e.tagName;}});
  return {page:(window._bizmState||{}).page,wide:(typeof _bizBookWide==='function')?_bizBookWide():null,
    box:R(box),innerBottom:inner,white:white===null?null:+white.toFixed(1),whiteEl:String(whiteEl).slice(0,60),
    inline:R(inl),row:R(inl?inl.querySelector('div[style*="flex-wrap:wrap"]'):null),
    mapCard:cards.length?null:null,
    svg:R(svg),aiLog:R(ai),
    kids:cards.map(c=>({cls:(c.className||'').slice(0,20),...R(c)})),
    row2:(()=>{const r=inl?inl.children[inl.children.length-1]:null;if(!r)return null;const o={self:R(r),sh:r.scrollHeight,ch:r.clientHeight};o.cols=[...r.children].map(c=>({...R(c),sh:c.scrollHeight,ch:c.clientHeight,fb:getComputedStyle(c).flexBasis,mh:getComputedStyle(c).minHeight}));o.sub=[...r.children].map(c=>[...c.children].map(g=>({...R(g),sh:g.scrollHeight,ch:g.clientHeight})));return o;})(),
    boxScroll:box?+(box.scrollHeight-box.clientHeight).toFixed(1):null};
})()`;

const browser = await (await import('playwright-core')).chromium.launch({ executablePath: findChromium(), headless: true, args: ['--no-sandbox', '--no-proxy-server'] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
const errs = [];
page.on('pageerror', e => errs.push(String(e).split('\n')[0]));
await page.route('**/*', route => {
  const u = new NodeURL(route.request().url());
  if (u.hostname === 'app.local') {
    let p = decodeURIComponent(u.pathname); if (p === '/') p = '/index.html';
    try { return route.fulfill({ status: 200, body: readFileSync(join(ROOT, p)), contentType: MIME[extname(p)] || 'application/octet-stream' }); }
    catch { return route.fulfill({ status: 404, body: 'nf' }); }
  }
  if (u.hostname === 'cdn.plot.ly') {
    const cached = join(ROOT, 'tools', 'vendor', 'plotly-basic-2.27.0.min.js');
    if (existsSync(cached)) return route.fulfill({ status: 200, body: readFileSync(cached), contentType: 'text/javascript' });
  }
  return route.abort();
});
await page.addInitScript(INIT_SCRIPT);
await page.goto('https://app.local/index.html?qa=admin', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForSelector('#biz-main [data-bizmbox]', { timeout: 20000 });
await page.waitForTimeout(1800);
await page.evaluate(FEED_SCRIPT);
await page.waitForTimeout(900);
await page.evaluate('_bizmTo(4)');
await page.waitForTimeout(2200);
if(process.argv[5]==='modal'){ await page.evaluate('openMemberOverview()'); await page.waitForTimeout(1500); }
const m = await page.evaluate(MEASURE);
console.log(JSON.stringify(m, null, 1));
if (errs.length) console.log('PAGE ERRORS:', errs.slice(0, 5));
const box = await page.$(process.argv[5]==='modal' ? '#member-ov .modal' : '#biz-main [data-bizmbox]');
try{ await box.screenshot({ path: OUT }); }catch(e){ console.log('box shot skip:',String(e).split('\n')[0]); }
await page.screenshot({ path: OUT.replace(/\.png$/, '_full.png') });
await browser.close();
