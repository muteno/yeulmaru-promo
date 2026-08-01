/* 전/후 비교 하네스 생성 — 실제 index.html의 드릴 렌더 함수·CSS를 그대로 뽑아 쓰고, 데이터 의존 헬퍼만 스텁.
   전 = 직전 커밋(HEAD) 판, 후 = 작업본. 산출: docs/reports/260731_공연접속통계_전후.html (일회성 스냅샷) */
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const now = fs.readFileSync('index.html', 'utf8');
const old = execSync('git show HEAD:index.html', { maxBuffer: 1 << 30 }).toString();

function fnText(src, name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('not found: ' + name);
  let d = 0, started = false;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (c === '{') { d++; started = true; }
    else if (c === '}') { d--; if (started && d === 0) return src.slice(i, j + 1); }
  }
  throw new Error('unbalanced: ' + name);
}
const FNS = ['_srailRenderDrill', '_srailAccHtml', '_accDist', '_accBar', '_accIdx', '_accOf', '_accLabels', '_srailDrillDots', '_srailDrillPage', '_srailPageTo', '_srailPageGo', '_uName'];
const OPT = ['_accKindWord', '_accAgeWord', '_accJosa'];
const bundle = (src, ns) => {
  const fns = FNS.concat(OPT.filter(n => src.includes('function ' + n + '('))).map(n => fnText(src, n));
  return `var ${ns}=(function(){${stubs}\n${fns.join('\n')}\nreturn {drill:_srailRenderDrill,setPage:function(n){_srailView.page=n;}};})();`;
};
const style = [...now.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n');
const data = fs.readFileSync('data/perf_access_stats.js', 'utf8');

const stubs = `
var _srailView={mode:'drill',kind:'perf',name:'',page:1};
var _ACC_IDX=null;
var _SRAIL_DPG_LBL=['판매 현황','페이지 접속통계'];
var userRole='staff';
function escapeHtml(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function _anaEsc(s){return String(s==null?'':s).replace(/'/g,"\\\\'");}
function _anaProfitAxis(v){return v||'예술성';}
function _salesDdayStr(d){return d==null?'-':(d>0?'D-'+d:(d===0?'D-DAY':'종료'));}
function _anaPeers(){return [{occ:52},{occ:61},{occ:47}];}
function _srailNavSlot(html){var s=document.getElementById(window.NAVID);if(s)s.innerHTML=html||'';}
function _srailAsof(){return '2026-07-31';}
function _srailDrillSvg(){return '<svg viewBox="0 0 300 96" style="width:100%;height:auto"><polyline fill="none" stroke="var(--accent)" stroke-width="2" points="6,84 46,74 86,66 126,54 166,44 206,33 246,25 292,16"/><polyline fill="none" stroke="var(--peach-text)" stroke-width="2" stroke-dasharray="4 3" points="292,16 296,13"/><line x1="6" y1="90" x2="294" y2="90" stroke="var(--border)"/></svg>';}
var _AI_ICO='<svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true" style="flex-shrink:0"><path fill="var(--accent)" d="M12 2l1.9 5.6 5.6 1.9-5.6 1.9L12 17l-1.9-5.6L4.5 9.5l5.6-1.9z"/></svg>';
function _srailAiHd(){return '<div class="sr-ai-hd">'+_AI_ICO+'AI 분석</div>';}
function _srailAiRow(color,label,html){return '<div class="sr-ai-item"><span class="bu" style="background:'+color+'"></span><span><b>['+label+']</b> : '+html+'</span></div>';}
function _anaTopChannel(){return '인스타그램 (유입 41%)';}
function _anaTopLever(){return '오픈 D-14 이후 일 평균 +38석';}
function _anaDailySeries(){return [];}
`;

const P = `{name:'뮤지컬 <그날들>',genre:'뮤지컬(대형)',수익성:'수익성',totalOpen:3600,seats:2419,occ:67.2,deltaPP:0.9,목표:60,dday:49,dateStr:'9.18~9.20',_openSrc:'sum',_roundsN:3,noData:false,_mid:'P-2026-018'}`;

const col = (id, cap, sub) => `  <div class="col"><div class="cap">${cap} <span>${sub}</span></div>
    <div class="box srail"><div class="hd"><b>판매 현황</b><span id="nav-${id}" class="slot"></span></div><div class="pane"><div id="${id}"></div></div></div></div>`;

const harness = `<!doctype html><meta charset="utf-8"><title>공연별 접속통계 2면 — 전/후</title>
<style>${style}
body{margin:0;padding:22px;background:var(--bg);font-family:'Pretendard','Malgun Gothic',sans-serif;color:var(--text)}
.ba{display:flex;gap:20px;align-items:flex-start}
.ba .col{flex:1 1 380px;max-width:410px}
.ba .cap{font-size:13px;font-weight:800;color:var(--accent);margin:0 0 8px 2px}
.ba .cap span{font-weight:500;color:var(--dim);font-size:11px}
.box{background:rgba(255,255,255,.35);backdrop-filter:blur(7px);border:1px solid rgba(255,255,255,.7);border-radius:var(--radius-lg);box-shadow:var(--glass-shadow);overflow:hidden;height:640px;display:flex;flex-direction:column}
.hd{display:flex;align-items:center;gap:10px;min-height:47px;padding:1px 18px 0;background:rgba(255,255,255,.9);border-bottom:1px solid rgba(0,0,0,.07)}
.hd b{font-size:14px;font-weight:800;color:var(--accent);white-space:nowrap}
.hd .slot{display:inline-flex;align-items:center;gap:6px}
.pane{flex:1;min-height:0;overflow:auto;padding:2px 0 10px}
</style>
<div class="ba">
${col('before2', '전 (BEFORE) — 2면', '· 머지본: 요약 문장 없음 · 카드 2개 · 칸(640px) 넘쳐 스크롤')}
${col('after2', '후 (AFTER) — 2면', '· 맨 위 관심 타겟 문장 + 한 카드 압축 = 같은 칸 안에 다 들어감')}
${col('after1', '후 — 1면 (무접촉)', '· 본문 종전 그대로 · 넘김은 헤더 ‹ • • ›')}
</div>
<script>${data}</script>
<script>
${bundle(old, 'OLD')}
${bundle(now, 'NEW')}
window.NAVID='nav-before2'; OLD.setPage(2); OLD.drill({body:document.getElementById('before2')},${P},7);
window.NAVID='nav-after2'; NEW.setPage(2); NEW.drill({body:document.getElementById('after2')},${P},7);
window.NAVID='nav-after1'; NEW.setPage(1); NEW.drill({body:document.getElementById('after1')},${P},7);
</script>`;
fs.mkdirSync('docs/reports', { recursive: true });
fs.writeFileSync('docs/reports/260731_공연접속통계_전후.html', harness);
console.log('ok');
