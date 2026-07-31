// 대시보드 책 캡처 harness — smoke_rail_align.mjs 시드/부팅 문법 그대로 계승
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = '/home/user/yeulmaru-promo';
const INDEX = join(ROOT, 'index.html');
const OUT = process.env.OUT || '/tmp/claude-0/-home-user-yeulmaru-promo/b0d5dffe-9d78-5ece-a2c3-a164a72054e2/scratchpad';
const PAGE = +(process.env.PG || 1);
const VW = +(process.env.VW || 1680), VH = +(process.env.VH || 1200);

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

const TODAY = new Date(); TODAY.setHours(0, 0, 0, 0);
const iso = d => d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
const ymd = d => d.getFullYear() + '' + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2);
const off = n => { const d = new Date(TODAY); d.setDate(d.getDate() + n); return d; };

const MASTER = [
  { ID: 'S001', 사업명: '스모크 공연', 기준석: 926, 총회차: 2, 총오픈석: 926, 목표점유율: 50, 수익성: '공공', 티켓오픈일: iso(off(-10)), 시작일: iso(off(-1)), 종료일: iso(off(3)), 상태: '판매중' },
  { ID: 'S002', 사업명: '두번째 공연', 기준석: 500, 총회차: 1, 총오픈석: 500, 목표점유율: 60, 수익성: '상업', 티켓오픈일: iso(off(-20)), 시작일: iso(off(5)), 종료일: iso(off(6)), 상태: '판매중' },
];
const ROUNDS = [{ ID: 'S001', 공연일: iso(off(-1)), 오픈좌석: null }, { ID: 'S001', 공연일: iso(off(3)), 오픈좌석: null }, { ID: 'S002', 공연일: iso(off(5)), 오픈좌석: null }];
const DAILY = [];
[300, 420, 510, 605, 700, 790, 860].forEach((v, i) => DAILY.push({ 기준일자: ymd(off(i - 7)), 공연명: '스모크 공연', 공연ID: 'S001', 합계좌석: v, 합계금액: v * 40000 }));
[100, 140, 180, 220, 260, 300, 340].forEach((v, i) => DAILY.push({ 기준일자: ymd(off(i - 7)), 공연명: '두번째 공연', 공연ID: 'S002', 합계좌석: v, 합계금액: v * 40000 }));
const EX_MASTER = [{ 전시ID: 'X001', 전시명: '스모크 전시', 연도: TODAY.getFullYear(), 시작일: iso(off(-20)), 종료일: iso(off(20)), 운영일수: 41, 목표관객: 1000, 목표금액: 5e6, 수익성: '공공', 상태: '진행중' }];
const EX_DAILY = [120, 190, 260, 330, 400, 470, 540].map((v, i) => ({ 기준일자: ymd(off(i - 7)), 전시ID: 'X001', 일일유료: 70, 일일총인원: 70, 누계유료: v, 누계무료: 0, 누계총인원: v, 점유율: v / 10 }));
const PGS = [
  { id: 'S001', f: '스모크 공연', n: '스모크', l: '대극장', t: 'c', g: '클래식', s: iso(off(-1)), e: iso(off(3)), ss: iso(off(-10)), se: iso(off(3)) },
  { id: 'S002', f: '두번째 공연', n: '두번째', l: '소극장', t: 'c', g: '뮤지컬', s: iso(off(5)), e: iso(off(6)), ss: iso(off(-20)), se: iso(off(6)) },
  { id: 'X001', f: '스모크 전시', n: '스모크전', l: '전시실', t: 'e', g: '전시', s: iso(off(-20)), e: iso(off(20)), ss: iso(off(-20)), se: iso(off(20)) },
];
// 운영대장(3면 = 사업 결과 비교) 시드 — 여러 건이라야 표가 길어져 스크롤 요건이 보인다
const GENRES = ['클래식', '뮤지컬', '연극', '무용', '국악'];
const OPS = [];
for (let y = 2024; y <= TODAY.getFullYear(); y++) {
  for (let i = 0; i < 14; i++) {
    const m = (i % 12) + 1;
    OPS.push({
      년도: y, 월: m, 일: (i % 8) + 11, 사업구분: '공연', 공연구분: i % 3 === 0 ? '대관' : '기획',
      공연명: `${y} 운영사업 ${i + 1}`, 장르1: GENRES[i % GENRES.length], 세부장르: GENRES[i % GENRES.length],
      기본좌석: 900, 발권유료: 300 + i * 37, 상태: '완료', 티켓구분: '유료', 수익성: i % 2 ? '공공' : '상업',
    });
  }
}

async function main() {
  const { chromium } = await import('playwright-core');
  const browser = await chromium.launch({ executablePath: findChromium(), headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: +(process.env.DSF || 2) });
  await ctx.route('**', r => (r.request().url().startsWith('file:') ? r.continue() : r.abort()));
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') console.log('  [console]', m.text().slice(0, 160)); });
  await page.addInitScript(v => { window.__ADMIN = v; }, !!process.env.ADMIN);
  await page.goto('file://' + INDEX + '?qa=1#biz', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2500);
  // Plotly 스텁 — CDN 차단 환경(헤드리스)에서 차트 자리를 layout.height로 채워 실앱과 같은 높이를 만든다(값·로직 무접촉)
  await page.evaluate(() => {
    window.Plotly = {
      newPlot: (el, d, l) => { const n = (typeof el === 'string') ? document.getElementById(el) : el; if (n) { n.classList.add('js-plotly-plot'); n.innerHTML = '<div style="height:' + ((l && l.height) || 300) + 'px;background:rgba(74,77,231,.06)"></div>'; } return Promise.resolve(); },
      react: (...a) => window.Plotly.newPlot(...a),
      relayout: () => Promise.resolve(), purge: () => {}, Plots: { resize: () => {} },
    };
  });
  await page.evaluate(({ MASTER, ROUNDS, DAILY, EX_MASTER, EX_DAILY, PGS, OPS }) => {
    const mk = (sheet, rows) => ({ sheet, headers: rows.length ? Object.keys(rows[0]) : [], rows, count: rows.length });
    _salesState.master = mk('공연마스터', MASTER);
    _salesState.rounds = mk('회차상세', ROUNDS);
    _salesState.daily = mk('일일입력', DAILY);
    _salesState.ops = mk('세부운영관리대장(정리)', OPS);
    _salesState.group = mk('운영_단체', []);
    _salesState._opsIdx = null;
    _bizState.raw = mk('세부운영관리대장(정리)', OPS);
    if (typeof _anaState !== 'undefined' && _anaState) { _anaState._exMaster = mk('전시마스터', EX_MASTER); _anaState._exDaily = mk('전시일일', EX_DAILY); }
    PERFS = PGS;
    _perfReady = true;
    if (window.__ADMIN) { try { userRole = 'admin'; } catch (e) {} }
    if (typeof setMainView === 'function') setMainView('biz');
    _srailRender();
  }, { MASTER, ROUNDS, DAILY, EX_MASTER, EX_DAILY, PGS, OPS });
  await page.waitForTimeout(1500);
  if (PAGE !== 1) { await page.evaluate(p => _bizmTo(p), PAGE); await page.waitForTimeout(1800); }
  const CLICKS = +(process.env.CLICKS || 0);
  for (let c = 0; c < CLICKS; c++) { await page.click('#bizm-dots-row .nav:last-child'); await page.waitForTimeout(1200); }
  await page.waitForTimeout(600);
  if (process.env.GUIDE) {
    // [전후] 증빙 가이드선 — 빨강 = 좌 박스 마지막 흰 카드 하단선 · 초록 = 우 박스 마지막 흰 카드 하단선
    await page.evaluate(() => {
      const last = sel => { const cs = document.querySelectorAll(sel); return cs[cs.length - 1] || null; };
      const draw = (y, color) => { const d = document.createElement('div'); d.style.cssText = `position:fixed;left:0;right:0;top:${y}px;height:0;border-top:2px dashed ${color};z-index:2147483647;pointer-events:none`; document.body.appendChild(d); };
      const l = last('#biz-main .bizm-card'), r = last('#rail-yrm .bizm-card');
      if (l) draw(l.getBoundingClientRect().bottom, '#E24B4A');
      if (r) draw(r.getBoundingClientRect().bottom, '#1A6B3C');
    });
    await page.waitForTimeout(200);
  }
  const tag = process.env.TAG || ('p' + PAGE);
  await page.screenshot({ path: join(OUT, `${tag}.png`), fullPage: process.env.VIEWPORT_ONLY ? false : true });
  const dbg = await page.evaluate(() => {
    let err='';
    try{ _srailUhaShow(0); }catch(e){ err=String(e); }
    return {n:_uhaCar.list.length, idx:_uhaCar.idx, err, bodyLen:(document.getElementById('srail-uha-body')||{}).innerHTML?.length};
  });
  console.log('DBG', JSON.stringify(dbg));
  await page.waitForTimeout(400);
  const info = await page.evaluate(() => {
    const rect = s => { const e = document.querySelector(s); if (!e || e.offsetParent === null) return null; const r = e.getBoundingClientRect(); return { t: +r.top.toFixed(1), b: +r.bottom.toFixed(1), h: +r.height.toFixed(1), l: +r.left.toFixed(1), r: +r.right.toFixed(1) }; };
    return {
      page: _bizmState.page, wide: _bizBookWide(),
      leftBox: rect('#biz-main [data-bizmbox]'), rightBox: rect('#rail-yrm [data-bizmbox]'),
      srail: rect('#sales-rail .srail'),
      leftLastCard: (() => { const cs = document.querySelectorAll('#biz-main .bizm-card'); const e = cs[cs.length - 1]; if (!e) return null; const r = e.getBoundingClientRect(); return { t: +r.top.toFixed(1), b: +r.bottom.toFixed(1), h: +r.height.toFixed(1) }; })(),
      rightLastCard: (() => { const cs = document.querySelectorAll('#rail-yrm .bizm-card'); const e = cs[cs.length - 1]; if (!e) return null; const r = e.getBoundingClientRect(); return { t: +r.top.toFixed(1), b: +r.bottom.toFixed(1), h: +r.height.toFixed(1) }; })(),
      dots: rect('#bizm-dots-row'),
      docH: document.documentElement.scrollHeight,
      z: (function(){var b=document.getElementById('body-wrap');return b?(b.getBoundingClientRect().width/b.offsetWidth):1})(),
      probe: (function(){
        var box=document.querySelector('#rail-yrm [data-bizmbox]'); if(!box) return null;
        var kids=[...box.children].map(function(c){var r=c.getBoundingClientRect();var cs=getComputedStyle(c);return {tag:c.tagName+'.'+(c.className||c.id), h:+r.height.toFixed(1), b:+r.bottom.toFixed(1), mb:cs.marginBottom, mt:cs.marginTop, disp:cs.display};});
        var cs=getComputedStyle(box);
        var u=document.getElementById('srail-uha'), ur=u?u.getBoundingClientRect():null, ucs=u?getComputedStyle(u):null;
        var slot=document.getElementById('rail-yrm-uha'), scs=slot?getComputedStyle(slot):null;
        return {pad:cs.padding, kids:kids, uha:u?{on:u.getAttribute('data-on'),disp:ucs.display,h:+ur.height.toFixed(1),mt:ucs.marginTop,html:u.innerHTML.slice(0,600)}:null, slot:scs?{disp:scs.display,pt:scs.paddingTop,lh:scs.lineHeight}:null};
      })(),
    };
  });
  console.log(JSON.stringify(info, null, 1));
  await browser.close();
}
main().catch(e => { console.error('ERR', e); process.exit(1); });
