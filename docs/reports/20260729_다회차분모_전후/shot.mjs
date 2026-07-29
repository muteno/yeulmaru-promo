// 진행 중인 프로그램(판매 현황) 표 — 다회차 분모 실측 하네스
// 실데이터 미접촉: ?qa=1(실API 차단) 위에 화면용 픽스처를 _salesState/PERFS로 직주입해 렌더만 시킨다.
import pw from 'playwright-core';
const { chromium } = pw;

const OUT = process.argv[2] || 'shot.png';
const URL = 'https://localhost:8766/index.html?qa=1';

// 스크린샷 재현 픽스처 — 공연마스터·운영대장 미등재(m=null, ops=null) + 프로그램 시트만 있는 공연들.
const FIX = [
  { n: '브런치 콘서트 III <현 위로 흐르는 시간>', s: '2026-09-03', e: '2026-09-03', g: '클래식',        seat: 288 },
  { n: '여수세계섬박람회 기념 음악회',              s: '2026-09-10', e: '2026-09-10', g: '기타',          seat: null },
  { n: '조재혁 피아노 리사이틀',                    s: '2026-09-12', e: '2026-09-12', g: '클래식',        seat: 97  },
  { n: '뮤지컬 <그날들>',                           s: '2026-09-18', e: '2026-09-20', g: '뮤지컬',        seat: 921 },
  { n: '뮤지컬 <달 샤베트>',                        s: '2026-10-01', e: '2026-10-03', g: '뮤지컬(어린이)', seat: 938 },
  { n: '다비드 바뱅 & 아드리앙 몽도 <시야>',        s: '2026-10-27', e: '2026-10-27', g: '클래식',        seat: 19  },
  { n: '뮤지컬 <러커스 더 스쿨>',                   s: '2026-11-26', e: '2026-11-28', g: '뮤지컬',        seat: 140 },
];

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--disable-features=HttpsUpgrades,HttpsFirstBalancedMode,HttpsFirstModeV2','--no-proxy-server'] });
const pg = await b.newPage({ viewport: { width: 1600, height: 1100 }, deviceScaleFactor: 2, ignoreHTTPSErrors: true });
pg.on('console', m => { if (m.type() === 'error') console.log('[console.error]', m.text()); });
await pg.goto(URL, { waitUntil: 'domcontentloaded' });
await pg.waitForFunction(() => typeof window._salesBuild === 'function' && document.getElementById('rail-yrm'), null, { timeout: 30000 });

const report = await pg.evaluate((FIX) => {
  // 프로그램 시트(PERFS) — 판매기간은 넉넉히(판매중 판정), 공연기간 s~e가 회차 추정 소스
  PERFS = FIX.map((f, i) => ({
    s: f.s, e: f.e, n: f.n, f: f.n, t: 'c', o: 1,
    ss: '2026-01-01', se: '2026-12-31', ps: '2026-01-01', pf: 'Y',
    m: '', l: '대극장', u: '', id: 'PG' + (i + 1), g: f.g,
  }));
  window._perfReady = true;

  // 운영_일일입력 — 최근 7일 누적(추이 막대 소스). 마스터·운영대장은 빈 시트 = 미등재 공연.
  const daily = [];
  FIX.forEach((f, i) => {
    if (f.seat == null) return;
    for (let d = 6; d >= 0; d--) {
      const dt = new Date(2026, 6, 29 - d);
      const bd = dt.getFullYear() * 10000 + (dt.getMonth() + 1) * 100 + dt.getDate();
      const cum = Math.round(f.seat * (1 - d * 0.03));
      daily.push({ 기준일자: bd, 공연명: f.n, 공연ID: 'PG' + (i + 1), 합계좌석: cum, 합계금액: cum * 30000, '전일대비(석)': '' });
    }
  });
  _salesState.master = { rows: [] };
  _salesState.rounds = { rows: [] };
  _salesState.ops = { rows: [] };
  _salesState.group = { rows: [] };
  _salesState.daily = { rows: daily };
  _salesState._opsIdx = null;
  _salesState.exhib = _salesState.exhib || { rows: [] };
  _salesState.exdaily = _salesState.exdaily || { rows: [] };

  _srailRender();

  return _salesBuild().filter(p => p.status === 'active').map(p => ({
    name: p.name, seats: p.seats, totalOpen: p.totalOpen,
    occ: Math.round(p.occ), rc: p._rcEst, rcSrc: p._rcSrc, openSrc: p._openSrc,
  }));
}, FIX);

console.log(JSON.stringify(report, null, 1));
await pg.waitForTimeout(1200);
const el = await pg.$('#rail-yrm');
await el.screenshot({ path: OUT });
await b.close();
