#!/usr/bin/env node
// 진행 중인 프로그램(#rail-yrm) 렌더 영수증 — QA경로(?qa=1#biz)에 대표데이터를 심어 헤드리스로 1장 렌더.
// 실행: node tools/scratch/render_rail_yrm.mjs /tmp/out.png   (의존 = playwright-core + /opt/pw-browsers chromium)
// 대표데이터 = 최악케이스: 다회차(총오픈석 1회차분 → ×회차 보정)·단회차·회차합산·회차미입력(기간추정)·집계전(0석)·5자리 숫자·최장 프로그램명/장소명.
import { existsSync, readdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const ROOT = '/home/user/yeulmaru-promo';
const OUT = process.argv[2] || '/tmp/shot.png';

function findChromium() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  for (const d of readdirSync(base)) {
    if (d.startsWith('chromium-') && !d.includes('headless')) {
      const p = `${base}/${d}/chrome-linux/chrome`;
      if (existsSync(p)) return p;
    }
  }
  return null;
}

// ── 대표데이터(최악케이스): 다회차·단회차·최장이름·최대자릿수·0/빈·경계값
const TODAY = new Date(); TODAY.setHours(0, 0, 0, 0);
const iso = d => d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
const ymd = d => d.getFullYear() + '' + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2);
const off = n => { const d = new Date(TODAY); d.setDate(d.getDate() + n); return d; };

const SEED = {
  // 공연마스터
  master: [
    // ① 다회차(회차상세 6행 = 3일 6회) · 총오픈석 = 1회차 기준(926) → ×6 보정 대상
    { ID: 'P001', 사업명: '뮤지컬 〈레미제라블〉 25주년 기념 내한공연 오리지널 팀', 기준석: 926, 총회차: 6, 총오픈석: 926, 목표점유율: 65, 수익성: '상업', 티켓오픈일: iso(off(-30)), 시작일: iso(off(-2)), 종료일: iso(off(6)), 상태: '판매중' },
    // ② 단회차(1일 1회)
    { ID: 'P002', 사업명: '예울마루 상설 클래식', 기준석: 926, 총회차: 1, 총오픈석: 926, 목표점유율: 50, 수익성: '공공', 티켓오픈일: iso(off(-20)), 시작일: iso(off(3)), 종료일: iso(off(3)), 상태: '판매중' },
    // ③ 다회차 · 회차별 오픈석 합산(rseat) 경계
    { ID: 'P003', 사업명: '어린이 인형극', 기준석: 300, 총회차: 4, 총오픈석: null, 목표점유율: 40, 수익성: '공공', 티켓오픈일: iso(off(-10)), 시작일: iso(off(1)), 종료일: iso(off(2)), 상태: '판매중' },
    // ④ 집계 전(0석) · 회차 미입력(기간 폴백)
    { ID: 'P004', 사업명: '하반기 기획공연', 기준석: 926, 총회차: null, 총오픈석: null, 목표점유율: 50, 수익성: '상업', 티켓오픈일: iso(off(-1)), 시작일: iso(off(20)), 종료일: iso(off(24)), 상태: '판매중' },
    // ⑤ 최악케이스 — 5자리/5자리 · 회차 12 · 장소명 최장
    { ID: 'P005', 사업명: '대형 야외 페스티벌', 기준석: 3200, 총회차: 12, 총오픈석: 38400, 목표점유율: 70, 수익성: '상업', 티켓오픈일: iso(off(-40)), 시작일: iso(off(-3)), 종료일: iso(off(9)), 상태: '판매중' },
  ],
  // 회차상세(ID · 공연일 · 오픈좌석)
  rounds: [
    { ID: 'P001', 공연일: iso(off(-2)), 오픈좌석: null }, { ID: 'P001', 공연일: iso(off(-2)), 오픈좌석: null },
    { ID: 'P001', 공연일: iso(off(-1)), 오픈좌석: null }, { ID: 'P001', 공연일: iso(off(-1)), 오픈좌석: null },
    { ID: 'P001', 공연일: iso(off(0)), 오픈좌석: null }, { ID: 'P001', 공연일: iso(off(6)), 오픈좌석: null },
    { ID: 'P002', 공연일: iso(off(3)), 오픈좌석: 926 },
    ...[-3,-3,-2,-2,-1,-1,0,0,1,1,9,9].map(n=>({ ID: 'P005', 공연일: iso(off(n)), 오픈좌석: null })),
    { ID: 'P003', 공연일: iso(off(1)), 오픈좌석: 300 }, { ID: 'P003', 공연일: iso(off(1)), 오픈좌석: 300 },
    { ID: 'P003', 공연일: iso(off(2)), 오픈좌석: 300 }, { ID: 'P003', 공연일: iso(off(2)), 오픈좌석: 300 },
  ],
  daily: [],
  ops: [],
  group: [],
};
// 일일입력 — 최근 7일 누적(추이 막대 소스)
[['뮤지컬 〈레미제라블〉 25주년 기념 내한공연 오리지널 팀', 'P001', [520, 610, 700, 812, 903, 1004, 1017]],
 ['예울마루 상설 클래식', 'P002', [40, 66, 90, 120, 151, 168, 172]],
 ['어린이 인형극', 'P003', [180, 260, 340, 430, 520, 610, 690]],
 ['대형 야외 페스티벌', 'P005', [22100, 23050, 24010, 25120, 26080, 27140, 28456]]].forEach(([nm, id, arr]) => {
  arr.forEach((v, i) => {
    SEED.daily.push({ 기준일자: ymd(off(i - 7)), 공연명: nm, 공연ID: id, 합계좌석: v, 합계금액: v * 42000, '전일대비(석)': i ? v - arr[i - 1] : v });
  });
});

const EX_MASTER = [
  { 전시ID: 'E001', 전시명: '앙리 마티스 LOVE & JAZZ 기획전 · 여수 장도 특별전', 연도: TODAY.getFullYear(), 시작일: iso(off(-40)), 종료일: iso(off(30)), 운영일수: 71, 목표관객: 3573, 목표금액: 30000000, 수익성: '상업', 상태: '진행중' },
  { 전시ID: 'E002', 전시명: '창작스튜디오 프리뷰전', 연도: TODAY.getFullYear(), 시작일: iso(off(-5)), 종료일: iso(off(12)), 운영일수: 18, 목표관객: 333, 목표금액: 1000000, 수익성: '공공', 상태: '진행중' },
];
const EX_DAILY = [];
[['E001', [4820, 5100, 5390, 5720, 6010, 6280, 6457], 3573], ['E002', [40, 78, 120, 168, 210, 260, 319], 333]].forEach(([id, arr, goal]) => {
  arr.forEach((v, i) => EX_DAILY.push({ 기준일자: ymd(off(i - 7)), 전시ID: id, 일일유료: i ? v - arr[i - 1] : v, 일일총인원: i ? v - arr[i - 1] : v, 누계유료: v, 누계무료: Math.round(v * 0.05), 누계총인원: Math.round(v * 1.05), 점유율: +(v / goal * 100).toFixed(1) }));
});

// 프로그램 시트(장소 l · 판매기간) — _venue 소스
const PGS = [
  { id: 'P001', f: '뮤지컬 〈레미제라블〉 25주년 기념 내한공연 오리지널 팀', n: '레미제라블', l: '대극장', t: 'c', g: '뮤지컬', s: iso(off(-2)), e: iso(off(6)), ss: iso(off(-30)), se: iso(off(6)) },
  { id: 'P002', f: '예울마루 상설 클래식', n: '상설 클래식', l: '소극장', t: 'c', g: '클래식', s: iso(off(3)), e: iso(off(3)), ss: iso(off(-20)), se: iso(off(3)) },
  { id: 'P003', f: '어린이 인형극', n: '인형극', l: '소극장', t: 'c', g: '아동', s: iso(off(1)), e: iso(off(2)), ss: iso(off(-10)), se: iso(off(2)) },
  { id: 'P004', f: '하반기 기획공연', n: '하반기', l: '대극장', t: 'c', g: '연극', s: iso(off(20)), e: iso(off(24)), ss: iso(off(-1)), se: iso(off(24)) },
  { id: 'P005', f: '대형 야외 페스티벌', n: '페스티벌', l: '해변 야외공연장(장도 특설무대)', t: 'c', g: '페스티벌', s: iso(off(-3)), e: iso(off(9)), ss: iso(off(-40)), se: iso(off(9)) },
  { id: 'E001', f: '앙리 마티스 LOVE & JAZZ 기획전 · 여수 장도 특별전', n: '마티스', l: '기획전시실', t: 'e', g: '전시', s: iso(off(-40)), e: iso(off(30)), ss: iso(off(-40)), se: iso(off(30)) },
  { id: 'E002', f: '창작스튜디오 프리뷰전', n: '프리뷰전', l: '전시실', t: 'e', g: '전시', s: iso(off(-5)), e: iso(off(12)), ss: iso(off(-5)), se: iso(off(12)) },
];

const errs = [];
const browser = await chromium.launch({ executablePath: findChromium(), headless: true, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1680, height: 1200 }, deviceScaleFactor: 2 });
await ctx.route('**', r => (r.request().url().startsWith('file:') ? r.continue() : r.abort()));
const page = await ctx.newPage();
page.on('pageerror', e => errs.push(String(e).split('\n')[0]));
await page.goto('file://' + ROOT + '/index.html?qa=1#biz', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(2500);

const info = await page.evaluate(({ SEED, EX_MASTER, EX_DAILY, PGS }) => {
  const mk = (sheet, rows) => ({ sheet, headers: rows.length ? Object.keys(rows[0]) : [], rows, count: rows.length });
  _salesState.master = mk('공연마스터', SEED.master);
  _salesState.rounds = mk('회차상세', SEED.rounds);
  _salesState.daily = mk('일일입력', SEED.daily);
  _salesState.ops = mk('운영대장', SEED.ops);
  _salesState.group = mk('운영_단체', SEED.group);
  _salesState._opsIdx = null;
  _anaState._exMaster = mk('전시마스터', EX_MASTER);
  _anaState._exDaily = mk('전시일일', EX_DAILY);
  PERFS = PGS;            // let 선언 = window 별칭 없음 → 직접 대입
  _perfReady = true;
  _srailRender();
  const perfs = _salesBuild().filter(p => p.status === 'active');
  return {
    rows: perfs.map(p => ({ name: p.name, seats: p.seats, totalOpen: p.totalOpen, occ: +p.occ.toFixed(1), _roundsN: p._roundsN, _rcEst: p._rcEst, _rcSrc: p._rcSrc, _openSrc: p._openSrc })),
    listHtml: (document.getElementById('rail-yrm-list') || {}).innerHTML ? 'ok' : 'EMPTY',
  };
}, { SEED, EX_MASTER, EX_DAILY, PGS });

await page.waitForTimeout(1200);
const el = await page.$('#rail-yrm');
if (el) await el.screenshot({ path: OUT });
else await page.screenshot({ path: OUT, fullPage: false });
console.log(JSON.stringify(info, null, 1));
if (errs.length) console.log('PAGE ERRORS:', errs.slice(0, 5));
await browser.close();
