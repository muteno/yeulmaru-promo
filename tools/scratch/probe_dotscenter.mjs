// 점줄 바 최종 안착 위치 검증 — 두 열 펼침(좌 #biz-main 좌변 ~ 우 #rail-yrm 우변)의 가운데에 있는가.
// 인자: [라벨] [경로]  (경로 = index.html 대체본. 미지정 시 리포 index.html)
import { existsSync, readdirSync, readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { INIT_SCRIPT, FEED_SCRIPT } from '../qa_mock_ops.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const LABEL = process.argv[2] || 'cur';
const ALT = process.argv[3] || null;
const SHOTS = '/tmp/claude-0/-home-user-yeulmaru-promo/d32f6b76-95d9-5348-a42c-018d0e713840/scratchpad/shots';
mkdirSync(SHOTS, { recursive: true });
const W = 1920, H = 1080;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jfif': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };

function findChromium() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  for (const d of readdirSync(base)) if (d.startsWith('chromium-') && !d.includes('headless')) {
    const p = join(base, d, 'chrome-linux', 'chrome'); if (existsSync(p)) return p;
  }
  return null;
}

const CENTER = `(()=>{
  const r=s=>{const e=document.querySelector(s);if(!e||e.offsetParent===null)return null;const b=e.getBoundingClientRect();return {l:Math.round(b.left),r:Math.round(b.right),w:Math.round(b.width),cx:Math.round(b.left+b.width/2)};};
  const bm=r('#biz-main'), ry=r('#rail-yrm'), dr=r('#bizm-dots-row');
  const spreadCx = (bm&&ry)?Math.round((bm.l+ry.r)/2):null;
  return {bizmain:bm, rail:ry, dots:dr, spreadCenter:spreadCx,
    offset:(dr&&spreadCx!=null)?dr.cx-spreadCx:null,
    inlineTr:(document.getElementById('bizm-dots-row')||{style:{}}).style.transform||'-'};
})()`;

async function main() {
  const { chromium } = await import('playwright-core');
  const browser = await chromium.launch({ executablePath: findChromium(), headless: true, args: ['--no-sandbox', '--no-proxy-server'] });
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errs = []; page.on('pageerror', e => errs.push(String(e).split('\n')[0]));
  await page.route('**/*', route => {
    const u = new NodeURL(route.request().url());
    if (u.hostname === 'app.local') {
      let p = decodeURIComponent(u.pathname); if (p === '/') p = '/index.html';
      const file = (p === '/index.html' && ALT) ? ALT : join(ROOT, p);
      try { return route.fulfill({ status: 200, body: readFileSync(file), contentType: MIME[extname(p)] || 'application/octet-stream' }); }
      catch { return route.fulfill({ status: 404, body: 'nf' }); }
    }
    if (u.hostname === 'cdn.plot.ly') {
      const c = join(ROOT, 'tools', 'vendor', 'plotly-basic-2.27.0.min.js');
      if (existsSync(c)) return route.fulfill({ status: 200, body: readFileSync(c), contentType: 'text/javascript' });
    }
    return route.abort();
  });
  await page.addInitScript(INIT_SCRIPT);
  await page.goto('https://app.local/index.html?qa=admin', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('#biz-main [data-bizmbox]', { timeout: 20000 });
  await page.evaluate(FEED_SCRIPT);
  await page.waitForTimeout(2500);

  console.log(`\n===== ${LABEL} =====`);
  console.log('[A] 첫 진입(대시보드 직행):', JSON.stringify(await page.evaluate(CENTER)));
  await page.screenshot({ path: join(SHOTS, `${LABEL}_A_first.png`) });

  await page.evaluate(`setMainView('cal')`); await page.waitForTimeout(1800);
  await page.screenshot({ path: join(SHOTS, `${LABEL}_B_cal.png`) });
  await page.evaluate(`setMainView('biz')`); await page.waitForTimeout(3000);
  const back = await page.evaluate(CENTER);
  console.log('[B] 캘린더 왕복 복귀:      ', JSON.stringify(back));
  await page.screenshot({ path: join(SHOTS, `${LABEL}_C_back.png`) });
  // 점줄 바 확대컷
  const d = back.dots;
  if (d) await page.screenshot({ path: join(SHOTS, `${LABEL}_D_dots.png`), clip: { x: Math.max(0, d.l - 200), y: Math.max(0, (await page.evaluate(`document.getElementById('bizm-dots-row').getBoundingClientRect().top`)) - 20), width: Math.min(W, d.w + 400), height: 70 } });
  console.log('[JS오류]', errs.filter(e => /ReferenceError|SyntaxError|not defined|not a function/.test(e)).slice(0, 3).join(' | ') || '없음');
  await browser.close();
}
main().catch(e => { console.error('ERR', e); process.exit(1); });
