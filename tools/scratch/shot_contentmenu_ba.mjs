#!/usr/bin/env node
// 콘텐츠 제작 드롭다운 재배치(SNS/Edit/Utility) 전·후 실측 — 실코드 빌더(_contentMenuBuild + _ddPanel)를
// 실앱 CSS 위에서 그대로 그려 촬영 + 항목·순서·숨김 DOM 검증. 「전」 = git show origin/main:index.html 서빙본.
// 실행: node tools/scratch/shot_contentmenu_ba.mjs  (환경: CM_BEFORE=전 파일 경로)
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

// 실코드 경로로 메뉴를 그려 놓고 좌표 반환 — .dd-panel은 absolute+opacity0이라 _ddOpen처럼 「패널 실측 → 메뉴 폭·높이 고정」이 필수(L4855 자구).
async function drawMenu(page) {
  const box = await page.evaluate(() => {
    const l = document.getElementById('login'); if (l) l.style.display = 'none';
    const menu = document.createElement('div'); menu.className = 'dd-menu'; menu.id = 'shot-menu';
    menu.style.cssText = 'position:fixed;top:60px;left:40px;max-width:94vw;background:var(--glass-menu);backdrop-filter:blur(9px) saturate(150%);-webkit-backdrop-filter:blur(9px) saturate(150%);border:1px solid rgba(0,0,0,0.06);border-radius:14px;box-shadow:0 16px 48px rgba(74,77,231,0.18),0 4px 14px rgba(0,0,0,0.08);overflow:hidden';
    const panel = _ddPanel(_contentMenuBuild, 210);
    menu.appendChild(panel); document.body.appendChild(menu);
    menu.style.width = panel.offsetWidth + 'px'; menu.style.height = panel.offsetHeight + 'px';
    panel.classList.add('is-active');
    const r = menu.getBoundingClientRect();
    return { x: r.x - 24, y: r.y - 24, w: r.width + 48, h: r.height + 48 };
  });
  await page.waitForTimeout(400);   // 패널 opacity 전이(.18s) + 폰트 안정 대기
  return box;
}

async function main() {
  const { chromium } = await import('playwright-core');
  const exe = findChromium();
  if (!exe) { console.error('chromium 없음'); return 1; }
  const fails = [];
  const ok = (c, m) => { if (!c) fails.push(m); };

  // ── 후(작업본): DOM 검증 + 촬영 ──
  const A = await boot(chromium, exe, 'file://' + join(ROOT, 'index.html'));
  const box = await drawMenu(A.page);
  const dom = await A.page.evaluate(() => {
    const m = document.getElementById('shot-menu');
    const items = [...m.querySelectorAll('button')].map(b => b.textContent.trim());
    const labels = [...m.querySelectorAll('div[style]')].map(d => d.textContent.trim()).filter(t => t && t.length < 20);
    return { items, labels };
  });
  ok(JSON.stringify(dom.items) === JSON.stringify(['카카오채널 톡', '블로그·카페 포스팅', '이미지 편집', '영상 편집', '파일 용량 줄이기', '도화지']),
    '항목·순서 불일치: ' + JSON.stringify(dom.items));
  ok(['SNS', 'Edit', 'Utility'].every(s => dom.labels.includes(s)), '구획 라벨 누락: ' + JSON.stringify(dom.labels));
  ok(!dom.items.some(t => /한글문서|오피스|마크다운|링크 자료|누끼|에니어그램|자막|프롬프팅|로고/.test(t)), '숨겨야 할 항목 잔존');
  await A.page.screenshot({ path: join(OUT, '후_SNS_Edit_Utility.png'), clip: { x: box.x, y: box.y, width: box.w, height: box.h } });

  // 모바일 더보기 시트 동기화 검증
  const sheet = await A.page.evaluate(() => {
    try { _bnavMore(); } catch (e) { return { err: String(e) }; }
    const t = [...document.querySelectorAll('.bn-sheet-item')].map(b => b.textContent.trim());
    const bg = document.querySelector('.bn-sheet-bg'); if (bg) bg.remove();
    return { t };
  });
  ok(!sheet.err, '더보기 시트 렌더 오류: ' + sheet.err);
  if (sheet.t) {
    ok(sheet.t.some(x => x.includes('블로그·카페 포스팅')), '더보기: 블로그·카페 포스팅 없음');
    ok(!sheet.t.some(x => /링크 자료수집|에니어그램/.test(x)), '더보기: 숨김 대상 잔존 ' + JSON.stringify(sheet.t));
    ok(sheet.t.some(x => x.includes('도화지')), '더보기: 도화지 없음');
  }
  const errsA = A.errs.filter(e => /ReferenceError|SyntaxError|is not defined|is not a function/.test(e));
  if (errsA.length) fails.push('pageerror: ' + errsA.join(' | '));
  await A.browser.close();

  // ── 전(origin/main 서빙본): 같은 문법 촬영 ──
  const BEFORE = process.env.CM_BEFORE;
  if (BEFORE && existsSync(BEFORE)) {
    const B = await boot(chromium, exe, 'file://' + BEFORE);
    const b = await drawMenu(B.page);
    await B.page.screenshot({ path: join(OUT, '전_14항목.png'), clip: { x: b.x, y: b.y, width: b.w, height: b.h } });
    await B.browser.close();
  } else console.log('(전 촬영 생략 — CM_BEFORE 미지정)');

  if (fails.length) { console.error('FAIL ' + fails.length + '건:'); fails.forEach(f => console.error('  - ' + f)); return 1; }
  console.log('PASS — 드롭다운 = 콘텐츠 제작 헤더 + SNS(2)·Edit(2)·Utility(2), 숨김 잔존 0 · 더보기 시트 동기화 · pageerror 0');
  return 0;
}
main().then(c => process.exit(c)).catch(e => { console.error('shot 오류: ' + String(e && e.stack || e)); process.exit(1); });
