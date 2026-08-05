#!/usr/bin/env node
// [260805] 3면 하단 반반 중 **예술교육 반쪽** 전·후 캡처 + DOM 실측 — shot_exmonthly.mjs 하네스 100% 계승.
// 실행: node tools/scratch/shot_edu_sales.mjs <서빙할 index.html> <출력.png> [폭 높이]
//
// 목데이터 배선(운영자 「종료 = 지금처럼 · 판매중 = 공연과 같이 · 동시에 팔리면 누적그래프」 상태 재현 · 실API·PII 미접촉):
//   · 종료 교육 1건 = 운영대장 교육 행(발권유료 340) → **실막대**(현행 문법 그대로여야 한다)
//   · 판매중 교육 2건 = 공연마스터 '판매중' + 운영_일일입력 월별 누계 → **동시 판매** 구간(6~8월)이 겹친다
//   · 예정 교육 1건 = 원천 없음 → 파선 자리(현행)
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

// QA 목 위에 덧씌우는 이 프로브 전용 배선(위 주석 3줄 그대로).
const OVERRIDE = `(function(){
  window.__MOCK_EXM={rows:[],headers:['전시ID','전시명','연도','상태','무료여부','목표관객','최종유료','최종총인원','시작일','종료일']};
  window.__MOCK_EXD={rows:[],headers:['전시ID','전시명','기준일자','누계유료','누계총인원']};
  window.__MOCK_PROGRAMS={programs:[
    {'프로그램ID':'QEDU1','풀네임':'예울마루 아카데미 봄학기','줄임말':'아카데미 봄','콘텐츠구분':'예술교육',
     '시작일':'2026-03-10','종료일':'2026-06-25','장소':'소극장','구분':'망마 기획전','장르':'인문학'},
    {'프로그램ID':'QEDU3','풀네임':'어린이 여름 예술캠프','줄임말':'여름캠프','콘텐츠구분':'예술교육',
     '판매시작일':'2026-06-15','판매종료일':'2026-08-20','시작일':'2026-07-29','종료일':'2026-08-22','장르':'체험'},
    {'프로그램ID':'QEDU5','풀네임':'토요 가족 워크숍','줄임말':'가족워크숍','콘텐츠구분':'예술교육',
     '판매시작일':'2026-05-01','판매종료일':'2026-10-25','시작일':'2026-06-06','종료일':'2026-10-31','장르':'가족'},
    {'프로그램ID':'QEDU4','풀네임':'예울마루 아카데미 가을학기','줄임말':'아카데미 가을','콘텐츠구분':'예술교육',
     '시작일':'2026-09-02','종료일':'2026-11-27','장르':'인문학'}
  ]};
  // 운영대장에 **교육 행**을 얹는다(종료 교육의 정본 = 발권유료) — 공연 행은 QA 목 원본 그대로 둔다.
  (function(){ var o=window.__MOCK_OPS; if(!o||!o.rows)return;
    o.rows.push({'상태':'','사업구분':'교육','티켓구분':'유료','기본좌석':40,'발권유료':340,
      '년도':2026,'월':6,'일':25,'공연구분':'기획','장르1':'인문학','공연명':'예울마루 아카데미 봄학기','수익성':''});
  })();
  // 판매 축(공연마스터 · 운영_일일입력) — 판매중 교육 2건. 누계는 월을 건너뛰며 쌓인다(6~8월 동시 판매).
  window.__MOCK_SMASTER={rows:[
    {'ID':'QEDU3','사업명':'어린이 여름 예술캠프','상태':'판매중','티켓오픈일':'2026-06-15','시작일':'2026-07-29','종료일':'2026-08-22','기준석':280,'총회차':1,'총오픈석':280,'목표점유율':60},
    {'ID':'QEDU5','사업명':'토요 가족 워크숍','상태':'판매중','티켓오픈일':'2026-05-01','시작일':'2026-06-06','종료일':'2026-10-31','기준석':300,'총회차':1,'총오픈석':300,'목표점유율':60}
  ],headers:['ID','사업명','상태','티켓오픈일','시작일','종료일','기준석','총회차','총오픈석','목표점유율']};
  window.__MOCK_SDAILY={rows:[
    {'공연ID':'QEDU3','공연명':'어린이 여름 예술캠프','기준일자':20260620,'합계좌석':24,'합계금액':480000,'전일대비(석)':0},
    {'공연ID':'QEDU3','공연명':'어린이 여름 예술캠프','기준일자':20260715,'합계좌석':88,'합계금액':1760000,'전일대비(석)':0},
    {'공연ID':'QEDU3','공연명':'어린이 여름 예술캠프','기준일자':20260803,'합계좌석':147,'합계금액':2940000,'전일대비(석)':0},
    {'공연ID':'QEDU5','공연명':'토요 가족 워크숍','기준일자':20260510,'합계좌석':30,'합계금액':300000,'전일대비(석)':0},
    {'공연ID':'QEDU5','공연명':'토요 가족 워크숍','기준일자':20260612,'합계좌석':96,'합계금액':960000,'전일대비(석)':0},
    {'공연ID':'QEDU5','공연명':'토요 가족 워크숍','기준일자':20260709,'합계좌석':158,'합계금액':1580000,'전일대비(석)':0},
    {'공연ID':'QEDU5','공연명':'토요 가족 워크숍','기준일자':20260805,'합계좌석':214,'합계금액':2140000,'전일대비(석)':0}
  ],headers:['공연ID','공연명','기준일자','합계좌석','합계금액','전일대비(석)']};
})();`;

// FEED_SCRIPT 뒤에 판매 축 캐시를 채운다(_bizSalesIdx는 master·daily 둘 다 있어야 발화).
const FEED2 = `(()=>{
  if(typeof _salesState!=='undefined'&&_salesState){
    _salesState.master=window.__MOCK_SMASTER; _salesState.daily=window.__MOCK_SDAILY;
    _salesState.rounds=_salesState.rounds||{rows:[],headers:[]};
    _salesState.group=_salesState.group||{rows:[],headers:[]};
  }
})()`;

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
    await page.evaluate(FEED_SCRIPT);
    await page.evaluate(FEED2);
    await page.waitForTimeout(400);
    await page.evaluate('(()=>{try{_bizInlineRender();}catch(e){} try{_railYrmRender();}catch(e){}})()');
    await page.waitForTimeout(3000);
    // 6번째 인자 `live` = 「전체 ↔ 판매중」 토글을 켠 상태(끝난 교육이 빠지고 꺾은선만 남는 화면)를 잰다.
    if (process.argv[6] === 'live') { await page.evaluate('_bizmLiveToggle()'); await page.waitForTimeout(2500); }

    const probe = await page.evaluate(`(()=>{
      const out={};
      const gg=(id,sel)=>{const d=document.getElementById(id);return d?d.querySelectorAll(sel).length:null;};
      const tx=(id,sel)=>{const d=document.getElementById(id);return d?[...d.querySelectorAll(sel)].map(t=>t.textContent):null;};
      out.edu={ bars:gg('bizm-edu-chart','.barlayer .point path'),
                lines:gg('bizm-edu-chart','.scatterlayer .js-line'),
                fills:gg('bizm-edu-chart','.scatterlayer .js-fill'),
                points:gg('bizm-edu-chart','.scatterlayer .points path'),
                shapes:gg('bizm-edu-chart','.shapelayer path'),
                yTicks:tx('bizm-edu-chart','.yaxislayer-above text'),
                annos:tx('bizm-edu-chart','.infolayer .annotation text'),
                labels:tx('bizm-edu-chart','.barlayer text') };
      try{
        const Y=_bizmState.year;
        out.eduRows=(_bizEduMonthRows(Y)||[]).map(g=>({i:g._idx,n:g.name.slice(0,20),st:g._st,sold:g._sold,mo:(g._mo||null),src:g._vsrc||''}));
        const NM=['토요 가족 워크숍','어린이 여름 예술캠프','예울마루 아카데미'];
        const lt=(document.getElementById('biz-main')||{innerText:''}).innerText||'';
        out.leakLeft=NM.filter(n=>lt.indexOf(n)>=0);
        out.kpi=[...document.querySelectorAll('#biz-main .bizm-kpi')].map(e=>e.innerText.split(String.fromCharCode(10)).join('='));
      }catch(e){ out.err=String(e); }
      // 공연 목록에 교육이 새는지(더블 카운트) 실측 — 우 열 상세 표 행 이름
      try{ out.rightRows=[...document.querySelectorAll('#rail-yrm .bizm-row .nm, #rail-yrm table tr')].map(e=>e.textContent.replace(/\\s+/g,' ').trim().slice(0,28)).slice(0,24); }catch(e){}
      return out;
    })()`);
    console.log(JSON.stringify(probe, null, 1));
    console.log(errs.length ? 'PAGE ERRORS: ' + errs.slice(0, 6).join(' | ') : 'PAGE ERRORS: 0');

    const clip = await page.evaluate(`(()=>{
      const c=document.getElementById('bizm-edu-chart')||document.getElementById('bizm-ex-chart'); if(!c)return null;
      const row=c.closest('.bizm-card')?c.closest('.bizm-card').parentNode:null; if(!row)return null;
      const r=row.getBoundingClientRect();
      return {x:Math.max(0,r.left-6),y:Math.max(0,r.top-6),width:r.width+12,height:r.height+12};
    })()`);
    if (clip) await page.screenshot({ path: OUT, clip });
    const ed = await page.$('#bizm-edu-chart');
    if (ed) await ed.screenshot({ path: OUT.replace(/\.png$/, '_edu.png') });
    console.log('shot → ' + OUT);
  } finally { await browser.close(); }
  return 0;
}
main().catch(e => { console.error(e); process.exit(1); });
