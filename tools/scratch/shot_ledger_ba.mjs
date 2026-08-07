#!/usr/bin/env node
/**
 * 260807 대장 정본 동기 — 전/후 실측 스샷 (일회성 프로브)
 *
 * 왜: 이번 변경은 디자인이 아니라 **데이터**다. 그래서 「전과 후」는 색·여백이 아니라 **앱이 그 데이터로 그린 화면**이다.
 *   앱을 진짜로 띄우고(로컬 라우트 서빙 · smoke_bizchart.mjs 계승) 운영대장 응답만 전(라이브 스냅샷)/후(계획)로
 *   갈아끼워 같은 화면을 두 번 찍는다. 값은 화면에서 직접 읽는다(DOM 실측) — 손으로 옮겨 적지 않는다.
 *
 * 사용: node tools/scratch/shot_ledger_ba.mjs <live.json> <plan.json> <출력디렉터리> [연도...]
 */
import { existsSync, readdirSync, readFileSync, mkdirSync } from 'node:fs';
import { URL as NodeURL } from 'node:url';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jfif': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const [, , LIVE, PLAN, OUTDIR, ...YEARS] = process.argv;
const years = (YEARS.length ? YEARS : ['2012', '2017', '2022']).map(Number);

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

// 화면에서 직접 읽는다 — KPI 카드 3장 + 표 행수 + 차트 점 개수
const READ = `(()=>{
  const body=document.getElementById('biz-body'); if(!body)return {err:'보드 없음'};
  const cards=[...body.querySelectorAll('#biz-body > div > div')].filter(d=>d.children.length===2&&/총 공연|평균 점유율|최고 점유율/.test(d.textContent))
    .map(d=>({k:d.children[0].textContent.trim(), v:d.children[1].textContent.trim()}));
  const rows=body.querySelectorAll('table tbody tr').length;
  const pts=document.querySelectorAll('#biz-chart .points path, #biz-chart .point > path').length;
  return {cards, rows, pts, year:(typeof _bizState!=='undefined'?_bizState.year:null)};
})()`;

async function shoot(page, opsJson, tag) {
  const out = {};
  await page.addInitScript(`window.__OPS=${JSON.stringify(opsJson)};`);
  await page.goto('https://app.local/index.html?qa=admin', { waitUntil: 'domcontentloaded', timeout: 40000 });
  await page.waitForTimeout(2500);
  for (const y of years) {
    await page.evaluate(`(()=>{ if(typeof _bizState!=='undefined'){_bizState.raw=window.__OPS;_bizState.types={};_bizState.year=${y};}
      if(typeof closeBusinessBoard==='function')closeBusinessBoard(); openBusinessBoard(); })()`);
    await page.waitForSelector('#biz-body table', { timeout: 25000 });
    await page.waitForTimeout(1500);
    // 분류 칩 전부 켠다 — 기본값(기획만)이면 대관에 몰린 보강이 화면에 안 나타난다(전/후가 같아 보인다).
    await page.evaluate(`(()=>{ Object.keys(_bizState.types).forEach(function(t){_bizState.types[t]=true;}); _bizRender(); })()`);
    await page.waitForTimeout(2600);
    out[y] = await page.evaluate(READ);
    // 데이터가 눈에 보이는 두 자리만 자른다 — ① 월×점유율 산점도(행이 늘면 점이 는다) ② KPI 카드 3장
    await page.evaluate(`(()=>{ const b=document.getElementById('biz-body');
      const cards=[...b.querySelectorAll('div')].find(d=>d.children.length===3&&/총 공연/.test(d.textContent)&&/최고 점유율/.test(d.textContent));
      if(cards)cards.id='ba-cards'; })()`);
    for (const [sel, name] of [['#biz-chart', '차트'], ['#ba-cards', 'KPI']]) {
      const el = await page.$(sel);
      if (el) await el.screenshot({ path: join(OUTDIR, `260807_대장동기_${y}_${name}_${tag}.png`) });
    }
    const modal = await page.$('#business-board .modal');
    await modal.screenshot({ path: join(OUTDIR, `260807_대장동기_${y}_전면_${tag}.png`) });
  }
  return out;
}

async function main() {
  const { chromium } = await import('playwright-core');
  mkdirSync(OUTDIR, { recursive: true });
  const live = JSON.parse(readFileSync(LIVE, 'utf8'));
  const plan = JSON.parse(readFileSync(PLAN, 'utf8'));
  const before = { headers: live.headers, rows: live.rows, count: live.rows.length };
  const after = { headers: plan.headers, rows: plan.rows, count: plan.rows.length };

  const browser = await chromium.launch({ executablePath: findChromium(), headless: true, args: ['--no-sandbox', '--no-proxy-server'] });
  const res = {};
  try {
    for (const [tag, data] of [['전', before], ['후', after]]) {
      const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 2 });
      const page = await ctx.newPage();
      await page.route('**/*', route => {
        const u = new NodeURL(route.request().url());
        if (u.hostname === 'app.local') {
          let p = decodeURIComponent(u.pathname); if (p === '/') p = '/index.html';
          try { return route.fulfill({ status: 200, body: readFileSync(join(ROOT, p)), contentType: MIME[extname(p)] || 'application/octet-stream' }); }
          catch { return route.fulfill({ status: 404, body: 'nf' }); }
        }
        if (u.hostname === 'cdn.plot.ly') {
          const c = join(ROOT, 'tools', 'vendor', 'plotly-basic-2.27.0.min.js');
          if (existsSync(c)) return route.fulfill({ status: 200, body: readFileSync(c), contentType: 'text/javascript' });
        }
        return route.abort();
      });
      await page.addInitScript(`(function(){ var real=null;
        function wrapped(method,path){ var p=String(path||'');
          if(p.indexOf('/api/ops')===0&&decodeURIComponent(p).indexOf('세부운영관리대장')>=0)return Promise.resolve(window.__OPS);
          return real?real(method,path):Promise.resolve({rows:[],headers:[],programs:[]}); }
        try{ Object.defineProperty(window,'_qaApi',{configurable:true,get:function(){return wrapped;},set:function(v){real=v;}}); }catch(e){}
      })();`);
      res[tag] = await shoot(page, data, tag);
      await ctx.close();
    }
  } finally { await browser.close(); }
  console.log(JSON.stringify(res, null, 1));
}
main().catch(e => { console.error('✗', e.message || e); process.exit(1); });
