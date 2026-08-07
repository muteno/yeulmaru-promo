#!/usr/bin/env node
// [260813] 예울이 호버 확장 — 전/후 + 만지는 시안(플레이그라운드) 생성기.
//   docs/플레이그라운드_포터블.md 계약: 자기완결 1파일(외부 요청 0) · 실물 재현 · 프리셋 · 미세조정 · 선택값 복사 · 재현 한계 각주.
//   ⚠ 정본 부품 재타이핑 0 — CSS(:root 2블록 + 챗 정본 .cb-*)는 index.html에서 **잘라서** 넣고,
//     미리보기 마크업은 **실제로 렌더된 우 열의 outerHTML**을 헤드리스에서 떠 온다(시안이 실코드와 갈리는 경로를 원천 차단).
// 실행: node tools/scratch/gen_yeul_hover_playground.mjs
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { INIT_SCRIPT, FEED_SCRIPT } from '../qa_mock_ops.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const R = join(ROOT, 'docs', 'reports');
const OUT = join(R, '260813_예울이_호버확장_전후.html');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jfif': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const b64 = f => 'data:image/png;base64,' + readFileSync(join(R, f)).toString('base64');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ── index.html에서 정본 CSS 잘라내기 ───────────────────────────────────────────
const SRC = readFileSync(join(ROOT, 'index.html'), 'utf8');
const style = (SRC.match(/<style[^>]*>([\s\S]*?)<\/style>/i) || [])[1] || '';
// 들여쓰기 0에서 시작하는 규칙 한 덩어리 = check_design.py의 규칙 스캔과 같은 축
const RULE = /^(:root|[.#][\w][^\n{]*)\{([^}]*)\}/gm;
const want = sel => /^:root/.test(sel) || /(^|[\s,])\.cb-/.test(sel);
let css = '', m;
while ((m = RULE.exec(style))) { if (want(m[1])) css += m[0] + '\n'; }
// @keyframes는 **중괄호가 한 겹 더** 있다 — 위 `[^}]*`로 자르면 반토막이 나가 그 뒤 규칙이 통째로 죽는다(초판 실사고: 파싱이 cbPop에서 멈춰 .cb-rise 전건 미적용).
const KF = /^@keyframes\s+(cbIn|cbDot|cbPop)\s*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/gm;
while ((m = KF.exec(style))) css += m[0] + '\n';
// clip-path 전이는 미디어쿼리 안 감속 규칙도 함께(있으면)
const rm = style.match(/@media \(prefers-reduced-motion:reduce\)\{\.cb-rise\{[^}]*\}\}/);
if (rm) css += rm[0] + '\n';
if (!/\.cb-rise/.test(css)) { console.error('[gen] 중단 — .cb-rise 정본 CSS를 index.html에서 못 찾았다.'); process.exit(1); }

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

// ── 실제 렌더된 우 열 마크업 뜨기 ─────────────────────────────────────────────
async function grabMarkup() {
  const { chromium } = await import('playwright-core');
  const browser = await chromium.launch({ executablePath: findChromium(), headless: true, args: ['--no-sandbox', '--no-proxy-server'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
    await page.route('**/*', route => {
      const u = new NodeURL(route.request().url());
      if (u.hostname === 'app.local') {
        let p = decodeURIComponent(u.pathname); if (p === '/') p = '/index.html';
        try { return route.fulfill({ status: 200, body: readFileSync(join(ROOT, p)), contentType: MIME[extname(p)] || 'application/octet-stream' }); }
        catch { return route.fulfill({ status: 404, body: 'nf' }); }
      }
      return route.abort();
    });
    await page.addInitScript(INIT_SCRIPT);
    await page.goto('https://app.local/index.html?qa=admin', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);
    await page.evaluate(FEED_SCRIPT);
    await page.evaluate('openMemberOverview()');
    await page.waitForTimeout(900);
    await page.evaluate(`(()=>{ _memAiHist=[{u:'여수 30대 회원 몇 명이야?'},{b:'여수시 30대 회원은 <b>1,842명</b>이에요 · 여수 전체의 12.5%',t:'오후 04:13'},{u:'그 중 재구매는?'},{b:'그 중 2회 이상 구매한 회원은 <b>412명</b>이에요 · 22.4%',t:'오후 04:14'}]; _memAiPaint('m'); })()`);
    await page.waitForTimeout(300);
    return await page.evaluate(`(()=>{ const l=document.getElementById('mem-ai-log-m'); const col=l.parentElement.parentElement;
      const c=col.cloneNode(true);
      // 자기완결 = 외부 요청 0: 아바타 원본(1.8MB)은 안 싣고 정본 .cb-ava 원형 배경만 남긴다(각주에 명시)
      c.querySelectorAll('img').forEach(i=>i.remove());
      // id 충돌 방지(시안 안에서 2벌을 나란히 놓는다)
      c.querySelectorAll('[id]').forEach(e=>e.removeAttribute('id'));
      c.querySelectorAll('[onclick],[onkeydown]').forEach(e=>{e.removeAttribute('onclick');e.removeAttribute('onkeydown');});
      return c.outerHTML; })()`);
  } finally { await browser.close(); }
}

const colHtml = await grabMarkup();
// 「전」 = 구판 기하(카드가 흐름 안 · 로그 160px 고정 · 호버 반응 0)를 같은 마크업에서 되만든다 — 클래스만 갈아 끼운다(재타이핑 0)
const beforeHtml = colHtml.replace('class="cb-rise-col"', 'class="cb-rise-col cb-rise-was"').replace('class="cb-rise"', 'class="cb-rise cb-rise-was-card"');

const HTML = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>예울이 호버 확장 — 전/후 · 만지는 시안 (260813)</title>
<style>
/* ── 정본 사본(index.html에서 잘라옴 · 손편집 금지 · 재생성 = tools/scratch/gen_yeul_hover_playground.mjs) ── */
${css}
/* ── 시안 껍데기(정본 아님 — 이 파일 전용) ── */
*{box-sizing:border-box}
body{margin:0;padding:26px 20px 60px;font-family:'Pretendard','Apple SD Gothic Neo',system-ui,sans-serif;background:var(--bg);color:var(--text)}
h1{font-size:20px;margin:0 0 4px}h2{font-size:15px;margin:30px 0 10px}
.sub{font-size:12.5px;color:var(--dim);line-height:1.7;margin:0 0 6px}
.wrap{max-width:1180px;margin:0 auto}
.card{background:var(--surface-solid);border:1px solid var(--border);border-radius:var(--radius-lg);padding:18px;box-shadow:var(--glass-shadow)}
.row{display:flex;gap:18px;flex-wrap:wrap}
.shot{flex:1 1 240px;min-width:210px}
.shot img{width:100%;border:1px solid var(--border);border-radius:var(--radius);display:block}
.cap{font-size:11.5px;color:var(--dim);margin-top:6px;line-height:1.55}
.tag{display:inline-block;font-size:11px;font-weight:800;padding:3px 9px;border-radius:999px;background:var(--accent-light);color:var(--accent);margin-bottom:7px}
.tag.was{background:var(--neutral);color:var(--neutral-text)}
/* 미리보기 무대 = 실제 4면 우 열과 같은 칸(519×651 실측) */
.stage{display:flex;gap:22px;flex-wrap:wrap}
.stage>div{flex:0 0 auto}
.frame{width:519px;height:651px;max-width:100%;background:var(--glass);border:1px solid var(--glass-border);border-radius:var(--radius-lg);padding:0;overflow:hidden;position:relative}
.frame>.cb-rise-col{height:100%;display:flex;flex-direction:column;min-height:0}
.ctl{display:grid;grid-template-columns:104px 1fr 62px;gap:9px 12px;align-items:center;font-size:12.5px}
.ctl label{color:var(--neutral-text);font-weight:700}
.ctl input[type=range]{width:100%;accent-color:var(--accent)}
.ctl select{font-family:inherit;font-size:12.5px;padding:5px 8px;border:1px solid var(--border2);border-radius:var(--r-btn);background:var(--surface-solid);color:var(--text);grid-column:2/4}
.val{font-variant-numeric:tabular-nums;color:var(--accent);font-weight:800;text-align:right}
.pre{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:14px}
.out{margin-top:14px;background:var(--past-bg);border:1px solid var(--border);border-radius:var(--r-btn);padding:11px 13px;font-size:12px;font-family:ui-monospace,Menlo,monospace;white-space:pre-wrap;line-height:1.65}
.note{font-size:12px;color:var(--neutral-text);line-height:1.8}
.note b{color:var(--text)}
.warn{color:var(--peach-text);font-weight:700}
/* 「전」 재현 = 구판 기하: 카드가 흐름 안에 접힌 채 서 있고 호버에 반응하지 않는다 */
.cb-rise-was{padding-bottom:0}
.cb-rise-was-card{position:static;clip-path:none;box-shadow:none;margin-top:14px;flex:0 0 auto}
.cb-rise-was-card:hover{clip-path:none;box-shadow:none}
.cb-rise-was-card>.cb-body{flex:0 0 auto;height:clamp(96px,16vh,190px)}
.cb-rise-was-card>.cb-body>:first-child{margin-top:0}
/* 시안 전용 오버라이드 = 슬라이더가 만지는 축(정본은 위 .cb-rise 값 그대로 · 복사본이 곧 배선 스펙) */
#live .cb-rise{transition:clip-path var(--d,.46s) var(--e,cubic-bezier(.215,.61,.355,1)) var(--o,.18s),box-shadow var(--d,.46s) var(--e,cubic-bezier(.215,.61,.355,1)) var(--o,.18s)}
#live .cb-rise:hover,#live .cb-rise:focus-within{transition-delay:var(--i,.1s);clip-path:inset(calc(var(--open,0) * max(0px,100% - var(--rise-h))) 0 0 0 round var(--radius))}
</style></head><body><div class="wrap">

<h1>예울이 대화창 — 마우스 올리면 「거주지 TOP 5」 구간까지 올라온다</h1>
<p class="sub">운영자 260813 「여기 예울이에 마우스 포인터가 올라가면, 대화창이 위에 거주지 top5 있는 구간까지 쭉 올라가줄래? 자연스럽게 이징해서 · 그래서 대화를 통해 고객질의할 수 있도록」<br>
캡처 = 실제 앱(<code>?qa=admin</code> 목데이터 · 1500×1000 · 고객 분석 모달 우 열 통째). 아래 미리보기는 <b>실제로 렌더된 그 열의 마크업</b>과 <b>index.html에서 잘라온 정본 CSS</b>로 돕니다.</p>

<h2>1. 전 · 후 (실측 캡처)</h2>
<div class="card"><div class="row">
  <div class="shot"><span class="tag was">전 — 쉼 = 호버</span><img alt="전: 예울이 카드가 접힌 채 고정" src="${b64('260813_예울이_호버확장_전.png')}"><div class="cap">카드 223px 고정. 마우스를 올려도 <b>세 장의 캡처가 픽셀까지 동일</b>(70,959바이트 3장) = 반응 0. 대화가 길어지면 이 칸 안에서만 스크롤.</div></div>
  <div class="shot"><span class="tag">후 — 쉼</span><img alt="후: 접힘 상태(전과 동일 기하)" src="${b64('260813_예울이_호버확장_후_쉼.png')}"><div class="cap">접힘 칸 <b>304px</b>(260813-2 운영자 선택값) · 막대 카드 333px. 대화는 입력줄 쪽에 붙는다(메신저 규약).</div></div>
  <div class="shot"><span class="tag">후 — 올라가는 중</span><img alt="후: 전이 35% 지점" src="${b64('260813_예울이_호버확장_후_중간.png')}"><div class="cap">곡선 <b>35% 지점에서 정지</b>시켜 촬영(<code>Animation.currentTime</code>). 입력줄은 안 움직이고 <b>위쪽 선만</b> 올라간다.</div></div>
  <div class="shot"><span class="tag">후 — 1366×768(낮은 창)</span><img alt="후: 낮은 창에서 접힘 칸 255px" src="${b64('260813_예울이_호버확장_후_낮은창.png')}"><div class="cap">창이 낮으면 접힘 칸이 <b>255px</b>로 줄어 위 막대 카드(168px)가 산다. 고정 304였으면 이 자리에서 도넛이 <b>전부 사라졌다</b>(막대 120px).</div></div>
  <div class="shot"><span class="tag">후 — 펼침</span><img alt="후: 열 전체로 펼쳐진 대화창" src="${b64('260813_예울이_호버확장_후_펼침.png')}"><div class="cap">열 전체 651px = 「거주지 TOP 5」 카드 윗선까지. 대화 자리가 <b>160px → 588px(3.7배)</b>.</div></div>
</div></div>

<h2>2. 만지는 미리보기 — 왼쪽 「전」, 오른쪽 「후」에 마우스를 올려 보세요</h2>
<div class="card">
<div class="pre" id="pre"></div>
<div class="stage">
  <div><div class="tag was">전(현행 구판)</div><div class="frame">${beforeHtml}</div></div>
  <div id="live"><div class="tag">후 — 값 조절 대상</div><div class="frame">${colHtml}</div></div>
  <div style="flex:1 1 300px;min-width:270px">
    <div class="ctl">
      <label>길이</label><input type="range" id="d" min="120" max="900" step="10" value="590"><span class="val" id="dv">590ms</span>
      <label>커브</label><select id="e">
        <option value="cubic-bezier(.215,.61,.355,1)">주력 감속 .215,.61,.355,1 (현행 · .dd-menu 계승)</option>
        <option value="cubic-bezier(.4,0,.2,1)">도착·안착 .4,0,.2,1 (기틀 §2 #13)</option>
        <option value="cubic-bezier(.22,.9,.36,1)">리빌 .22,.9,.36,1 (기틀 §2 #24 secPop)</option>
        <option value="cubic-bezier(.26,1.1,.5,1)">챗 말풍선 .26,1.1,.5,1 (cbIn · 살짝 튐)</option>
        <option value="ease-in-out">ease-in-out (대칭 · 스윕 계승)</option>
      </select>
      <label>열림 지연</label><input type="range" id="i" min="0" max="500" step="10" value="100"><span class="val" id="iv">100ms</span>
      <label>닫힘 지연</label><input type="range" id="o" min="0" max="600" step="10" value="180"><span class="val" id="ov">180ms</span>
      <label>펼침 범위</label><input type="range" id="opn" min="0" max="80" step="5" value="0"><span class="val" id="opnv">100%</span>
      <label>접힘 칸</label><input type="range" id="h" min="150" max="340" step="1" value="304"><span class="val" id="hv">304px</span>
    </div>
    <div class="out" id="out"></div>
    <button class="btn btn--primary btn--sm" id="copy" style="margin-top:10px;font-family:inherit;font-size:12.5px;font-weight:700;padding:9px 16px;border:0;border-radius:var(--r-btn);background:var(--accent);color:#fff;cursor:pointer">선택값 복사</button>
  </div>
</div>
</div>

<h2>3. 어떻게 만들었나 (배선 요약)</h2>
<div class="card note">
<b>높이를 애니메이션하지 않는다.</b> 카드를 처음부터 <b>열 전체 높이</b>로 깔고(<code>.cb-rise{position:absolute;inset:0}</code>) 평소엔 아래
<code>--rise-h</code>만큼만 <code>clip-path:inset(…)</code>로 보여준다. 펼침 = <b>그 잘라내기가 0으로 가는 것</b>뿐 —
리플로 0·합성만이라 <code>check_design.py</code> ⑥ 잰크 전이가 <b>15/15 그대로</b>(높이·마진 전이였으면 16이 되어 커밋이 막힌다).<br>
<b>입력줄은 한 픽셀도 안 움직인다</b> — 카드가 바닥에 고정돼 있고 위쪽 선만 올라가니, 타이핑 중에 열려도 커서가 안 흔들린다.<br>
<b>자리 확보</b> = 열의 <code>padding-bottom:calc(var(--rise-h) + var(--rise-gap))</code>. 그래서 위 막대 카드 높이는 <b>전과 Δ0</b>(실측 414px).<br>
<b>접힘 칸</b> <code>--rise-h</code> = 로그창 <code>clamp(96px,25vh,241px)</code> + 입력줄·테두리 <code>--rise-foot</code>(<code>_memAiPaint</code>가 <code>.cb-foot</code> 실측으로 덮어씀 · 실측 61+2=63) = <b>1000px대 창에서 정확히 304px</b>(운영자 선택값).<br>
<b>낮은 창에서만 비례로 줄어든다</b> — 상한 241에 붙는 건 창 높이 ≥ 964px일 때. 고정 304로 못 박으면 1366×768에서 위 막대 카드가 <b>120px</b>로 눌려 도넛 두 개가 통째로 사라진다(실측 · 오른쪽 캡처가 상한 적용 후 = 막대 168px).<br>
<b>진입로 2개</b> — <code>:hover</code>(마우스)와 <code>:focus-within</code>(터치·키보드로 입력칸에 들어갈 때). 감속 선호(<code>prefers-reduced-motion</code>)면 전이 없이 즉시 전환.<br>
<b>대화는 아래에 붙는다</b>(<code>.cb-rise&gt;.cb-body&gt;:first-child{margin-top:auto}</code>) — 로그창이 늘 열 전체 높이라 위로 붙이면 접힘 칸이 빈 칸이 된다.
</div>

<h2>4. 재현 한계 각주</h2>
<div class="card note">
· 미리보기 마크업 = <b>실제 렌더 결과의 사본</b>이라 버튼·입력은 동작하지 않는다(<code>onclick</code> 제거) — 모양·모션 재현 전용.<br>
· 예울이 아바타 원본(<code>image/yeul.png</code> 1.8MB)은 자기완결 1파일 계약 때문에 안 실었다 — 정본 <code>.cb-ava</code> 원형 배경만 보인다(실제 화면엔 사진이 들어간다).<br>
· 무대 칸 519×651 = 1500×1000 실측 고정값. 실제 앱은 창 높이에 따라 <code>25vh</code>로 접힘 칸이 신축한다(1500×1000·1920×1080 = 304 · 760×900 = 288 · 1366×768 = 255).<br>
· 「전」 재현은 같은 마크업에 구판 기하(<code>position:static</code>·로그 고정 높이·호버 무반응)를 덧씌운 것 — 캡처(§1 첫 장)가 실물 증빙이다.<br>
· <span class="warn">⚠ 조절 축 전부 = 모션 값(시간·커브)</span> — 색·토큰은 손대지 않았다(신규 hex 0 · 신규 <code>:root</code> 0).
</div>
</div>
<script>
var PRESETS=[
 {n:'현행 = 배선값 ★',d:590,e:'cubic-bezier(.215,.61,.355,1)',i:100,o:180,open:0,h:304},
 {n:'빠릿',d:280,e:'cubic-bezier(.4,0,.2,1)',i:60,o:120,open:0,h:304},
 {n:'느긋',d:760,e:'cubic-bezier(.22,.9,.36,1)',i:160,o:260,open:0,h:304},
 {n:'절반만 올라감',d:590,e:'cubic-bezier(.215,.61,.355,1)',i:100,o:180,open:45,h:304}
];
var $=function(k){return document.getElementById(k);},live=$('live'),ids=['d','e','i','o','opn','h'];
function cur(){return {d:+$('d').value,e:$('e').value,i:+$('i').value,o:+$('o').value,open:+$('opn').value,h:+$('h').value};}   // ⚠ getElementById로 받는다 — id 전역(window.open 등 내장과 충돌)에 기대면 값이 undefined가 된다
function apply(){var v=cur();
 live.style.setProperty('--d',v.d+'ms');live.style.setProperty('--e',v.e);
 live.style.setProperty('--i',v.i+'ms');live.style.setProperty('--o',v.o+'ms');
 live.style.setProperty('--open',(v.open/100));
 live.querySelector('.cb-rise-col').style.setProperty('--rise-h',v.h+'px');
 $('dv').textContent=v.d+'ms';$('iv').textContent=v.i+'ms';$('ov').textContent=v.o+'ms';
 $('opnv').textContent=(100-v.open)+'%';$('hv').textContent=v.h+'px';
 var base=(v.d===590&&v.e==='cubic-bezier(.215,.61,.355,1)'&&v.i===100&&v.o===180&&v.open===0&&v.h===304);
 $('out').textContent=
  '/* index.html .cb-rise — 선택값 */\\n'+
  '.cb-rise{transition:clip-path '+(v.d/1000)+'s '+v.e+' '+(v.o/1000)+'s,\\n'+
  '                    box-shadow '+(v.d/1000)+'s '+v.e+' '+(v.o/1000)+'s}\\n'+
  '.cb-rise:hover,.cb-rise:focus-within{transition-delay:'+(v.i/1000)+'s;\\n'+
  '  clip-path:inset('+(v.open?'calc('+(v.open/100)+' * max(0px,100% - var(--rise-h)))':'0')+' 0 0 0 round var(--radius))}\\n'+
  '.cb-rise-col{--rise-h:'+(v.h===304?'calc(var(--rise-log) + var(--rise-foot))   /* 계승 = clamp(96,25vh,241) + 실측 63 = 304 */':v.h+'px   /* 갱신 후보 — 현행 304(=clamp(96,25vh,241)+63 · 낮은 창에서 비례 축소) */')+'}\\n'+
  (base?'\\n= 현재 배선값 그대로(계승 · 바꿀 것 없음)':'\\n= 갱신 후보 — 이 블록을 그대로 회신하면 배선합니다');}
ids.forEach(function(k){$(k).addEventListener('input',apply);$(k).addEventListener('change',apply);});
PRESETS.forEach(function(p){var b=document.createElement('button');b.textContent=p.n;
 b.style.cssText='font-family:inherit;font-size:12px;font-weight:700;padding:7px 14px;border-radius:999px;border:1px solid var(--border2);background:var(--surface-solid);color:var(--accent);cursor:pointer';
 b.onclick=function(){$('d').value=p.d;$('e').value=p.e;$('i').value=p.i;$('o').value=p.o;$('opn').value=p.open;$('h').value=p.h;apply();};
 $('pre').appendChild(b);});
$('copy').onclick=function(){var t=$('out').textContent,copy=$('copy');
 if(navigator.clipboard)navigator.clipboard.writeText(t).then(function(){copy.textContent='복사됨 ✓';setTimeout(function(){copy.textContent='선택값 복사';},1400);});
 else{var ta=document.createElement('textarea');ta.value=t;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();copy.textContent='복사됨 ✓';}};
apply();
</script></body></html>`;

writeFileSync(OUT, HTML);
console.log('[gen] 작성: ' + OUT + ' (' + Math.round(HTML.length / 1024) + 'KB · 정본 CSS ' + (css.match(/\n/g) || []).length + '줄 잘라옴)');
