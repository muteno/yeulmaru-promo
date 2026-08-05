#!/usr/bin/env node
// 모달 닫기 X 전후 촬영 — 실코드(후) vs 구 글자 되돌린 상태(전)를 **같은 런에서** 잡는다.
//   전 = 실코드 버튼의 textContent만 구 `×`(U+00D7)로 돌린 상태 = 260805-11 출고본과 DOM 동일
//        (클래스·속성·자리 전부 같고 글자만 다른 게 그 커밋의 diff 전부라, 이게 정확한 재현이다).
//   후 = 손 안 댄 실코드(`✕` U+2715).
//   전건 같은 뷰포트·같은 목데이터 = 두 컷 차이는 글자뿐.
import { existsSync, readdirSync, readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { dirname, join, extname } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUTDIR = process.argv[2] || join(ROOT, 'docs', 'reports', '260805_모달X_정본글자_전후');
mkdirSync(OUTDIR, { recursive: true });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jfif': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const chrome = (() => { const b = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  for (const d of readdirSync(b)) if (d.startsWith('chromium-') && !d.includes('headless')) {
    const p = join(b, d, 'chrome-linux', 'chrome'); if (existsSync(p)) return p; } return null; })();
const MOCK = readFileSync(join(ROOT, 'tools', 'scratch', 'shot_promo_check_ba.mjs'), 'utf8')
  .split('const MOCK = `')[1].split('`;')[0];

const { chromium } = await import('playwright-core');
const browser = await chromium.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox', '--no-proxy-server'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 4 });
const errs = []; page.on('pageerror', e => errs.push(String(e).split('\n')[0]));
await page.route('**/*', route => { const u = new NodeURL(route.request().url());
  if (u.hostname === 'app.local') { let p = decodeURIComponent(u.pathname); if (p === '/') p = '/index.html';
    try { return route.fulfill({ status: 200, body: readFileSync(join(ROOT, p)), contentType: MIME[extname(p)] || 'application/octet-stream' }); }
    catch { return route.fulfill({ status: 404, body: 'nf' }); } }
  return route.abort(); });
await page.goto('https://app.local/index.html?qa=admin', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(2500);
await page.evaluate(MOCK);
await page.evaluate('openPromoCheck()');
await page.waitForTimeout(400);

// 버튼 원 + 여백 8px 타이트컷 · 머리줄(우상단 300×66) · 모달 전체컷
const clips = () => page.evaluate(`(()=>{const m=document.querySelector('#promo-check .modal').getBoundingClientRect();
  const x=document.querySelector('#promo-check .modal-x').getBoundingClientRect();
  return {tight:{x:Math.round(x.left)-8,y:Math.round(x.top)-8,width:48,height:48},
          hdr:{x:Math.round(m.right)-300,y:Math.round(m.top),width:300,height:66},
          full:{x:Math.floor(m.left)-12,y:Math.floor(m.top)-12,width:Math.ceil(m.width)+24,height:Math.ceil(m.height)+24}};})()`);
const measure = () => page.evaluate(`(()=>{const b=document.querySelector('#promo-check .modal-x');
  const r=document.createRange(); r.selectNodeContents(b); const g=r.getBoundingClientRect();
  const t=b.textContent||''; return {glyph:t, code:t.split('').map(c=>'U+'+c.charCodeAt(0).toString(16).toUpperCase().padStart(4,'0')).join(' '),
    inkW:+g.width.toFixed(2), inkH:+g.height.toFixed(2), aria:b.getAttribute('aria-label')};})()`);

const out = {};
for (const [tag, glyph] of [['before', '×'], ['after', null]]) {
  if (glyph) await page.evaluate(`(()=>{const b=document.querySelector('#promo-check .modal-x');
    b.textContent=${JSON.stringify(glyph)}; b.removeAttribute('aria-label');})()`);
  else await page.evaluate('closePromoCheck();openPromoCheck()');   // 실코드 그대로 재렌더
  await page.waitForTimeout(250);
  const c = await clips();
  out[tag] = await measure();
  await page.screenshot({ path: join(OUTDIR, `x-tight-${tag}.png`), clip: c.tight });
  await page.screenshot({ path: join(OUTDIR, `x-hdr-${tag}.png`), clip: c.hdr });
  await page.screenshot({ path: join(OUTDIR, `modal-${tag}.png`), clip: c.full });
}
out.pageerror = errs.slice(0, 4);
console.log(JSON.stringify(out, null, 1));
await browser.close();
