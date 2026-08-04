#!/usr/bin/env node
// 전/후 보고용 실측 캡처.
//   ① 1280×760(최대화 아님) 1면·3면 — 하단 슬라이더 바 위치(비율 고정 전/후)
//   ② 1920×1080 면 전환 슬로모션 스트립 — 전환 결(번쩍 vs 디졸브). 지속시간만 20배로 늘려 같은 이징 곡선을
//      실제 렌더로 찍는다(스샷 1장 ≈ 0.3초 = 실시간 15ms 상당 → 정지 프레임을 놓치지 않는다).
// 사용: node shots.mjs <출력디렉터리>
import { existsSync, readdirSync, readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { INIT_SCRIPT, FEED_SCRIPT } from '../qa_mock_ops.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = process.argv[2]; mkdirSync(OUT, { recursive: true });
const SLOW = 20;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jfif': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
function findChromium() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  for (const d of readdirSync(base)) if (d.startsWith('chromium-') && !d.includes('headless')) { const p = join(base, d, 'chrome-linux', 'chrome'); if (existsSync(p)) return p; }
  return null;
}
const { chromium } = await import('playwright-core');
const browser = await chromium.launch({ executablePath: findChromium(), headless: true, args: ['--no-sandbox', '--no-proxy-server'] });

async function open(W, H) {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  await page.route('**/*', route => {
    const u = new NodeURL(route.request().url());
    if (u.hostname === 'app.local') { let p = decodeURIComponent(u.pathname); if (p === '/') p = '/index.html';
      try { return route.fulfill({ status: 200, body: readFileSync(join(ROOT, p)), contentType: MIME[extname(p)] || 'application/octet-stream' }); } catch { return route.fulfill({ status: 404, body: 'nf' }); } }
    if (u.hostname === 'cdn.plot.ly') { const c = join(ROOT, 'tools', 'vendor', 'plotly-basic-2.27.0.min.js'); if (existsSync(c)) return route.fulfill({ status: 200, body: readFileSync(c), contentType: 'text/javascript' }); }
    return route.abort();
  });
  await page.addInitScript(INIT_SCRIPT);
  await page.goto('https://app.local/index.html?qa=admin', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('#biz-main [data-bizmbox]', { timeout: 20000 });
  await page.waitForTimeout(1500);
  await page.evaluate(FEED_SCRIPT);
  await page.waitForTimeout(1600);
  await page.evaluate(`var b=document.getElementById('qa-banner'); if(b)b.remove();`);
  return page;
}

// ── ① 슬라이더 바 위치 ────────────────────────────────────────────
{
  const W = 1280, H = 760;
  const page = await open(W, H);
  for (const p of [1, 3]) {
    await page.evaluate(`_bizmTo(${p})`); await page.waitForTimeout(1800);
    await page.screenshot({ path: join(OUT, `bar_full_p${p}.jpg`), type:'jpeg', quality:72 });
    await page.screenshot({ path: join(OUT, `bar_crop_p${p}.jpg`), type:'jpeg', quality:82, clip: { x: 0, y: H - 92, width: W, height: 88 } });
  }
  const m = await page.evaluate(`(()=>{const r=document.querySelector('#bizm-dots-row .bizm-pgctl').getBoundingClientRect();
    const rl=document.getElementById('sales-rail').getBoundingClientRect();
    return {c:+((r.left+r.right)/2).toFixed(1), railL:+rl.left.toFixed(1), docSW:document.documentElement.scrollWidth, vw:document.documentElement.clientWidth};})()`);
  console.log('[bar] 3면 실측', JSON.stringify(m));
  await page.close();
}

// ── ② 전환 결(슬로모션 스트립) ───────────────────────────────────
{
  const page = await open(1920, 1080);
  // 지속시간만 20배 — 이징·순서·타이밍 비율은 정본 그대로. JS 타이머(_BIZM_DZ_OUT)도 같은 배율로 맞춘다.
  await page.addStyleTag({ content: `
    .bizm-flip>*{animation-duration:${0.42 * SLOW}s !important}
    .bizm-dz>*{transition-duration:${0.30 * SLOW}s !important}
    .bizm-dz.out>*{transition-duration:${0.18 * SLOW}s !important}
    .bizm-dzin>*{animation-duration:${0.30 * SLOW}s !important}` });
  await page.evaluate(`try{ window._BIZM_DZ_OUT=${180 * SLOW}; window._BIZM_DZ_IN=${300 * SLOW}; }catch(e){}`);
  // 구판 _bizmAnimate는 .bizm-flip을 480ms 뒤 떼어 애니를 끊는다 — 20배 슬로모션에선 그 전에 프레임을 다 못 찍는다.
  // 캡처 목적으로 **그 타이머 하나만**(delay===480) 무력화 = 애니 곡선·이징은 정본 그대로 두고 관찰 창만 넓힌다.
  await page.evaluate(`(()=>{const st=window.setTimeout;window.setTimeout=function(fn,ms){if(ms===480)return 0;return st.apply(window,arguments);};})()`);
  await page.evaluate(`_bizmTo(1)`); await page.waitForTimeout(1800);
  const clip = { x: 20, y: 78, width: 925, height: 940 };   // 좌 열(유리 프레임 전체)
  await page.screenshot({ path: join(OUT, 'dz_t000.jpg'), type:'jpeg', quality:70, clip });
  const marks = [40, 90, 190, 300, 450];                     // 실시간 ms 기준(20배 = 대기 ms)
  const t0 = Date.now();
  await page.evaluate(`_bizmGo(1)`);
  for (const ms of marks) {
    const want = t0 + ms * SLOW, wait = want - Date.now();
    if (wait > 0) await page.waitForTimeout(wait);
    await page.screenshot({ path: join(OUT, `dz_t${String(ms).padStart(3,'0')}.jpg`), type:'jpeg', quality:70, clip });
  }
  await page.waitForTimeout(2500);
  await page.screenshot({ path: join(OUT, 'dz_tend.jpg'), type:'jpeg', quality:70, clip });
  await page.close();
}
await browser.close();
console.log('shots →', OUT);
