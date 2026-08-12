#!/usr/bin/env node
// [260812] 사업 지표 입력 창 전/후 캡처 — `docs/reports/260812_사업지표입력_전후.html` 산출용(일회성 스냅샷 도구).
//   「전」 = git HEAD의 index.html + data/biz_finance.js(손으로 만든 모형이 아니라 **머지된 그 코드 그대로**)
//   「후」 = 지금 작업 트리. 두 판 다 같은 목 시트 응답을 받으므로 차이는 코드에서만 온다.
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { dirname, join, extname } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'docs', 'reports');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jfif': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.wasm': 'application/wasm' };
const YEAR = 2026;   // 미기입이 몰려 있는 진행 연도 — 「0인가 안 적었나」가 가장 잘 드러난다

const at = (rev, path) => execFileSync('git', ['-C', ROOT, 'show', `${rev}:${path}`], { encoding: 'utf8', maxBuffer: 1 << 28 });

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

const main = async () => {
  const OLD_HTML = at('HEAD', 'index.html');
  const OLD_SEED = at('HEAD', 'data/biz_finance.js');
  const { chromium } = await import('playwright-core');
  const browser = await chromium.launch({ executablePath: findChromium(), headless: true, args: ['--no-sandbox', '--no-proxy-server'] });
  const shots = {}, stat = {}, errs = [];

  const run = async (tag, old) => {
    const page = await browser.newPage({ viewport: { width: 900, height: 1150 }, deviceScaleFactor: 2 });
    page.on('pageerror', e => errs.push(tag + ': ' + String(e && e.message || e)));
    await page.route('**/*', route => {
      const u = new NodeURL(route.request().url());
      if (u.hostname !== 'app.local') return route.abort();
      let p = decodeURIComponent(u.pathname); if (p === '/') p = '/index.html';
      if (old && p === '/index.html') return route.fulfill({ status: 200, body: OLD_HTML, contentType: MIME['.html'] });
      if (old && p === '/data/biz_finance.js') return route.fulfill({ status: 200, body: OLD_SEED, contentType: MIME['.js'] });
      try { return route.fulfill({ status: 200, body: readFileSync(join(ROOT, p)), contentType: MIME[extname(p)] || 'application/octet-stream' }); }
      catch { return route.fulfill({ status: 404, body: 'nf' }); }
    });
    await page.goto('https://app.local/index.html?qa=admin', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2200);
    await page.evaluate(`sessionStorage.setItem('isAcct','1'); _finState.rows=[];`);   // 시트 없음 = 씨앗만(두 판 동일 조건)
    await page.evaluate(`openBizFinInput(${YEAR})`);
    await page.waitForSelector('#fin-in .modal', { timeout: 8000 });
    await page.waitForTimeout(400);
    // 미기입이 가장 많은 사업을 고른다(두 판 모두 같은 사업NO — 씨앗 NO는 정체성 고정이라 안 밀린다)
    const no = await page.evaluate(`(()=>{
      const rs=_finRows(${YEAR});
      const pick=(typeof _finBlank==='function')
        ? rs.slice().sort((a,b)=>_finBlank(b).length-_finBlank(a).length)[0]
        : rs.find(r=>!r.vou&&!r.rev)||rs[0];
      _finInSetNo(pick.no); return pick.no;
    })()`);
    await page.waitForTimeout(350);
    shots[tag] = (await page.locator('#fin-in .modal').screenshot()).toString('base64');
    stat[tag] = await page.evaluate(`(()=>{
      const m=document.querySelector('#fin-in .modal'), cs=getComputedStyle(m);
      const mh=m.querySelector(':scope > .mhead'), x=m.querySelector('.modal-x');
      const opt=[...m.querySelectorAll('option')].slice(1,4).map(o=>o.textContent.trim());
      const g=k=>{const e=document.getElementById('fi-'+k);return e?e.value:'(칸 없음)';};
      const rs=_finRows(${YEAR});
      let blank=0; if(typeof _finBlank==='function')rs.forEach(r=>blank+=_finBlank(r).length);
      return {
        no:${JSON.stringify(0)}||'',
        headDirect: !!mh,                                   // 머리줄이 .modal 직계 자식인가
        modalBorder: cs.borderTopWidth+' '+cs.borderTopStyle,
        xColor: x?getComputedStyle(x).color:'-',
        opt3: opt,
        vou:g('vou'), rev:g('rev'), bud:g('bud'), cnt:g('cnt'),
        rows: rs.length, blankCells: blank,
        cntFilled: rs.filter(r=>Number(r.cnt)>0).length
      };
    })()`);
    stat[tag].no = no;
    await page.close();
  };

  await run('before', true);
  await run('after', false);
  await browser.close();
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, '_fininput_shots.json'), JSON.stringify({ shots, stat, errs, year: YEAR }, null, 0));
  console.log(JSON.stringify(stat, null, 1));
  console.log('errs:', errs.length ? errs : 0);
};
main().catch(e => { console.error(e); process.exit(1); });
