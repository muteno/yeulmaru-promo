#!/usr/bin/env node
// 콘텐츠 제작 드롭다운 — 상위 분류(이미지 편집·영상 편집) 드릴인 실측 + 전·후 촬영.
// 실코드(_contentMenuBuild·_ctSubBuild·_ddDrill·_ddPanel)를 실앱 CSS 위에서 그대로 돌린다.
// 실행: node tools/scratch/shot_contentmenu_ba.mjs   (환경: CM_BEFORE=전 파일 경로 — 지정 시 「전」도 촬영)
import { existsSync, readdirSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'docs', 'reports', '260805_콘텐츠제작_메뉴재배치_전후');
mkdirSync(OUT, { recursive: true });

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

async function boot(chromium, exe, url) {
  const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 900, height: 1000 }, deviceScaleFactor: 2 });
  await ctx.route('**', r => (r.request().url().startsWith('file:') ? r.continue() : r.abort()));
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String((e && e.stack) || e).split('\n')[0]));
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2200);
  return { browser, page, errs };
}

// _ddOpen과 같은 순서로 메뉴를 세운다: 패널 실측 → 메뉴 폭·높이 고정(.dd-panel = absolute+opacity0라 이 고정이 없으면 빈 상자가 찍힌다).
// #dd-pop 오버레이도 함께 만든다 — _ddDrill이 m._anchor로 좌측 클램프를 계산하기 때문(실경로와 같은 조건).
async function drawMenu(page) {
  await page.evaluate(() => {
    const l = document.getElementById('login'); if (l) l.style.display = 'none';
    const anchor = document.querySelector('.nav-btn') || document.body;
    const m = document.createElement('div'); m.id = 'dd-pop'; m.dataset.owner = 'content';
    m.style.cssText = 'position:fixed;top:56px;left:0;right:0;bottom:0;z-index:99999;background:transparent';
    const menu = document.createElement('div'); menu.className = 'dd-menu'; menu.id = 'shot-menu';
    menu.style.cssText = 'position:fixed;top:60px;left:40px;max-width:94vw;background:var(--glass-menu);backdrop-filter:blur(9px) saturate(150%);-webkit-backdrop-filter:blur(9px) saturate(150%);border:1px solid rgba(0,0,0,0.06);border-radius:14px;box-shadow:0 16px 48px rgba(74,77,231,0.18),0 4px 14px rgba(0,0,0,0.08);overflow:hidden';
    const panel = _ddPanel(_contentMenuBuild, 210);
    menu.appendChild(panel); m.appendChild(menu); document.body.appendChild(m);
    menu.style.width = panel.offsetWidth + 'px'; menu.style.height = panel.offsetHeight + 'px';
    panel.classList.add('is-active');
    m._menu = menu; m._anchor = anchor;
  });
  await page.waitForTimeout(400);
  return page.evaluate(() => {
    const r = document.getElementById('shot-menu').getBoundingClientRect();
    return { x: Math.max(0, r.x - 24), y: Math.max(0, r.y - 24), width: r.width + 48, height: r.height + 48 };
  });
}

const labels = page => page.evaluate(() => {
  const p = document.querySelector('#shot-menu .dd-panel.is-active');
  return { items: [...p.querySelectorAll('button')].map(b => b.textContent.trim()) };
});

async function main() {
  const { chromium } = await import('playwright-core');
  const exe = findChromium();
  if (!exe) { console.error('chromium 없음'); return 1; }
  const fails = [];
  const ok = (c, m) => { if (!c) fails.push(m); };

  const A = await boot(chromium, exe, 'file://' + join(ROOT, 'index.html'));

  // ① 상위 패널 — 6항목 · 이미지/영상 편집은 하위 표시(›)
  let box = await drawMenu(A.page);
  const top = await labels(A.page);
  ok(JSON.stringify(top.items) === JSON.stringify(['카카오채널 톡', '블로그·카페 포스팅', '이미지 편집›', '영상 편집›', '파일 용량 줄이기', '도화지']),
    '상위 항목·순서 불일치: ' + JSON.stringify(top.items));
  await A.page.screenshot({ path: join(OUT, '후1_상위_SNS_Edit_Utility.png'), clip: box });

  // ② 드릴인 — 「이미지 편집」 클릭 = 카드 제작 · 누끼따기 (되돌아가기 머리줄 포함)
  await A.page.evaluate(() => [...document.querySelectorAll('#shot-menu button')].find(b => b.textContent.includes('이미지 편집')).click());
  await A.page.waitForTimeout(700);
  const img = await labels(A.page);
  ok(JSON.stringify(img.items) === JSON.stringify(['‹ 콘텐츠 제작', '카드 제작', '누끼따기']), '이미지 편집 하위 불일치: ' + JSON.stringify(img.items));
  box = await A.page.evaluate(() => { const r = document.getElementById('shot-menu').getBoundingClientRect(); return { x: Math.max(0, r.x - 24), y: Math.max(0, r.y - 24), width: r.width + 48, height: r.height + 48 }; });
  await A.page.screenshot({ path: join(OUT, '후2_하위_이미지편집.png'), clip: box });
  ok(await A.page.evaluate(() => document.querySelectorAll('#shot-menu .dd-panel').length <= 2), '퇴장 패널 미정리(누적)');

  // ③ 되돌아가기 — 상위 6항목 복귀
  await A.page.evaluate(() => [...document.querySelectorAll('#shot-menu .dd-panel.is-active button')].find(b => b.textContent.includes('‹')).click());
  await A.page.waitForTimeout(700);
  const back = await labels(A.page);
  ok(back.items.length === 6 && back.items[0] === '카카오채널 톡', '되돌아가기 실패: ' + JSON.stringify(back.items));

  // ④ 드릴인 — 「영상 편집」 = 3분류 전건
  await A.page.evaluate(() => [...document.querySelectorAll('#shot-menu .dd-panel.is-active button')].find(b => b.textContent.includes('영상 편집')).click());
  await A.page.waitForTimeout(700);
  const vid = await labels(A.page);
  ok(JSON.stringify(vid.items) === JSON.stringify(['‹ 콘텐츠 제작', '1. 영상 편집', '2. 자막 삽입', '3. 영상 프롬프팅']), '영상 편집 하위 불일치: ' + JSON.stringify(vid.items));
  box = await A.page.evaluate(() => { const r = document.getElementById('shot-menu').getBoundingClientRect(); return { x: Math.max(0, r.x - 24), y: Math.max(0, r.y - 24), width: r.width + 48, height: r.height + 48 }; });
  await A.page.screenshot({ path: join(OUT, '후3_하위_영상편집.png'), clip: box });

  // ⑤ 모바일 아코디언 — 뷰포트 없음 = 인라인 나열(도구 전건 노출 · 드릴인 버튼 0)
  const accItems = await A.page.evaluate(() => {
    const d = document.createElement('div'); d.className = 'nav-acc-panel'; document.body.appendChild(d);
    _contentMenuBuild(d);
    const t = [...d.querySelectorAll('button')].map(b => b.textContent.trim());
    const drill = d.innerHTML.includes('_ddDrill'); d.remove();
    return { t, drill };
  });
  ok(!accItems.drill, '아코디언에 드릴인 버튼 잔존(모바일에선 열 수 없다)');
  ok(['카드 제작', '누끼따기', '1. 영상 편집', '2. 자막 삽입', '3. 영상 프롬프팅'].every(x => accItems.t.includes(x)),
    '아코디언 도구 누락: ' + JSON.stringify(accItems.t));

  // ⑥ 숨김 잔존 0(상위·하위·아코디언 통틀어) + 더보기 시트 동기화
  ok(!accItems.t.some(t => /한글문서|오피스|마크다운|링크 자료|에니어그램|로고/.test(t)), '숨김 대상 잔존');
  const sheet = await A.page.evaluate(() => {
    try { _bnavMore(); } catch (e) { return { err: String(e) }; }
    const t = [...document.querySelectorAll('.bn-sheet-item')].map(b => b.textContent.trim());
    const bg = document.querySelector('.bn-sheet-bg'); if (bg) bg.remove();
    return { t };
  });
  ok(!sheet.err, '더보기 시트 렌더 오류: ' + sheet.err);
  if (sheet.t) {
    ok(sheet.t.some(x => x.includes('블로그·카페 포스팅')), '더보기: 블로그·카페 포스팅 없음');
    ok(!sheet.t.some(x => /링크 자료수집|에니어그램/.test(x)), '더보기: 숨김 대상 잔존');
  }
  const errsA = A.errs.filter(e => /ReferenceError|SyntaxError|is not defined|is not a function/.test(e));
  if (errsA.length) fails.push('pageerror: ' + errsA.join(' | '));
  await A.browser.close();

  // ── 전(origin/main 서빙본) 촬영 ──
  const BEFORE = process.env.CM_BEFORE;
  if (BEFORE && existsSync(BEFORE)) {
    const B = await boot(chromium, exe, 'file://' + BEFORE);
    const b = await drawMenu(B.page);
    await B.page.screenshot({ path: join(OUT, '전2_이미지편집_도구1개.png'), clip: b });
    await B.browser.close();
  } else console.log('(전 촬영 생략 — CM_BEFORE 미지정)');

  if (fails.length) { console.error('FAIL ' + fails.length + '건:'); fails.forEach(f => console.error('  - ' + f)); return 1; }
  console.log('PASS — 상위 6항목(이미지·영상 편집 = 하위 보유 ›) · 드릴인 이미지2/영상3 · 되돌아가기 · 아코디언 인라인 · 숨김 잔존 0 · pageerror 0');
  return 0;
}
main().then(c => process.exit(c)).catch(e => { console.error('shot 오류: ' + String(e && e.stack || e)); process.exit(1); });
