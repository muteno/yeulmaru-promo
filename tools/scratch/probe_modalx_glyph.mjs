#!/usr/bin/env node
// 모달 X 글리프 대조 — 「AI 홍보·점검」 X vs 정본 X(다른 모달 전부).
//   shot_promo_check_ba.mjs 하네스 골격 계승(가상호스트 서빙 + ?qa=admin + 같은 목데이터).
//   산출 = ① 점검 모달 머리줄 확대컷 ② 정본 모달(배치 위저드) 머리줄 확대컷 ③ 글리프 실측 JSON.
// 실API·실데이터 미접촉.
import { existsSync, readdirSync, readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { dirname, join, extname } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TAG = process.argv[2] || 'before';
const OUTDIR = process.argv[3] || join(ROOT, '..', 'shots');
mkdirSync(OUTDIR, { recursive: true });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jfif': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };

function findChromium() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (!existsSync(base)) return null;
  for (const d of readdirSync(base)) {
    if (d.startsWith('chromium-') && !d.includes('headless')) {
      const p = join(base, d, 'chrome-linux', 'chrome');
      if (existsSync(p)) return p;
    }
  }
  return null;
}

// 운영자 스샷 재현 목데이터 — shot_promo_check_ba.mjs와 동일본(오늘=2026-08-05 기준)
const MOCK = readFileSync(join(ROOT, 'tools', 'scratch', 'shot_promo_check_ba.mjs'), 'utf8')
  .split('const MOCK = `')[1].split('`;')[0];

// 글리프 실측 — 버튼 원(32px) 안에서 글자가 실제로 차지하는 상자를 Range로 잰다.
const GLYPH = `(sel)=>{
  var b=document.querySelector(sel); if(!b) return {miss:sel};
  var bb=b.getBoundingClientRect(), cs=getComputedStyle(b);
  var r=document.createRange(); r.selectNodeContents(b);
  var g=r.getBoundingClientRect();
  var t=(b.textContent||'');
  return {
    glyph:t, code:t.split('').map(function(c){return 'U+'+c.charCodeAt(0).toString(16).toUpperCase().padStart(4,'0');}).join(' '),
    btn:{w:+bb.width.toFixed(1), h:+bb.height.toFixed(1)},
    ink:{w:+g.width.toFixed(2), h:+g.height.toFixed(2)},
    // 원 중심 대비 글자 중심 어긋남(+ = 아래/오른쪽)
    offX:+((g.left+g.width/2)-(bb.left+bb.width/2)).toFixed(2),
    offY:+((g.top+g.height/2)-(bb.top+bb.height/2)).toFixed(2),
    fs:cs.fontSize, color:cs.color, bg:cs.backgroundColor, aria:b.getAttribute('aria-label'), title:b.getAttribute('title')
  };
}`;

async function main() {
  const { chromium } = await import('playwright-core');
  const browser = await chromium.launch({ executablePath: findChromium(), headless: true, args: ['--no-sandbox', '--no-proxy-server'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 3 });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).split('\n')[0]));
  await page.route('**/*', route => {
    const u = new NodeURL(route.request().url());
    if (u.hostname === 'app.local') {
      let p = decodeURIComponent(u.pathname); if (p === '/') p = '/index.html';
      try { return route.fulfill({ status: 200, body: readFileSync(join(ROOT, p)), contentType: MIME[extname(p)] || 'application/octet-stream' }); }
      catch { return route.fulfill({ status: 404, body: 'nf' }); }
    }
    return route.abort();
  });
  await page.goto('https://app.local/index.html?qa=admin', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2500);
  await page.evaluate(MOCK);
  await page.evaluate(`openPromoCheck()`);
  await page.waitForTimeout(500);

  const glyphOf = sel => page.evaluate(`(${GLYPH})(${JSON.stringify(sel)})`);
  const out = { tag: TAG };
  out.promoCheck = await glyphOf('#promo-check .modal-x');

  // 머리줄(X + 제목) 확대컷 — 모달 우상단 260×64
  const hdr = await page.evaluate(`(()=>{const b=document.querySelector('#promo-check .modal').getBoundingClientRect();
    return {x:Math.round(b.right-260),y:Math.round(b.top),width:260,height:64};})()`);
  await page.screenshot({ path: join(OUTDIR, `x-promocheck-${TAG}.png`), clip: hdr });

  // 정본 대조군 — 같은 화면에 표준 .modal 하나를 띄워 같은 자리를 찍는다(코드 무수정 · 정본 문자 ✕)
  await page.evaluate(`document.body.insertAdjacentHTML('beforeend',
    '<div id="__canon" class="modal-bg show" style="z-index:99998"><div class="modal" style="width:min(760px,94vw)">'
    +'<button class="modal-x" title="닫기" aria-label="닫기">\\u2715</button>'
    +'<div style="font-size:17px;font-weight:800;padding:2px 0 10px">정본 모달(대조군)</div>'
    +'<div style="height:120px"></div></div></div>')`);
  await page.waitForTimeout(200);
  out.canon = await glyphOf('#__canon .modal-x');
  const hdr2 = await page.evaluate(`(()=>{const b=document.querySelector('#__canon .modal').getBoundingClientRect();
    return {x:Math.round(b.right-260),y:Math.round(b.top),width:260,height:64};})()`);
  await page.screenshot({ path: join(OUTDIR, `x-canon.png`), clip: hdr2 });
  await page.evaluate(`document.getElementById('__canon').remove()`);

  // 모달 전체컷(운영자 스샷 자리) — 바깥 12px 여백 포함
  const box = await page.evaluate(`(()=>{const b=document.querySelector('#promo-check .modal').getBoundingClientRect();
    return {x:Math.floor(b.left)-12,y:Math.floor(b.top)-12,width:Math.ceil(b.width)+24,height:Math.ceil(b.height)+24};})()`);
  await page.screenshot({ path: join(OUTDIR, `promocheck-full-${TAG}.png`), clip: box });

  out.pageerror = errs.slice(0, 4);
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
}
main();
