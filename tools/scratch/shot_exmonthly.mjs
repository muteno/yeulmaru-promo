#!/usr/bin/env node
// [260805] 3면 하단 반반(기획 전시 │ 예술교육) 전·후 캡처 + DOM 실측 — shot_biz3.mjs 하네스 100% 계승.
// 실행: node tools/scratch/shot_exmonthly.mjs <서빙할 index.html> <출력.png> [폭 높이]
//
// 목데이터 배선(운영 화면 재현이 목적 · 실API·PII 미접촉):
//   · 전시 = **전시마스터/전시일일 목을 비운다** → `_bizExhibRows`가 커밋된 거울(`data/exhib_daily_2026.js`)만으로 채운다
//     = 운영자 화면과 같은 4건(902 · 3,827 · 3,080 · 252)·같은 월별 일일 누계 = 월별 판매량 경로를 실값으로 밟는다.
//   · 교육 = 프로그램 시트에 **화요살롱 1건**(운영자 스샷 실값: 예술교육·인문학·2026-06-30·소극장) ·
//     운영대장엔 교육 행을 **넣지 않는다**(QA 목 원본 그대로 = 공연 행만) → 라이브와 같은 「수강생 미조인」 상태.
//     그래서 이 하네스는 160 폴백이 실제로 발화하는지를 잰다(조인이 살아 있으면 그쪽이 이겨야 정상).
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
  for (const d of readdirSync(base)) {
    if (d.startsWith('chromium-') && !d.includes('headless')) {
      const p = join(base, d, 'chrome-linux', 'chrome');
      if (existsSync(p)) return p;
    }
  }
  return null;
}

// QA 목 위에 덧씌우는 이 프로브 전용 배선(위 주석 2줄 그대로).
const OVERRIDE = `(function(){
  window.__MOCK_EXM={rows:[],headers:['전시ID','전시명','연도','상태','무료여부','목표관객','최종유료','최종총인원','시작일','종료일']};
  window.__MOCK_EXD={rows:[],headers:['전시ID','전시명','기준일자','누계유료','누계총인원']};
  window.__MOCK_PROGRAMS={programs:[
    {'프로그램ID':'260630_01','풀네임':'2026 화요살롱 - 이낙준(6월)','줄임말':'화요살롱','콘텐츠구분':'예술교육',
     '판매시작일':'2026-06-02','판매종료일':'2026-06-30','시작일':'2026-06-30','종료일':'2026-06-30',
     '담당자':'','장소':'소극장','구분':'망마 기획전','장르':'인문학'}
  ]};
})();`;

async function main() {
  let chromium;
  try { ({ chromium } = await import('playwright-core')); }
  catch { console.log('SKIP — playwright-core 미설치'); return 0; }
  const exe = findChromium();
  if (!exe) { console.log('SKIP — chromium 미탐지'); return 0; }

  const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--no-sandbox', '--no-proxy-server'] });
  const errs = [];
  try {
    const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
    page.on('pageerror', e => errs.push(String(e).split('\n')[0]));
    page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 160)); });
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
    await page.addInitScript(OVERRIDE);
    await page.goto('https://app.local/index.html?qa=admin', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('#biz-main [data-bizmbox]', { timeout: 20000 });
    await page.waitForTimeout(1400);
    await page.evaluate(FEED_SCRIPT);   // 기본 상태가 이미 3면(_bizmState.page 기본 3) — _bizmTo는 「슬라이드 자리」라 부르면 다른 면으로 간다
    await page.waitForTimeout(400);
    await page.evaluate('(()=>{try{_bizInlineRender();}catch(e){} try{_railYrmRender();}catch(e){}})()');
    await page.waitForTimeout(3000);

    // DOM 실측 — 전시 반쪽의 점·선·채움 개수와 값 라벨, 교육 반쪽의 실막대/파선 여부.
    const probe = await page.evaluate(`(()=>{
      const out={};
      const gg=(id,sel)=>{const d=document.getElementById(id);return d?d.querySelectorAll(sel).length:null;};
      const tx=(id,sel)=>{const d=document.getElementById(id);return d?[...d.querySelectorAll(sel)].map(t=>t.textContent):null;};
      out.ex={ fills:gg('bizm-ex-chart','.scatterlayer .js-fill'),
               lines:gg('bizm-ex-chart','.scatterlayer .js-line'),
               points:gg('bizm-ex-chart','.scatterlayer .points path'),
               xTicks:tx('bizm-ex-chart','.xaxislayer-above text'),
               yTicks:tx('bizm-ex-chart','.yaxislayer-above text'),
               annos:tx('bizm-ex-chart','.infolayer .annotation text') };
      // [260805] 트레이스별 점 채움/테두리 — 「종료 = 찬 동그라미 · 진행중 = 빈 동그라미」 실측용.
      {const d=document.getElementById('bizm-ex-chart');
       out.ex.markers=d?[...d.querySelectorAll('.scatterlayer .trace')].map(t=>{
         const ps=[...t.querySelectorAll('.points path')];
         return ps.length?{n:ps.length,fill:ps[0].style.fill,stroke:ps[0].style.stroke}:null;
       }).filter(Boolean):null;}
      out.edu={ bars:gg('bizm-edu-chart','.barlayer .point path'),
                shapes:gg('bizm-edu-chart','.shapelayer path'),
                yTicks:tx('bizm-edu-chart','.yaxislayer-above text'),
                annos:tx('bizm-edu-chart','.infolayer .annotation text'),
                labels:tx('bizm-edu-chart','.barlayer text') };
      try{
        const Y=_bizmState.year;
        out.exRows=(_bizExhibRows(Y)||[]).map(g=>({n:g.name.slice(0,16),st:g._st,sold:g._sold,dly:(g._dly||[]).length}));
        out.eduRows=(_bizEduMonthRows(Y)||[]).map(g=>({i:g._idx,n:g.name.slice(0,20),st:g._st,sold:g._sold,src:g._vsrc||''}));
      }catch(e){ out.err=String(e); }
      return out;
    })()`);
    console.log(JSON.stringify(probe, null, 1));
    if (errs.length) console.log('PAGE ERRORS: ' + errs.slice(0, 6).join(' | '));
    else console.log('PAGE ERRORS: 0');

    // 반반 줄(전시 카드 + 교육 카드)만 잘라 담는다 — [data-bizmfill]은 1면 실적표에도 붙어 있어 선택자로 잡으면 안 된다.
    const clip = await page.evaluate(`(()=>{
      const c=document.getElementById('bizm-ex-chart'); if(!c)return null;
      const row=c.closest('.bizm-card')?c.closest('.bizm-card').parentNode:null; if(!row)return null;
      const r=row.getBoundingClientRect();
      return {x:Math.max(0,r.left-6),y:Math.max(0,r.top-6),width:r.width+12,height:r.height+12};
    })()`);
    if (clip) await page.screenshot({ path: OUT, clip });
    const ex = await page.$('#bizm-ex-chart');
    if (ex) await ex.screenshot({ path: OUT.replace(/\.png$/, '_ex.png') });
    const ed = await page.$('#bizm-edu-chart');
    if (ed) await ed.screenshot({ path: OUT.replace(/\.png$/, '_edu.png') });
    console.log('shot → ' + OUT);
  } finally { await browser.close(); }
  return 0;
}
main().catch(e => { console.error(e); process.exit(1); });
