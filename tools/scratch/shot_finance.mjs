#!/usr/bin/env node
// [260812] 사업비 전/후 캡처 — `docs/reports/260812_사업비_전후.html` 산출용(일회성 스냅샷 도구).
//   「전」은 손으로 만든 모형이 아니라 **같은 정본 코드 경로**에서 뽑는다: 페이지 안에서 `_finOf`를 잠깐
//   「늘 못 찾음」으로 바꿔 `_bizListTable`을 다시 그리면, 사업비가 없던 시절의 그 표가 그대로 나온다.
//   = 전/후가 마크업 한 벌에서 나오므로 「전」이 실제와 다를 수가 없다.
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { dirname, join, extname } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'docs', 'reports');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jfif': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.wasm': 'application/wasm' };
const YEAR = 2025;

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

const OPS = `(()=>{
  const mk=(nm,m,d,paid,seat,g)=>({'공연명':nm,'년도':'${YEAR}','월':String(m),'일':String(d),
    '발권유료':String(paid),'기본좌석':String(seat),'공연구분':'기획','장르1':g,'회차':'1'});
  return {sheet:'세부운영관리대장(정리)',headers:[],rows:[
    mk('신년음악회',1,10,464,900,'클래식'),
    mk('아파나도르',4,24,546,900,'무용'),
    mk('명성황후',6,12,3636,4000,'뮤지컬'),
    mk('킹키부츠',11,20,3280,4000,'뮤지컬'),
    mk('넌 특별하단다',5,3,2756,3000,'아동'),
    mk('스모크 대관 공연',5,2,100,900,'기타')
  ]};
})()`;

const main = async () => {
  const { chromium } = await import('playwright-core');
  const browser = await chromium.launch({ executablePath: findChromium(), headless: true, args: ['--no-sandbox', '--no-proxy-server'] });
  const page = await browser.newPage({ viewport: { width: 1180, height: 900 }, deviceScaleFactor: 2 });
  await page.route('**/*', route => {
    const u = new NodeURL(route.request().url());
    if (u.hostname === 'app.local') {
      let p = decodeURIComponent(u.pathname); if (p === '/') p = '/index.html';
      try { return route.fulfill({ status: 200, body: readFileSync(join(ROOT, p)), contentType: MIME[extname(p)] || 'application/octet-stream' }); }
      catch { return route.fulfill({ status: 404, body: 'nf' }); }
    }
    return route.abort();
  });
  await page.goto('https://app.local/index.html?qa=admin#cal', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('.cell', { timeout: 20000 });

  const shots = {};
  const grab = async (sel, key) => { shots[key] = (await page.locator(sel).screenshot()).toString('base64'); };

  // 표 두 벌 — 「전」 = _finOf를 잠깐 못 찾게, 「후」 = 정본 그대로
  await page.evaluate(`(()=>{
    _bizState.raw=${OPS};
    window._mkTbl=(off)=>{
      const keep=_finOf; if(off)_finOf=function(){return null;};
      const list=_bizListBuild(_bizClean().filter(r=>r._year===${YEAR}),${YEAR});
      const html=_bizListTable(list);
      _finOf=keep;
      let box=document.getElementById('shotbox');
      if(!box){box=document.createElement('div');box.id='shotbox';
        box.style.cssText='position:fixed;left:0;top:0;z-index:99999;width:1100px;background:var(--surface-solid);padding:16px 18px;border-radius:16px';
        document.body.appendChild(box);}
      box.innerHTML=html; return true;
    };
  })()`);
  await page.evaluate('_mkTbl(true)');  await grab('#shotbox', 'before');
  await page.evaluate('_mkTbl(false)'); await grab('#shotbox', 'after');
  await page.evaluate("document.getElementById('shotbox').remove()");

  // 사업비 모달(보기 / 편집) + 사업비 보드
  await page.evaluate("sessionStorage.setItem('isAcct','1'); userRole='user';");
  await page.evaluate(`_finModal('${YEAR}-공연-01',${YEAR})`);
  await page.waitForSelector('#fin-modal .modal', { timeout: 5000 });
  await grab('#fin-modal .modal', 'modal');
  await page.evaluate('_finEditOn()');
  await grab('#fin-modal .modal', 'edit');
  await page.evaluate('_finClose()');

  await page.evaluate(`openFinanceBoard(${YEAR})`);
  await page.waitForSelector('#finb-modal table', { timeout: 8000 });
  await page.setViewportSize({ width: 1400, height: 1100 });
  await grab('#finb-modal .modal', 'board');

  // 「아직 안 매달림」 창 — 사업비가 없는 공연을 눌렀을 때
  await page.evaluate('_finBoardClose()');
  await page.evaluate(`_finModal(null,${YEAR},'스모크 대관 공연')`);
  await page.waitForSelector('#fin-modal .modal', { timeout: 5000 });
  await grab('#fin-modal .modal', 'unbound');

  const stat = await page.evaluate(`(()=>{
    const rows=_finRows(${YEAR}),by={};
    rows.forEach(r=>{const c=(by[r.cat]=by[r.cat]||{n:0,vou:0,fee:0,rev:0});c.n++;c.vou+=r.vou;c.fee+=r.fee;c.rev+=r.rev;});
    return {n:rows.length,by:by};
  })()`);
  await browser.close();
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, '_finance_shots.json'), JSON.stringify({ shots, stat }, null, 0));
  console.log('shots:', Object.keys(shots).join(', '), '· rows:', stat.n);
};
main().catch(e => { console.error(e); process.exit(1); });
