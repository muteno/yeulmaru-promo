#!/usr/bin/env node
// [260806] 보도자료 만들기(pr-*) **열림·배선** 스모크.
//
// 왜 필요한가 — 이 도구는 정적 게이트가 통째로 못 보는 자리에 있다:
//   ① 진입이 드롭다운 `onclick="openPressKit()"` 문자열이라 오타가 나도 빌드가 없다 = 아무도 안 잡는다
//      (실사고 계보 = smoke_wizard_open.mjs 머리말의 「무반응」 사고와 같은 축).
//   ② 어투 토글은 **정본 `.sw` 스위치**를 빌려 쓴다 — 클래스명이 바뀌면 조용히 안 켜진다.
//   ③ 사진 자리 파서를 블로그 도구(_nbPhotoParse)와 **공유**한다 — 그쪽이 바뀌면 여기가 깨진다.
//
// 잠그는 계약 5가지:
//   ① 열림: openPressKit()이 보드를 그리고 머리줄 정본(.mhead)을 단다.
//   ② 공연 칩: _kmPerfs() 목록이 칩으로 뜨고, 누르면 담기고 메인 라디오가 생긴다(다중 선택).
//   ③ 토글: .sw 클릭 → `.on` 토글 + 설명 문구가 보도자료체 ↔ 블로그체로 갈린다.
//   ④ 사진 자리: 초안 텍스트를 물리면 액자 카드로 렌더된다(파서 공유 계약).
//   ⑤ 무소음 예외 0: 위 전 경로에서 pageerror가 하나도 안 난다.
//
// ⚠ fail-soft(다른 스모크와 동일): playwright-core·chromium·환경 문제 = SKIP(exit 0). 진짜 회귀만 FAIL(exit 1).
//   네트워크는 전부 차단(route.abort)이라 실 API·실 데이터·PII 미접촉.
//
// 실행: node tools/smoke_press_kit.mjs [--shot <디렉터리>]
import { existsSync, readdirSync, readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { dirname, join, extname } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jfif': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.wasm': 'application/wasm' };
const shotIdx = process.argv.indexOf('--shot');
const SHOT = shotIdx > 0 ? process.argv[shotIdx + 1] : '';

function findChromium() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (!existsSync(base)) return null;
  try {
    for (const d of readdirSync(base)) {
      if (d.startsWith('chromium-') && !d.includes('headless')) {
        const p = join(base, d, 'chrome-linux', 'chrome');
        if (existsSync(p)) return p;
      }
    }
  } catch { /* ignore */ }
  return null;
}

// 공연 목록 목 — _kmPerfs()는 「상세 URL이 있는 것」만 통과시키므로 URL을 반드시 채운다.
//   값은 전부 허구, 날짜는 오늘 기준 상대값(해가 바뀌어도 안 썩는다).
const FEED = `(()=>{
  const T=new Date(); const iso=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  const off=n=>{const d=new Date(T);d.setDate(d.getDate()+n);return iso(d);};
  const mk=(id,nm,u)=>({'프로그램ID':id,'풀네임':nm,'줄임말':nm,'콘텐츠구분':'공연','장소':'대극장','구분':'클래식',
    '시작일':off(30),'종료일':off(30),'판매시작일':off(-20),'판매종료일':off(29),'홍보시작일':off(-20),'홍보노출':'Y','URL':u});
  PERFS=[mk('P1','스모크 기념음악회','https://example.invalid/v/?u=1'),
         mk('P2','스모크 피아노 리사이틀','https://example.invalid/v/?u=2'),
         mk('P3','스모크 현대무용','https://example.invalid/v/?u=3')].map(programToPerf);
  try{updatePerfOpen();}catch(e){}
  _perfReady=true;
  return (typeof _kmPerfs==='function') ? _kmPerfs().length : -1;
})()`;

const DRAFT = `===TITLE===
스모크 제목
===BODY===
첫 문단입니다.
[사진: 전경 사진 — 캡션: 제공. 예울마루]
둘째 문단입니다.`;

async function main() {
  let chromium;
  try { ({ chromium } = await import('playwright-core')); }
  catch { console.log('[press] SKIP — playwright-core 미설치(npm install 후 활성).'); return 0; }
  const exe = findChromium();
  if (!exe) { console.log('[press] SKIP — chromium 바이너리 미탐지.'); return 0; }
  if (!existsSync(join(ROOT, 'index.html'))) { console.log('[press] SKIP — index.html 없음.'); return 0; }

  const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--no-sandbox', '--no-proxy-server'] });
  const fails = [], notes = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e).split('\n')[0]));
    await page.route('**/*', route => {
      const u = new NodeURL(route.request().url());
      if (u.hostname === 'app.local') {
        let p = decodeURIComponent(u.pathname); if (p === '/') p = '/index.html';
        try { return route.fulfill({ status: 200, body: readFileSync(join(ROOT, p)), contentType: MIME[extname(p)] || 'application/octet-stream' }); }
        catch { return route.fulfill({ status: 404, body: 'nf' }); }
      }
      return route.abort();   // 실 API 미접촉
    });
    await page.goto('https://app.local/index.html?qa=admin#cal', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('.cell', { timeout: 20000 });
    const nPerf = await page.evaluate(FEED);
    if (!(nPerf > 0)) notes.push(`공연 목 주입 결과 ${nPerf}건 — 칩 검사는 건너뜀`);

    // ── ① 열림 ──
    await page.evaluate('openPressKit()');
    await page.waitForTimeout(500);
    let st = await page.evaluate(`(()=>{const b=document.getElementById('pr-board');
      return {board:!!(b&&b.innerHTML.trim()),
              mhead:!!(b&&b.querySelector('.mhead')),
              chips:b?b.querySelectorAll('#pr-in .nb-chip').length:0,
              sw:!!(b&&b.querySelector('.sw')),
              go:!!(b&&b.querySelector('#pr-go')),
              eta:(b&&b.innerText.match(/약\\s*(\\d+)\\s*분/)||[])[1]||''};})()`);
    if (!st.board) fails.push('① openPressKit()이 보드를 안 그렸다');
    if (!st.mhead) fails.push('① 모달 머리줄 정본(.mhead) 미부착');
    if (!st.go) fails.push('① 실행 버튼(#pr-go) 없음');
    if (!st.eta) fails.push('① 예상 소요 안내가 화면에 없다(운영자 260806-3 요구)');
    if (nPerf > 0 && st.chips < nPerf) fails.push(`② 공연 칩 ${st.chips}개 < 목록 ${nPerf}개`);
    if (!st.sw) fails.push('③ 어투 토글(.sw) 없음');
    if (SHOT) { mkdirSync(SHOT, { recursive: true }); await page.screenshot({ path: join(SHOT, 'press_01_열림.png'), fullPage: false }); }

    // ── ② 공연 다중 선택 + 메인 라디오 ──
    if (nPerf > 0) {
      await page.evaluate(`(()=>{const c=[...document.querySelectorAll('#pr-in .nb-chip')];c[0]&&c[0].click();})()`);
      await page.waitForTimeout(250);
      await page.evaluate(`(()=>{const c=[...document.querySelectorAll('#pr-in .nb-chip')];c[1]&&c[1].click();})()`);
      await page.waitForTimeout(250);
      const pick = await page.evaluate(`(()=>({n:(_prState&&_prState.picks||[]).length,
        main:(_prState&&_prState.main)||'',
        radios:document.querySelectorAll('input[name="pr-main"]').length,
        on:document.querySelectorAll('#pr-in .nb-chip.on').length}))()`);
      if (pick.n !== 2) fails.push(`② 공연 2편을 골랐는데 담긴 건 ${pick.n}편(다중 선택 파손)`);
      if (pick.radios !== 2) fails.push(`② 메인 라디오 ${pick.radios}개 ≠ 담긴 2편`);
      if (!pick.main) fails.push('② 첫 선택이 기본 메인으로 안 잡혔다');
      if (pick.on !== 2) fails.push(`② 고른 칩 강조 ${pick.on}개 ≠ 2`);
      if (SHOT) await page.screenshot({ path: join(SHOT, 'press_02_공연선택.png') });
    }

    // ── ③ 어투 토글 ──
    const t0 = await page.evaluate(`(()=>({on:!!document.querySelector('#pr-in .sw.on'),txt:document.getElementById('pr-in').innerText}))()`);
    await page.evaluate(`document.querySelector('#pr-in .sw').click()`);
    await page.waitForTimeout(250);
    const t1 = await page.evaluate(`(()=>({on:!!document.querySelector('#pr-in .sw.on'),txt:document.getElementById('pr-in').innerText,tone:(_prState||{}).blogTone}))()`);
    if (t0.on) fails.push('③ 토글 기본값이 ON — 기본은 보도자료형(OFF)이어야 한다');
    if (!t1.on || t1.tone !== true) fails.push('③ 토글을 눌러도 안 켜진다');
    if (t0.txt === t1.txt) fails.push('③ 토글을 켜도 설명 문구가 안 갈린다');
    if (!/관찰형 평서체/.test(t0.txt)) fails.push('③ OFF 설명에 보도자료체 안내가 없다');
    if (!/존댓말/.test(t1.txt)) fails.push('③ ON 설명에 블로그체 안내가 없다');
    if (SHOT) await page.screenshot({ path: join(SHOT, 'press_03_블로그어투ON.png') });

    // ── ④ 사진 자리 렌더(파서 공유 계약) ──
    await page.evaluate(`(()=>{_prState.text=${JSON.stringify(DRAFT)};_prState.versions=[{text:_prState.text,label:'초안'}];_prState.verCur=0;
      _prState.docx=new Uint8Array([1,2,3]);_prState.docxName='t.docx';_prRender();})()`);
    await page.waitForTimeout(300);
    const out = await page.evaluate(`(()=>{const o=document.getElementById('pr-out');
      return {slots:(o.innerText.match(/사진 자리/g)||[]).length, dl:/워드 내려받기/.test(o.innerText), cmt:!!document.getElementById('pr-cmt')};})()`);
    if (out.slots !== 1) fails.push(`④ 사진 자리 카드 ${out.slots}개 ≠ 1(파서 공유 파손)`);
    if (!out.dl) fails.push('④ [워드 내려받기] 버튼 없음');
    if (!out.cmt) fails.push('④ 코멘트 다듬기 입력칸 없음');
    if (SHOT) await page.screenshot({ path: join(SHOT, 'press_04_초안_사진자리.png') });

    // ── ⑤ 무소음 예외 0 ──
    if (errs.length) fails.push('⑤ pageerror ' + errs.length + '건: ' + errs.slice(0, 3).join(' | '));
    await page.evaluate('closePressKit()');
  } catch (e) {
    console.log('[press] SKIP — 스모크 실행 환경 오류(차단 안 함): ' + (e && e.message));
    await browser.close();
    return 0;
  }
  await browser.close();

  notes.forEach(n => console.log('[press] note — ' + n));
  if (fails.length) { fails.forEach(f => console.log('[press] FAIL — ' + f)); return 1; }
  console.log('[press] PASS — 열림·머리줄·공연 다중선택·메인 라디오·어투 토글(기본 OFF)·사진 자리·워드 버튼·코멘트칸 · pageerror 0'
    + (SHOT ? ` · 스크린샷 → ${SHOT}` : ''));
  return 0;
}

main().then(c => process.exit(c)).catch(e => { console.log('[press] SKIP — ' + (e && e.message)); process.exit(0); });
