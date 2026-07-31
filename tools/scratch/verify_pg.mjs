// 플레이그라운드 검증 — 로드·조작·반영까지 (규칙 §4: "만져짐"까지 확인)
import { chromium } from 'playwright-core';
const URL = 'file:///home/user/yeulmaru-promo/docs/reports/260731_대관캘린더표기_플레이그라운드.html';
const SHOT = '/home/user/yeulmaru-promo/docs/reports/';

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage({ viewport: { width: 1500, height: 1080 }, deviceScaleFactor: 2 });
const errs = [];
p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
await p.goto(URL, { waitUntil: 'networkidle' });

const ok = (n, c) => console.log((c ? '✅' : '❌') + ' ' + n);

// ① 로드·축 수
const axText = await p.textContent('#axcnt');
const nAx = +axText.match(/\d+/)[0];
ok(`축 ${nAx}개 (50축 이상 규칙)`, nAx >= 50);

// ② 현행 프리셋 = 셀 렌더됨
await p.click('.mbtn[data-mo="9"]');
const cells = await p.$$eval('#grid .cell', e => e.length);
ok(`셀 42칸 렌더 (${cells})`, cells === 42);

// ③ 현행 상태 = 태그 살아있고 전시 2줄
const before = await p.evaluate(() => ({
  txt: [...document.querySelectorAll('#grid .pname')].map(e => e.textContent),
  lanes: document.querySelectorAll('#grid .cell:nth-child(20) .exline i').length,
  badges: document.querySelectorAll('#grid .perf-badge').length,
}));
ok('현행 = 원문 태그 [대][기획] 노출', before.txt.some(t => t.includes('[')));
const cur = await p.evaluate(() => ({
  setup: document.querySelectorAll('#grid .perf-badge.setup').length,
  labels: [...new Set([...document.querySelectorAll('#grid .bdot')].map(e => e.textContent))],
  bg: [...new Set([...document.querySelectorAll('#grid .bdot')].map(e => getComputedStyle(e).backgroundColor))],
}));
ok(`현행 = 셋업 구분 없음 (${cur.setup}개)`, cur.setup === 0);
ok(`현행 = 라벨 전부 「대」 (${cur.labels})`, cur.labels.length === 1 && cur.labels[0] === '대');
ok(`현행 = 색 전부 무채색 1종 (${cur.bg})`, cur.bg.length === 1);
ok(`현행 = 전시 레인 2줄 (${before.lanes})`, before.lanes === 2);
await p.screenshot({ path: SHOT + '260731_대관캘린더표기_전.png', clip: { x: 20, y: 120, width: 1000, height: 760 } });

// ④ 프리셋 클릭 → 실제로 바뀌나 (= 만져짐)
await p.click('.pill[data-p="p1"]');
await p.waitForTimeout(120);
const after = await p.evaluate(() => ({
  txt: [...document.querySelectorAll('#grid .pname')].map(e => e.textContent),
  lanes: document.querySelectorAll('#grid .cell:nth-child(20) .exline i').length,
  setup: document.querySelectorAll('#grid .perf-badge.setup').length,
  dots: [...document.querySelectorAll('#grid .perf-badge.setup .bdot')].map(e => e.textContent),
  badges: document.querySelectorAll('#grid .perf-badge').length,
}));
ok('지시안 = 태그 제거됨(공연명만)', !after.txt.some(t => t.includes('[')));
ok(`지시안 = 전시 레인 3줄 (${after.lanes})`, after.lanes === 3);
ok(`지시안 = 「셋」 배지 ${after.setup}개`, after.setup > 0 && after.dots.every(d => d === '셋'));
await p.screenshot({ path: SHOT + '260731_대관캘린더표기_후.png', clip: { x: 20, y: 120, width: 1000, height: 760 } });

// ⑤ 슬라이더 조작 → CSS 변수 반영
await p.$eval('input[data-k="bsz"]', el => { el.value = 22; el.dispatchEvent(new Event('input', { bubbles: true })); });
const bsz = await p.$eval('#app', el => getComputedStyle(el).getPropertyValue('--t-bsz').trim());
ok(`슬라이더 → CSS 변수 반영 (--t-bsz=${bsz})`, bsz === '22px');

// ⑥ 셀렉트 조작 → 색 반영
await p.selectOption('select[data-k="cR"]', 'var(--c5)');
const bg = await p.$eval('#grid .perf-badge:not(.setup) .bdot', el => getComputedStyle(el).backgroundColor);
ok(`셀렉트 → 배지색 반영 (${bg})`, bg !== 'rgba(0, 0, 0, 0)');

// ⑦ 기틀 이탈 카운터 + 복사 알림창
const devTxt = await p.textContent('#devcnt');
ok(`기틀 이탈 카운터 작동 (${devTxt.trim()})`, /이탈/.test(devTxt));
await p.click('#copy');
await p.waitForTimeout(100);
ok('이탈 시 역제안 알림창 뜸', await p.isVisible('#mask.on'));
await p.click('#copyCancel');

// ⑧ 월 전환
for (const mo of [7, 10, 12]) {
  await p.click(`.mbtn[data-mo="${mo}"]`);
  const n = await p.$$eval('#grid .perf-badge', e => e.length);
  ok(`${mo}월 전환 — 배지 ${n}개`, n > 0);
}

// ⑨ 셋업 판정 실측 — 9월 그날들
await p.click('.pill[data-p="p1"]');
await p.click('.mbtn[data-mo="9"]');
const gn = await p.evaluate(() => {
  const out = {};
  document.querySelectorAll('#grid .cell').forEach(c => {
    const d = c.querySelector('.dn').firstChild.textContent.trim();
    c.querySelectorAll('.perf-badge').forEach(b => {
      if (b.title.includes('그날들')) out[d] = b.querySelector('.bdot').textContent;
    });
  });
  return out;
});
console.log('   그날들 9/14~21 →', JSON.stringify(gn));
const want = { '14': '셋', '15': '셋', '16': '셋', '17': '셋', '18': '공', '19': '공', '20': '공', '21': '셋' };
ok('그날들 셋업/공연 판정 = 제목과 일치', JSON.stringify(gn) === JSON.stringify(want));

console.log(errs.length ? '\n❌ 콘솔 에러:\n' + errs.join('\n') : '\n✅ 콘솔 에러 0');
await b.close();
