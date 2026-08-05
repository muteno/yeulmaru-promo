#!/usr/bin/env node
// 콘텐츠 제작 — 「메뉴 안에 메뉴 없음」(한 겹 6항목) + 도구는 **모달 안 탭** 실측 + 촬영.
// 실코드(_contentMenuBuild·_ddPanel·openCardMaker·_cmTab·openVideoEditor)를 실앱 CSS 위에서 그대로 돌린다.
// 실행: node tools/scratch/shot_contentmenu_ba.mjs   (환경: CM_BEFORE=전 파일 경로 — 지정 시 「전」도 촬영)
import { existsSync, readdirSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';

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

// 서빙 조건 2가지가 강제된다:
//   ① 누끼따기는 디렉터리 인덱스(cutout/)로 임베드 — file://은 디렉터리를 못 연다(실측: contentDocument null).
//   ② index.html 머리의 http→https 강제 리다이렉트(L6) — 로컬 http 서버로 띄우면 페이지가 통째로 튕긴다(실측: 전역 전무).
// → 가상 https 호스트(app.local)를 라우트 이행으로 만들어 디스크에서 먹인다. 실서빙(GitHub Pages)과 같은 출처·프로토콜.
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.wasm': 'application/wasm', '.onnx': 'application/octet-stream' };
const HOST = 'https://app.local';

async function boot(chromium, exe, path, vw = 1280, vh = 900, diskRoot = ROOT, indexFile = null) {
  const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 2 });
  await ctx.route('**', r => {
    const u = new URL(r.request().url());
    if (u.hostname !== 'app.local') return r.abort();   // 외부(폰트 CDN·Worker API) = 차단 — 오프라인 결정성
    let f = join(diskRoot, decodeURIComponent(u.pathname));
    if (indexFile && (u.pathname === '/index.html' || u.pathname === '/')) f = indexFile;   // 「전」 촬영 = 옛 index.html만 갈아끼움(그 외 자원은 현 디스크)
    try { if (statSync(f).isDirectory()) f = join(f, 'index.html'); } catch { }
    if (!existsSync(f)) return r.fulfill({ status: 404, body: 'nf' });
    return r.fulfill({ status: 200, headers: { 'content-type': MIME[extname(f)] || 'application/octet-stream' }, body: readFileSync(f) });
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String((e && e.stack) || e).split('\n')[0]));
  await page.goto(HOST + path, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2200);
  return { browser, page, errs };
}

// _ddOpen과 같은 순서: 패널 실측 → 메뉴 폭·높이 고정(.dd-panel = absolute+opacity0 → 이 고정이 없으면 빈 상자가 찍힌다)
async function drawMenu(page) {
  await page.evaluate(() => {
    const l = document.getElementById('login'); if (l) l.style.display = 'none';
    const menu = document.createElement('div'); menu.className = 'dd-menu'; menu.id = 'shot-menu';
    menu.style.cssText = 'position:fixed;top:60px;left:40px;max-width:94vw;background:var(--glass-menu);backdrop-filter:blur(9px) saturate(150%);-webkit-backdrop-filter:blur(9px) saturate(150%);border:1px solid rgba(0,0,0,0.06);border-radius:14px;box-shadow:0 16px 48px rgba(74,77,231,0.18),0 4px 14px rgba(0,0,0,0.08);overflow:hidden';
    const panel = _ddPanel(_contentMenuBuild, 210);
    menu.appendChild(panel); document.body.appendChild(menu);
    menu.style.width = panel.offsetWidth + 'px'; menu.style.height = panel.offsetHeight + 'px';
    panel.classList.add('is-active');
  });
  await page.waitForTimeout(400);
  return page.evaluate(() => {
    const r = document.getElementById('shot-menu').getBoundingClientRect();
    return { x: Math.max(0, r.x - 24), y: Math.max(0, r.y - 24), width: r.width + 48, height: r.height + 48 };
  });
}

async function main() {
  const { chromium } = await import('playwright-core');
  const exe = findChromium();
  if (!exe) { console.error('chromium 없음'); return 1; }
  const fails = [];
  const ok = (c, m) => { if (!c) fails.push(m); };

  const A = await boot(chromium, exe, '/index.html');

  // ① 드롭다운 = 한 겹 6항목 · 하위 진입 표시(›)도, 드릴인 호출도 없어야 한다
  const box = await drawMenu(A.page);
  const menu = await A.page.evaluate(() => {
    const p = document.querySelector('#shot-menu .dd-panel.is-active');
    return { items: [...p.querySelectorAll('button')].map(b => b.textContent.trim()), html: p.innerHTML };
  });
  ok(JSON.stringify(menu.items) === JSON.stringify(['카카오채널 톡', '블로그·카페 포스팅', '이미지 편집', '영상 편집', '파일 용량 줄이기', '도화지']),
    '메뉴 항목·순서 불일치: ' + JSON.stringify(menu.items));
  ok(!/_ddDrill|›/.test(menu.html), '메뉴 안 메뉴 잔존(드릴인 호출 또는 › 표시)');
  ok(await A.page.evaluate(() => typeof _ddDrill === 'undefined'), '_ddDrill 함수 잔존(4차에서 철거 대상)');
  await A.page.screenshot({ path: join(OUT, '후4_메뉴_한겹6항목.png'), clip: box });
  await A.page.evaluate(() => { const m = document.getElementById('shot-menu'); if (m) m.remove(); });

  // ② 이미지 편집 = 모달 하나 · 안에 탭 2개(카드 제작·누끼따기)
  await A.page.evaluate(() => openCardMaker());
  await A.page.waitForTimeout(600);
  const cm = await A.page.evaluate(() => ({
    title: (document.querySelector('#cm-board .modal > div')?.textContent || '').slice(0, 40),
    tabs: [...document.querySelectorAll('#cm-tabs .prog-tab')].map(b => b.textContent.trim()),
    active: document.querySelector('#cm-tabs .prog-tab.active')?.dataset.t || '',
    cardShown: getComputedStyle(document.getElementById('cm-pane-card')).display !== 'none',
    frame: !!document.querySelector('#cm-pane-cut iframe'),
  }));
  ok(cm.title.includes('이미지 편집'), '모달 제목이 「이미지 편집」이 아님: ' + cm.title);
  ok(JSON.stringify(cm.tabs) === JSON.stringify(['1. 카드 제작', '2. 누끼따기']), '탭 불일치: ' + JSON.stringify(cm.tabs));
  ok(cm.active === 'card' && cm.cardShown, '기본 탭 = 카드 제작 아님');
  ok(!cm.frame, '누끼따기 임베드가 미리 생성됨(안 쓸 때도 모델 4.5MB를 받게 된다)');
  await A.page.screenshot({ path: join(OUT, '후5_모달_탭1_카드제작.png'), clip: { x: 0, y: 0, width: 1280, height: 900 } });

  // ③ 2번 탭 = 누끼따기 임베드 생성 + 카드 제작 본문 숨김
  await A.page.evaluate(() => _cmTab('cut'));
  await A.page.waitForTimeout(1500);
  const cut = await A.page.evaluate(() => {
    const f = document.querySelector('#cm-pane-cut iframe');
    let inner = null;
    try { const d = f.contentDocument; inner = { embed: d.body.classList.contains('is-embed'), hdVisible: !!d.querySelector('.hd') && getComputedStyle(d.querySelector('.hd')).display !== 'none', drop: !!d.getElementById('drop') }; } catch (e) { inner = { err: String(e) }; }
    return { frame: !!f, src: f && f.getAttribute('src'), cardHidden: getComputedStyle(document.getElementById('cm-pane-card')).display === 'none', active: document.querySelector('#cm-tabs .prog-tab.active')?.dataset.t, inner };
  });
  ok(cut.frame && cut.src === 'cutout/?embed=1', '누끼따기 임베드 없음/경로 다름: ' + cut.src);
  ok(cut.cardHidden && cut.active === 'cut', '탭 전환 안 됨');
  ok(cut.inner && cut.inner.embed === true, '임베드 모드 미적용(is-embed): ' + JSON.stringify(cut.inner));
  ok(cut.inner && cut.inner.hdVisible === false, '임베드인데 도구 자체 제목이 그대로 보임(모달 제목과 중복)');
  ok(cut.inner && cut.inner.drop === true, '누끼따기 본체(사진 드롭존) 미로드');
  await A.page.screenshot({ path: join(OUT, '후6_모달_탭2_누끼따기.png'), clip: { x: 0, y: 0, width: 1280, height: 900 } });

  // ④ 되돌아오기 + 영상 편집기(구 정본 탭 3) 무변
  await A.page.evaluate(() => { _cmTab('card'); closeCardMaker(); openVideoEditor('edit'); });
  await A.page.waitForTimeout(600);
  const ve = await A.page.evaluate(() => ({
    tabs: [...document.querySelectorAll('#ve-tabs .prog-tab')].map(b => b.textContent.trim()),
    active: document.querySelector('#ve-tabs .prog-tab.active')?.dataset.t || '',
  }));
  ok(JSON.stringify(ve.tabs) === JSON.stringify(['1. 영상 편집', '2. 자막 삽입', '3. 영상 프롬프팅']), '영상 편집기 탭 변경됨: ' + JSON.stringify(ve.tabs));
  ok(ve.active === 'edit', '영상 편집기 기본 탭 아님');
  await A.page.evaluate(() => closeVideoEditor());

  // ⑤ 모바일 아코디언 = 데스크탑과 같은 한 겹(분기 없음)
  const acc = await A.page.evaluate(() => {
    const d = document.createElement('div'); d.className = 'nav-acc-panel'; document.body.appendChild(d);
    _contentMenuBuild(d);
    const t = [...d.querySelectorAll('button')].map(b => b.textContent.trim()); d.remove();
    return t;
  });
  ok(JSON.stringify(acc) === JSON.stringify(menu.items), '아코디언이 데스크탑과 다름: ' + JSON.stringify(acc));

  const errsA = A.errs.filter(e => /ReferenceError|SyntaxError|is not defined|is not a function/.test(e));
  if (errsA.length) fails.push('pageerror: ' + errsA.join(' | '));
  await A.browser.close();

  // ── 전(origin/main 서빙본 = 3차 드릴인) 촬영 ──
  const BEFORE = process.env.CM_BEFORE;
  if (BEFORE && existsSync(BEFORE)) {
    const B = await boot(chromium, exe, '/index.html', 1280, 900, ROOT, BEFORE);
    const b = await drawMenu(B.page);
    await B.page.screenshot({ path: join(OUT, '전4_메뉴안메뉴_드릴인.png'), clip: b });
    await B.browser.close();
  } else console.log('(전 촬영 생략 — CM_BEFORE 미지정)');

  if (fails.length) { console.error('FAIL ' + fails.length + '건:'); fails.forEach(f => console.error('  - ' + f)); return 1; }
  console.log('PASS — 메뉴 한 겹 6항목(드릴인·› 0) · 이미지 편집 모달 탭 2(누끼따기 = 지연 임베드·is-embed) · 영상 편집기 탭 3 무변 · 아코디언 동일 · pageerror 0');
  return 0;
}
main().then(c => process.exit(c)).catch(e => { console.error('shot 오류: ' + String(e && e.stack || e)); process.exit(1); });
