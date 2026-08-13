// [scratch · 260813] 사업 개요 전/후 촬영 — smoke_finance.mjs와 같은 하네스(로컬 파일 서빙 · 실API 차단 · 씨앗만).
//   실행: node tools/scratch/shot_bizov.mjs <출력접두> [연도]
import { existsSync, readdirSync, readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { dirname, join, extname } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jfif': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.wasm': 'application/wasm' };
const OUT = process.argv[2] || 'before';
const YEAR = Number(process.argv[3] || 2025);
const DIR = join(ROOT, 'tools', 'scratch', 'shots');

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

const { chromium } = await import('playwright-core');
mkdirSync(DIR, { recursive: true });
const browser = await chromium.launch({ executablePath: findChromium(), headless: true, args: ['--no-sandbox', '--no-proxy-server'] });
const page = await browser.newPage({ viewport: { width: 1500, height: 1050 }, deviceScaleFactor: 1 });
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
await page.goto('https://app.local/index.html?qa=admin#bizov', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(2500);
// 연도 고정 + 사업 개요 강제 렌더
await page.evaluate(`(()=>{ try{ if(!BIZ_FIN.built)BIZ_FIN.built='2026-08-13 11:00'; }catch(_e){} try{ _bizDeckGo('ov'); }catch(_e){} try{ _bizOvSetYear(${YEAR}); }catch(_e){} ${process.argv[4] ? `try{ _bizOvSetCat('${process.argv[4]}'); }catch(_e){}` : ''} })()`);
await page.waitForTimeout(1800);
await page.screenshot({ path: join(DIR, OUT + '_full.png'), fullPage: false });
// 크롭은 **좁게** — 리포트는 base64를 HTML에 박는 규약(.gitignore)이라 큰 그림 한 장이 그대로 용량이 된다.
for (const [sel, name] of [
  ['#biz-main div:has(> .bizm-kpi)', 'kpi'],            // KPI 줄만
  // ⚠ nth 자리로 잡지 않는다 — #807이 **차트 카드를 앞에** 넣어 자리가 밀렸다. 제목 글자로 고른다.
  ['#biz-main .bizm-card:has(.ct:text-matches("사업 ?결과"))', 'card1'],   // 사업 결과 표 + 기준일
  ['#sales-rail .bizm-card:has(.ct:text-matches("분야별")), #biz-main .bizm-card:has(.ct:text-matches("분야별"))', 'card2'],   // 분야별 표 + 선택자 (#809로 우측 레일로 이사)
  ['#sales-rail [data-bizmbox]', 'rail'],               // 우 열 유리 박스 안쪽
  ['#biz-main', 'main'],
]) {
  const el = await page.$(sel);
  if (el) { try { await el.screenshot({ path: join(DIR, OUT + '_' + name + '.png') }); } catch (e) { console.log('shot fail', name, e.message); } }
  else console.log('sel miss', name);
}
// 텍스트 실측 — KPI 라벨/값과 표 머리 단위
const probe = await page.evaluate(`(()=>{
  const kpi=[...document.querySelectorAll('#biz-main .bizm-kpi')].map(k=>({
    lab:(k.querySelector('.lab')||{}).textContent||'', val:(k.querySelector('.val')||{}).textContent||''}));
  const th=[...document.querySelectorAll('#biz-main table thead td')].map(t=>t.textContent.replace(/\\s+/g,' ').trim());
  const r1=[...document.querySelectorAll('#biz-main table tbody tr')].slice(0,2).map(tr=>[...tr.children].map(td=>td.textContent.trim()).join(' | '));
  return {kpi,th,r1};
})()`);
console.log(JSON.stringify(probe, null, 1));
if (errs.length) console.log('PAGEERROR:', errs.slice(0, 5));
await browser.close();
