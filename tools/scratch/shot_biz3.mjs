#!/usr/bin/env node
// [260803] 3면(사업 결과 비교) 전·후 캡처 + 기하 실측 — smoke_layout.mjs 하네스 100% 계승(서빙·목데이터·QA 진입로 동일).
// 실행: node tools/scratch/shot_biz3.mjs <서빙할 index.html 경로> <출력 png> [폭] [높이]
//   전 = git show HEAD:index.html 로 뽑은 파일 · 후 = 작업트리 index.html — 같은 목데이터·같은 뷰포트라 1:1 비교가 성립한다.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { INIT_SCRIPT, FEED_SCRIPT } from '../qa_mock_ops.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SERVE = process.argv[2] || join(ROOT, 'index.html');
const OUT = process.argv[3] || join(ROOT, 'shot.png');
const W = parseInt(process.argv[4] || '1920', 10), H = parseInt(process.argv[5] || '1080', 10);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jfif': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };

function findChromium() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (!existsSync(base)) return null;
  try {
    for (const d of readdirSync(base)) {
      if (d.startsWith('chromium-') && !d.includes('headless')) {
        const p = join(base, d, 'chrome-linux', 'chrome');
        if (existsSync(p)) return p;
      }
    }
  } catch { /* ignore */ }
  return null;
}

// 유리박스 상·하단 / 마지막 흰 도형 하단 / 표 내부 스크롤 여부를 잰다(계약 실측).
const MEASURE = `(()=>{
  const inner=b=>{const c=getComputedStyle(b);return b.getBoundingClientRect().bottom-(parseFloat(c.borderBottomWidth)||0)-(parseFloat(c.paddingBottom)||0);};
  const col=sel=>{
    const box=document.querySelector(sel+' [data-bizmbox]');
    if(!box||box.offsetParent===null)return null;
    const r=box.getBoundingClientRect();
    const shapes=[].slice.call(box.querySelectorAll('.bizm-card, .bizm-strip, [data-bizmfill]')).filter(e=>e.offsetParent!==null&&e.getBoundingClientRect().height>1);
    const last=shapes.length?shapes.reduce((a,b)=>b.getBoundingClientRect().bottom>a.getBoundingClientRect().bottom?b:a):null;
    return {top:+r.top.toFixed(1),bottom:+r.bottom.toFixed(1),innerBottom:+inner(box).toFixed(1),
            whiteBottom:last?+last.getBoundingClientRect().bottom.toFixed(1):null};
  };
  const cap=document.querySelector('[data-bizmcap]')||document.querySelector('#rail-yrm [data-bizmfill]');
  const sc=cap?(cap.querySelector('.ry-grp-bd')||cap):null;
  return {L:col('#biz-main'),R:col('#rail-yrm'),
    docScroll:+(document.documentElement.scrollHeight-window.innerHeight).toFixed(1),
    table:cap?{h:+cap.getBoundingClientRect().height.toFixed(1),
               scrollH:sc?sc.scrollHeight:null,clientH:sc?sc.clientHeight:null,
               scrolls:sc?(sc.scrollHeight-sc.clientHeight>2):null}:null};
})()`;

async function main() {
  let chromium;
  try { ({ chromium } = await import('playwright-core')); }
  catch { console.log('SKIP — playwright-core 미설치'); return 0; }
  const exe = findChromium();
  if (!exe) { console.log('SKIP — chromium 미탐지'); return 0; }

  const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--no-sandbox', '--no-proxy-server'] });
  const pageErrors = [];
  try {
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    page.on('pageerror', e => pageErrors.push(String(e).split('\n')[0]));
    await page.route('**/*', route => {
      const u = new NodeURL(route.request().url());
      if (u.hostname === 'app.local') {
        let p = decodeURIComponent(u.pathname); if (p === '/') p = '/index.html';
        const file = (p === '/index.html') ? SERVE : join(ROOT, p);
        try { return route.fulfill({ status: 200, body: readFileSync(file), contentType: MIME[extname(p)] || 'application/octet-stream' }); }
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
    await page.evaluate('_bizmTo(3)');
    await page.waitForTimeout(2600);

    // stress = 상세 표 행을 40배로 부풀려 「전체 선택 시 넘침」 상황을 재현한다(운영자 260803 요구: 목록 안에서 스크롤).
    if (process.argv[6] === 'stress') {
      await page.evaluate(`(()=>{const tb=document.querySelector('[data-bizmcap] tbody')||document.querySelector('#rail-yrm [data-bizmfill] tbody');if(!tb)return;
        const rows=[].slice.call(tb.children);for(let i=0;i<40;i++)rows.forEach(r=>tb.appendChild(r.cloneNode(true)));
        _srailAlignTop();})()`);
      await page.waitForTimeout(1200);
    }
    const m = await page.evaluate(MEASURE);
    await page.screenshot({ path: OUT });
    const regressions = pageErrors.filter(e => /ReferenceError|SyntaxError|is not defined|is not a function/.test(e));
    console.log(JSON.stringify({ shot: OUT, ...m, jsErrors: regressions }, null, 1));
    return 0;
  } finally { await browser.close(); }
}
main().then(c => process.exit(c)).catch(e => { console.error('ERR', e.message); process.exit(0); });
