#!/usr/bin/env node
// [260814] 고객 분류 조건 문장 전/후 보고서 생성기 — 산출 = docs/reports/260814_고객분류_조건문장_전후.html
//   ⚠ 산출 HTML은 **기계산출물**이다(손편집 금지 · 고칠 것이 있으면 이 파일을 고치고 다시 돌린다).
//   스샷은 `tools/scratch/shot_segcond_ba.mjs`가 먼저 찍어 둔 것을 base64로 싣는다(전례 = 260813 예울이 호버확장 전후).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
const ROOT = '/home/user/yeulmaru-promo';
const S = join(ROOT, 'tools/scratch/shots');
const img = (n, alt) => {
  const p = join(S, n + '.png');
  if (!existsSync(p)) throw new Error('스샷 없음: ' + p + ' — shot_segcond_ba.mjs를 먼저 돌리세요');
  return `<img alt="${alt}" src="data:image/png;base64,${readFileSync(p).toString('base64')}">`;
};
const shot = (tag, was, n, alt, cap) =>
  `<figure class="shot"><span class="tag${was ? ' was' : ''}">${tag}</span>${img(n, alt)}${cap ? `<figcaption>${cap}</figcaption>` : ''}</figure>`;

const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>고객 분류 조건 문장 — 전/후 (260814)</title>
<style>
/* 정본 사본(index.html :root 블록1·2에서 잘라옴 · 손편집 금지 — 재생성 = tools/scratch/gen_seg_cond_report.mjs) */
:root{
  --accent:#4A4DE7;--accent-light:#E8E8FD;
  --peach-text:#D88455;--peach-bg:#FDF6F3;
  --bg:linear-gradient(135deg,#FDF6F3 0%,#F0EBF5 50%,#EBF0F8 100%);
  --surface-solid:#fff;--border:rgba(0,0,0,0.09);--border2:rgba(0,0,0,0.12);
  --text:#1A1A2E;--dim:#888;--muted:#bbb;--green:#1A6B3C;--danger-btn:#E24B4A;
  --neutral:#EEEDF3;--neutral-text:#6B6B7B;--radius:16px;--r-btn:12px;
}
*{box-sizing:border-box}
body{margin:0;padding:34px 22px 70px;background:var(--bg);background-attachment:fixed;color:var(--text);
  font-family:-apple-system,BlinkMacSystemFont,'Malgun Gothic','맑은 고딕',sans-serif;line-height:1.65;font-size:14px}
.wrap{max-width:1180px;margin:0 auto}
h1{font-size:23px;font-weight:800;margin:0 0 6px}
h2{font-size:16px;font-weight:800;color:var(--accent);margin:38px 0 4px}
h3{font-size:13.5px;font-weight:800;margin:22px 0 6px;color:var(--neutral-text)}
.lede{color:var(--neutral-text);font-size:13px;margin:0 0 4px}
.card{background:var(--surface-solid);border:1px solid var(--border);border-radius:var(--radius);padding:18px 20px;margin:14px 0}
.shot{margin:0 0 16px;background:var(--surface-solid);border:1px solid var(--border);border-radius:var(--radius);padding:12px;position:relative}
.shot img{width:100%;height:auto;display:block;border-radius:9px}
.tag{display:inline-block;font-size:11px;font-weight:800;color:var(--accent);background:var(--accent-light);
  border-radius:7px;padding:3px 9px;margin-bottom:9px}
.tag.was{color:var(--neutral-text);background:var(--neutral)}
figcaption{font-size:11.5px;color:var(--dim);padding:8px 3px 1px}
.two{display:grid;grid-template-columns:1fr 1fr;gap:14px}
@media(max-width:820px){.two{grid-template-columns:1fr}}
table{width:100%;border-collapse:collapse;font-size:12.5px;margin:8px 0 2px}
th,td{padding:8px 10px;border-top:1px solid var(--border);text-align:left;vertical-align:top}
th{background:var(--neutral);color:var(--neutral-text);font-size:11.5px;font-weight:700;border-top:0}
td.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
code{background:var(--neutral);border-radius:5px;padding:1px 5px;font-size:11.5px}
b.hot{color:var(--peach-text)}
b.ok{color:var(--green)}
ul{margin:6px 0 0;padding-left:19px}li{margin:3px 0}
.q{border-left:3px solid var(--accent);padding:2px 0 2px 12px;color:var(--neutral-text);font-size:12.5px;margin:8px 0}
.ask{background:var(--peach-bg);border:1px solid var(--border);border-radius:var(--r-btn);padding:14px 16px;margin:12px 0}
</style></head><body><div class="wrap">

<h1>고객 분류 — 조회 실패 규명 + 조건 문장(변수 5개)</h1>
<p class="lede">260814 · AI 홍보 ▸ 고객 분류 · 실측 = 헤드리스(목데이터 12명) · 게이트 전건 통과</p>
<div class="q">운영자 지시 — “1 여기 일단, 조회가 제대로 안되는 문제 확인해줘 / 2 변수가 <b>3년·클래식·5회·이상·여수시</b> 이게 변수로 나오게 해줘 강조색으로, 누르면 토글되서 다른걸 제안하게 / 거주지는 몇 개만 제안 / 검색하는 곳과 선택하는 곳 간격 확보 / 선택하는 곳은 1줄로 말끔히”</div>

<h2>① 왜 조회가 제대로 안 됐나</h2>
<div class="card">
<p style="margin:0 0 8px">스샷의 질문은 <code>0789 끝자리인 번호로 예매한 이력을 확인해줘</code>였고, 화면은 <b>“읽은 조건 — 2020~2025년 · 공연 1회 이상”</b>이라 말하며 <b class="hot">10,119명</b>(= 연결된 회원 전건)을 그렸습니다. 해석이 실패한 게 아니라 <b>실패가 성공처럼 보인 것</b>입니다.</p>
<table>
<tr><th style="width:130px">고리</th><th>무슨 일이 있었나</th></tr>
<tr><td>① 없는 축</td><td>이 도구의 조건 축은 <b>기간·장르·거주지·관람 횟수</b> 넷뿐 — 휴대폰 끝자리로 거르는 축이 애초에 없습니다.</td></tr>
<tr><td>② 파서</td><td>로컬 파서가 축을 0개 읽어 <code>null</code> → 예울이(GitHub Actions, 30초~2분) 왕복으로 넘어갔습니다.</td></tr>
<tr><td>③ 프롬프트</td><td>“못 옮기겠다”고 답할 길이 없었습니다. 스키마를 채우라고만 했으니 <code>{span:'all',thr:1}</code>이 돌아옵니다.</td></tr>
<tr><td>④ 정규화</td><td><code>_segQNorm</code>은 빠진 값을 전부 <b>너그러운 기본값</b>으로 채웁니다 — 「모른다」를 담을 자리가 없었습니다.</td></tr>
<tr><td>⑤ 실행</td><td><code>_segNlGo</code>가 돌아온 조건을 검사 없이 <code>_segRun()</code>에 넘겼습니다 → <b>전건 명단</b>.</td></tr>
</table>
<p style="margin:10px 0 0;font-size:12.5px;color:var(--neutral-text)">재현(목데이터) = <code>_segQNorm({span:'all',thr:1})</code> → <b>12/12명 전건</b> · 조건 문장 “2021~2025년 · 공연 1회 이상” — 실사용 화면과 같은 모양.</p>
</div>
<h3>고친 것 — 못 읽었으면 못 읽었다고 말하고, 조회하지 않는다</h3>
<div class="two">
${shot('전 — 실패가 「읽은 조건」으로 보인다', true, '260814_고객분류_조건_전', '전: 셀렉트 6개가 두 줄로 접힌 구판 폼', '구판. 해석 실패도 이 폼을 채우고 그대로 조회됐다.')}
${shot('후 — 그 자리에서 말하고 멈춘다', false, '260814_고객분류_못읽음_후', '후: 「휴대폰 번호」로는 아직 못 걸러요 안내', '같은 질문 · 실측 = 예울이 <b>왕복 0회</b>(즉시) · <code>_segLast</code> 그대로 = <b>조회 안 함</b>.')}
</div>
<ul style="font-size:12.5px">
<li><b>없는 축 사전 차단</b> — 휴대폰·이름·공연명·연령·금액·매수를 짚은 질문은 <b>보내기 전에</b> 그 자리에서 안내(30초~2분 기다린 끝에 엉뚱한 조건이 오는 걸 막는다). 읽힌 축이 하나라도 있으면 그것만은 문장에 채워 둡니다.</li>
<li><b>“안 좁힌 조건” 판정</b>(<code>_segQBlank</code>) — 전 기간 + 전 장르 + 전 지역 + 1회 이상이면 <b>해석 실패로 취급</b>하고 조회하지 않습니다.</li>
<li><b>모델에 정직한 실패 경로</b> — <code>nb-blog.yml</code> segparse 프롬프트에 «옮길 수 없으면 <code>{"ok":false,"why":…}</code>» 규칙 추가. 앱은 그 사유를 그대로 보여줍니다.</li>
</ul>

<h2>② 조건 = 문장 안의 변수 5개</h2>
<div class="two">
${shot('전', true, '260814_고객분류_조건_전', '전: 셀렉트·입력칸 6개 두 줄', '카드 높이 <b>191px</b> · 조건 줄이 <b>두 줄</b>로 접힘 · 검색줄과의 간격 11px')}
${shot('후', false, '260814_고객분류_조건_후', '후: 한 줄 문장 + 강조색 변수 5개', '카드 높이 <b>153px</b> · 조건 줄 <b>한 줄</b>(합집합 28px = 가장 큰 자식 28px) · 간격 <b>24px</b>')}
</div>
<div class="card" style="margin-top:2px">
<b>최근 3년</b>▾ 이내에 <b>전 장르</b>▾ 공연을 <b>5회</b>▾ <b>이상</b>▾ 관람한 <b>전 지역</b>▾ 거주 고객 &nbsp;—&nbsp;
<span style="font-size:12.5px;color:var(--neutral-text)">굵은 강조색 5곳이 변수. 누르면 그 자리에 다른 값 목록이 열립니다.</span>
<ul style="font-size:12.5px">
<li>부품 = 전부 정본 계승 — 트리거 <code>.ry-yr-tg</code>(기틀 §2 #3) · 목록 <code>_ddOpen</code>(동시 1개 규약) · 패널 <code>.ry-yr-dd</code>. <b class="ok">신규 CSS·색·부품 0</b>.</li>
<li>폼 상태가 DOM(select 6개)에서 <b>조건 객체 하나</b>(<code>_segQ</code>)로 옮겨졌습니다 — 자연어·예울이·명단·CSV가 보던 계약(<code>_segQFromForm</code>/<code>_segQToForm</code>)은 그대로.</li>
<li>이미 명단이 떠 있으면 변수를 바꾸는 즉시 <b>그 자리에서 다시 셉니다</b>(실측 12 → 3명).</li>
<li>1500px·1280px 두 폭 모두 한 줄(실측 <code>oneLine:true</code> · 가로 넘침 0).</li>
</ul>
</div>

<h2>③ 변수를 누르면 나오는 목록</h2>
<div class="two">
${shot('거주지 — 운영자 지시 목록 그대로', false, '260814_고객분류_거주지목록', '거주지 목록: 여수/순천/광양 · 묶음 · 그 밖의 시', '구분선 자리까지 지시대로. 옆 숫자 = <b>그 조건에 드는 회원 수</b>(실측). 「그 밖의 시」는 종전 전체 목록을 스크롤로 보존.')}
${shot('장르 — 시트에 실존하는 8종', false, '260814_고객분류_장르목록', '장르 목록 8종', '운영자가 준 순서 먼저 + 시트에 있는 나머지. 옆 숫자 = 그 기간에 그 장르를 본 <b>사람 수</b>.')}
${shot('기간', false, '260814_고객분류_기간목록', '기간 목록: 전 기간·최근 N·기간 지정', '「기간 지정」 달력 두 개를 목록 안에서 끝냅니다 — 문장 한 줄에 달력을 얹지 않으려고.')}
${shot('관람 횟수 (+ 이상/이하)', false, '260814_고객분류_횟수목록', '횟수 목록 + 직접 입력', '프리셋 6개 + 직접 입력. 「이상」은 옆 변수에서 <b>이하</b>로 바뀝니다(1회 이상 N회 이하 — 안 본 사람은 안 들어옴).')}
</div>

<h2>④ 운영자 확인이 필요한 2건</h2>
<div class="ask">
<b>ⓐ 장르 — “장르가 또 있나?”에 대한 답</b><br>
시트(<code>장르1</code>)가 들고 있는 갈래는 <b>8종</b>입니다: 클래식 · 뮤지컬 · 어린이·가족 · <b>발레/연극</b> · 시즌 · 대중 · 국악 · 기타.
<ul>
<li>주신 목록의 <b>발레·무용 / 연극</b>은 시트에서 <b>「발레/연극」 한 값</b>이라 지금 데이터로는 못 쪼갭니다(쪼개려면 원천 <code>장르1</code>을 나눠 적고 <code>docs/260804_booking_agg.mjs</code>를 다시 돌려야 합니다).</li>
<li>주신 목록에 없던 <b>대중 · 국악 · 기타</b>가 실제로 있습니다(국악·시즌은 260804-14에 운영자 확정으로 신설된 어휘). 일단 <b>전부 목록에 넣었고</b> 회원 수를 옆에 적어 뒀습니다 — 빼고 싶은 갈래가 있으면 말씀해 주세요.</li>
</ul>
</div>
<div class="ask">
<b>ⓑ “기타 광역시”의 뜻</b><br>
지금은 <b>전남·광주 밖 광역시급 = 부산 · 대구 · 인천 · 대전 · 울산 · 세종</b>으로 넣었습니다(서울은 위 「수도권」이 대표).
묶음들은 <b>서로 배타가 아닙니다</b> — 부산은 「영·호남」에도 「기타 광역시」에도 듭니다(한 번에 하나만 고르는 렌즈이지 분할이 아닙니다).
「수도권·영호남에 안 든 곳만(대전·세종)」으로 좁힐지 결정해 주세요.
</div>

<h2>⑤ 실측</h2>
<table>
<tr><th>검사</th><th>도구</th><th class="n">결과</th></tr>
<tr><td>조회 실패 경로 + 새 축 + 조건 문장</td><td><code>tools/scratch/probe_seg_nlfail.mjs</code></td><td class="n"><b class="ok">27/27</b></td></tr>
<tr><td>조건 한 벌·자연어·PII·LLM 왕복·채팅 일치(기존)</td><td><code>tools/scratch/probe_seg_nl.mjs</code></td><td class="n"><b class="ok">23/23</b></td></tr>
<tr><td>디자인 기틀(raw hex·:root·대비·잰크)</td><td><code>tools/check_design.py</code></td><td class="n">1540/1540 · 신규 0</td></tr>
<tr><td>모달 머리줄 · 판매 추이 · 컴포넌트 패리티</td><td><code>check_modal_head</code>·<code>check_exchart</code>·<code>smoke_component_parity</code></td><td class="n"><b class="ok">PASS</b></td></tr>
<tr><td>두 화면 같은 답(채팅 ↔ 고객 분류)</td><td><code>tools/smoke_bkchat.mjs</code></td><td class="n"><b class="ok">PASS</b></td></tr>
<tr><td>연간 사업 차트 · 위저드 열림 · 보도자료</td><td><code>smoke_bizchart</code>·<code>smoke_wizard_open</code>·<code>smoke_press_kit</code></td><td class="n"><b class="ok">PASS</b></td></tr>
</table>
<p style="font-size:11.5px;color:var(--dim);margin-top:10px">숫자는 목데이터(회원 12명) 기준 — 실 데이터에서는 인원만 달라지고 관계(부분집합·합)는 같습니다. 재생성 = <code>node tools/scratch/shot_segcond_ba.mjs …</code> → <code>node tools/scratch/gen_seg_cond_report.mjs</code>.</p>

</div></body></html>`;

const out = join(ROOT, 'docs/reports/260814_고객분류_조건문장_전후.html');
writeFileSync(out, html);
console.log('보고서 →', out, (html.length / 1024 / 1024).toFixed(2) + 'MB');
