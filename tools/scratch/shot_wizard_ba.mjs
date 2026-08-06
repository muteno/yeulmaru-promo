#!/usr/bin/env node
// [260806] 전/후 실측 캡처 — 캘린더 우클릭 「새 콘텐츠 등록」.
//   before = git HEAD:index.html(고치기 전) · after = 작업트리(고친 뒤). 같은 하네스·같은 셀·같은 목데이터.
//   산출 = docs/reports/260806_새콘텐츠등록_전.png / _후.png / _전후.html (리포 관례).
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'docs/reports');
const BASE = '260806_새콘텐츠등록';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jfif': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const HEAD_HTML = execSync('git show HEAD:index.html', { cwd: ROOT, maxBuffer: 1 << 28 });

function findChromium() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  for (const d of readdirSync(base)) if (d.startsWith('chromium-') && !d.includes('headless')) {
    const p = join(base, d, 'chrome-linux', 'chrome'); if (existsSync(p)) return p;
  }
  return null;
}

// 목데이터 = smoke_wizard_open.mjs와 같은 축(허구값·실 시트 미접촉)
const FEED = `(()=>{
  const T=new Date(); const iso=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  const off=n=>{const d=new Date(T);d.setDate(d.getDate()+n);return iso(d);};
  PERFS=[{'프로그램ID':'SW1','풀네임':'2026 정기연주회 <가을의 문턱>','줄임말':'정기연주회','콘텐츠구분':'공연','장소':'대극장','구분':'클래식',
          '시작일':off(30),'종료일':off(31),'판매시작일':off(-20),'판매종료일':off(29),'홍보시작일':off(-20),'홍보노출':'Y'},
         {'프로그램ID':'SW2','풀네임':'GS칼텍스 예울마루 기획전시 <숨>','줄임말':'기획전시','콘텐츠구분':'전시','장소':'7층 전시실',
          '시작일':off(-10),'종료일':off(60),'판매시작일':off(-30),'판매종료일':off(60),'홍보시작일':off(-30),'홍보노출':'Y'}].map(programToPerf);
  try{updatePerfOpen();}catch(e){}
  _perfReady=true;
  PLATFORMS=[{'플랫폼1':'카카오톡','플랫폼2':'-','플랫폼3':'카카오톡'},{'플랫폼1':'인스타그램','플랫폼2':'-','플랫폼3':'인스타그램'}];
  CONTENT_TYPES=['공연','전시','예술교육','대관','기타']; CONTENT_FORMATS=['이미지','영상','텍스트'];
  MANAGERS=[{'담당자':'스모크','담당부서':'예술사업팀','홍보여부':'Y','공연여부':'Y','전시여부':'Y','예술교육여부':'Y','대관여부':'Y','계정여부':'Y'}];
  try{ if(typeof render==='function')render(); }catch(e){}
})()`;

async function run(chromium, label, useHead) {
  const browser = await chromium.launch({ executablePath: findChromium(), headless: true, args: ['--no-sandbox', '--no-proxy-server'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).split('\n')[0]));
  await page.route('**/*', route => {
    const u = new NodeURL(route.request().url());
    if (u.hostname === 'app.local') {
      let p = decodeURIComponent(u.pathname); if (p === '/') p = '/index.html';
      if (p === '/index.html' && useHead) return route.fulfill({ status: 200, body: HEAD_HTML, contentType: MIME['.html'] });
      try { return route.fulfill({ status: 200, body: readFileSync(join(ROOT, p)), contentType: MIME[extname(p)] || 'application/octet-stream' }); }
      catch { return route.fulfill({ status: 404, body: 'nf' }); }
    }
    return route.abort();
  });
  await page.goto('https://app.local/index.html?qa=admin#cal', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('.cell', { timeout: 20000 });
  await page.evaluate(FEED);
  await page.waitForTimeout(1000);

  const c = await page.evaluate(`(()=>{const cs=[...document.querySelectorAll('.cell:not(.nm)')];
    const free=x=>!x.querySelector('.ev'); const e=cs.find(x=>!x.classList.contains('past')&&free(x))||cs.find(free)||cs[10];
    const r=e.getBoundingClientRect(); return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+18)};})()`);
  await page.mouse.click(c.x, c.y, { button: 'right' });
  await page.waitForTimeout(400);
  await page.evaluate(`(()=>{const m=document.getElementById('cell-context-menu');
    const it=[...m.querySelectorAll('.ccm-item')].find(e=>e.textContent.indexOf('새 콘텐츠 등록')>=0); it.click();})()`);
  await page.waitForTimeout(1000);
  await page.screenshot({ path: join(OUT, `${BASE}_${label}.png`) });
  const st = await page.evaluate(`(()=>{const w=document.getElementById('promo-wizard');
    return {열림:w.classList.contains('show'),
            머리줄:((document.getElementById('pw-mtitle')||document.querySelector('#promo-wizard .mhead span')||{}).textContent||'').trim(),
            본문글자수:((document.getElementById('pw-body')||{}).innerText||'').trim().length};})()`);
  await browser.close();
  return { st, errs };
}

const pw = await import('playwright-core');
const chromium = pw.chromium || pw.default.chromium;
const before = await run(chromium, '전', true);
const after = await run(chromium, '후', false);
console.log('전(고치기 전)', JSON.stringify(before, null, 1));
console.log('후(고친 뒤) ', JSON.stringify(after, null, 1));

const row = (t, r) => `<tr><th>${t}</th><td>${r.st.열림 ? '✅ 열림' : '❌ 안 열림'}</td><td>${r.st.머리줄 || '<span class="x">(없음)</span>'}</td><td>${r.st.본문글자수}</td><td>${r.errs.length ? '<span class="x">' + r.errs.join('<br>') + '</span>' : '0'}</td></tr>`;
writeFileSync(join(OUT, `${BASE}_전후.html`), `<!doctype html><meta charset="utf-8"><title>새 콘텐츠 등록 — 전/후 실측</title>
<style>body{font-family:'Malgun Gothic',sans-serif;background:#FDF6F3;color:#1A1A2E;margin:0;padding:28px}
h1{font-size:19px;margin:0 0 4px}p{font-size:13px;color:#666;line-height:1.7;margin:0 0 18px}
table{border-collapse:collapse;font-size:13px;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,.06);margin-bottom:22px}
th,td{padding:10px 14px;border-bottom:1px solid rgba(0,0,0,.07);text-align:left}thead th{background:#4A4DE7;color:#fff}
.x{color:#E24B4A;font-weight:700}.g{display:grid;grid-template-columns:1fr 1fr;gap:16px}
figure{margin:0}figcaption{font-size:12px;font-weight:700;margin-bottom:6px}img{width:100%;border-radius:12px;border:1px solid rgba(0,0,0,.09)}</style>
<h1>캘린더 ▸ 새 콘텐츠 등록 — 전/후 실측 (260806)</h1>
<p>같은 하네스·같은 셀·같은 목데이터로 <b>고치기 전(git HEAD)</b>과 <b>고친 뒤(작업트리)</b>를 각각 부팅해,
캘린더 빈 셀 우클릭 → 「새 콘텐츠 등록」을 실제로 클릭한 직후 화면.</p>
<table><thead><tr><th></th><th>위저드</th><th>머리줄 제목</th><th>Step 본문 글자수</th><th>JS 예외</th></tr></thead>
<tbody>${row('전 (고치기 전)', before)}${row('후 (고친 뒤)', after)}</tbody></table>
<div class="g"><figure><figcaption>전 — 클릭해도 아무 일도 안 일어남</figcaption><img src="${BASE}_전.png"></figure>
<figure><figcaption>후 — 위저드 Step 1이 열림</figcaption><img src="${BASE}_후.png"></figure></div>`);
console.log('산출 →', join(OUT, `${BASE}_전후.html`));
