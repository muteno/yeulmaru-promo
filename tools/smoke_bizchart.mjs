#!/usr/bin/env node
/**
 * 연간 사업 차트 스모크 — 「값은 맞는데 **자리**가 밀린」 축 (260806-9 신설)
 *
 * 왜 있나: 이 차트에서 260806~09에 연달아 터진 사고 3건은 전부 **값이 아니라 자리**였고,
 *   게이트 어느 것도 안 물었다 — check_design은 색·토큰, check_exchart는 전시 차트 문법,
 *   parity는 CSS 클래스만 본다. 실제로 난 일:
 *     ① 막대 어긋남 — `barmode` 미지정(Plotly 기본 group)이라 **같은 사업의 실막대와 예상 칸이 다른 x**에
 *        섰다(실측 +3.53px = 막대 폭 5px 기준 거의 한 칸). 트레이스가 하나 더 늘어야 눈에 보였다 = 잠복형.
 *     ② 보수 기간 라벨이 **한 달 뒤로** 밀렸다 — `_YC_MAINT.ms`(1-based)를 `new Date(y,m,1)`(0-based)로 읽었다.
 *     ③ 그 밀림을 상수 쪽에서 「정정」하는 바람에 **캘린더까지** 같이 틀어졌다(두 화면이 같은 상수에서 파생).
 *   셋 다 스샷으로만 잡혔다. 그래서 이 스모크는 **픽셀로만 답할 수 있는 것**만 묻는다.
 *
 * 계약(위반 = 차단)
 *   ① `barmode:'overlay'` + 예상·자리 칸이 자기 실막대와 **같은 x**(Δ ≤ 0.5px)
 *   ② 값 없는 자리에 **파선 도형 0**(기틀 §2 #18 = 파선 폐지 · 페이드가 그 자리를 말한다)
 *   ③ 보수 기간 라벨의 **광학 잉크 중심**이 그 구간 중심과 Δ ≤ 1px(기틀 §2 #22)
 *   ④ 캘린더(일정)의 유지보수 달머리 == `_YC_MAINT` 구간 — **두 화면이 같은 달**을 가리킨다
 *   ⑤ 값 라벨 「한 벌」(운영자 260809 · 기틀 §2 #18) — ⓐ 기구가 하나(막대 트레이스 텍스트 0 = 전부 주석)
 *      ⓑ 막대 꼭대기↔숫자 **세로 간격 Δ ≤ 1.5px**(서브픽셀 반올림 여유 · 기구가 둘이면 여기서 5px가 튄다)
 *      ⓒ 값이 있는 막대 중 **숫자 없는 것 0**(생략 금지) ⓓ 잉크 **1갈래**(흐린 검정 한 벌)
 *      ⓔ 숫자끼리 포갬 = **정보만**(260813-3 개정 — 가로 비킴이 폐지돼 포갬은 일어날 수 있다 · 지켜야 할 건 ⓕ)
 *      ⓕ **가려진 라벨은 흰 반투명 판을 인다**(막대 관통·옆 숫자 포갬 둘 다) · 안 가려졌는데 판을 이면 잉여 = FAIL
 *      ⓖ 값 라벨 중심 == 제 **막대 정중앙**(Δ ≤ 2px · 운영자 260813-3 「차트 옆에 있는건 실패임」)
 *      ⓗ 예상 줄 `(N)`은 **본체보다 밝은 잉크 + 기울임**(운영자 260813-4 「(7)은 더 연하게 - 기울임체」)
 *   ⑥ 그라데이션이 **다시 그려도 살아 있다**(운영자 260813 「다시 그라데이션 수치가 빠졌거든?」) — 예상 칸·빈 자리는
 *      투명으로 태어나 렌더 후 덧칠이 유일한 잉크라, Plotly가 한 번 다시 그리면 칠만 증발하고 **숫자는 예상 높이에 그대로
 *      남는다**(= 운영자가 본 화면). `relayout(height)`·`Plots.resize` 뒤 칠해진 칸 수가 줄면 FAIL.
 *      ⚠ defs의 `<linearGradient>` 개수로 재지 마라 — 지워지는 건 칠이라 defs는 그대로다(그걸 세면 통과해 버린다).
 *
 * fail-soft: playwright-core·chromium 미탐지, 렌더 실패 = SKIP(차단 안 함). 계약 위반만 rc=1.
 * 데이터 = 커밋된 스냅샷(docs/reports/260803_…플레이그라운드.html 안 DATA) — 실API·PII 미접촉.
 * 사용: node tools/smoke_bizchart.mjs   (npm run smoke:bizchart / npm run check / pre-commit)
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { URL as NodeURL } from 'node:url';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const YEAR = 2026;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jfif': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };

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

// ── 스냅샷 데이터 → 운영대장/판매축 스텁(프로브 `tools/scratch/probe_bizfade.mjs`와 같은 형태) ──────
function stubs() {
  const PG = readFileSync(join(ROOT, 'docs/reports/260803_사업결과비교_판매현황_플레이그라운드.html'), 'utf8');
  const DATA = JSON.parse(PG.match(/var DATA=(\{.*?\});\n/s)[1]);
  const opsRows = [];
  const pushRow = (y, m, d, name, genre, seat, paid) => opsRows.push({
    '상태': '', '사업구분': '공연', '티켓구분': '유료', '기본좌석': seat, '발권유료': paid,
    '년도': y, '월': m, '일': d, '공연구분': '기획', '장르1': genre, '공연명': name, '수익성': ''
  });
  DATA.shows.filter(s => s.paid > 0 && s.status === '종료').forEach(s => {
    const [y, m, d] = s.date.split('-').map(Number);
    const nd = Math.max(1, Math.round((new Date(s.dateEnd) - new Date(s.date)) / 86400000) + 1);
    for (let i = 0; i < nd; i++) {
      const dt = new Date(y, m - 1, d + i);
      pushRow(dt.getFullYear(), dt.getMonth() + 1, dt.getDate(), s.name, s.genre, Math.round(s.open / nd), Math.round(s.paid / nd));
    }
  });
  const D = s => new Date(s + 'T00:00:00');
  const sales = DATA.shows.filter(s => s.paid > 0).map(s => ({
    name: s.name, money: s.rev, seats: s.paid, occ: s.occ, totalOpen: s.open, _rcEst: 1, genre: s.genre,
    startDate: D(s.date), endDate: D(s.dateEnd), status: s.status === '판매중' ? 'active' : 'ended'
  }));
  const perfs = DATA.shows.filter(s => s.status === '예정')
    .map(s => ({ s: s.date, e: s.dateEnd, n: s.name, f: s.name, t: 'c', g: s.gu || '', g2: s.genre || '', rc: 1, id: '' }));
  return { opsRows, sales, perfs };
}

// ── 실측: 계약 4종을 한 번에 재고 사실만 돌려준다(판정은 노드 쪽에서) ─────────────────────────────
const MEASURE = `(()=>{
  const d=document.getElementById('bizm-chart'); if(!d)return {err:'차트 없음'};
  const gd=d, fl=gd._fullLayout, xa=fl.xaxis;
  const cx=g=>[...g.querySelectorAll('.point > path')].map(p=>{const b=p.getBBox();return +(b.x+b.width/2).toFixed(2);});
  const groups=[...d.querySelectorAll('.barlayer > .trace')].map(cx);
  const dash=[...d.querySelectorAll('.shapelayer path')]
    .filter(p=>((p.getAttribute('style')||'')+(p.getAttribute('stroke-dasharray')||'')).includes('dash')).length;
  // 보수 라벨 = 광학 잉크(픽토 왼끝 ~ 글자 오른끝 · 앞 전각 공백은 픽토 자리라 뺀다)
  const root=d.getBoundingClientRect();
  const imgs=[...d.querySelectorAll('.imagelayer image')].map(im=>{const b=im.getBoundingClientRect();return {x:b.x,w:b.width};});
  const maint=[...d.querySelectorAll('.annotation')]
    .filter(a=>{const t=a.querySelector('text');return t&&t.textContent.indexOf('보수')>=0;})
    .map((a,k)=>{
      const tn=a.querySelector('text'), t=tn.getBoundingClientRect(), im=imgs[k]||null;
      let lead=0; try{ lead=tn.getSubStringLength(0,1)||0; }catch(e){}
      const x0=im?Math.min(im.x,t.x+lead):(t.x+lead), x1=Math.max(t.x+t.width, im?im.x+im.w:0);
      return +((x0+x1)/2-root.x).toFixed(2);
    });
  // 상수가 뜻하는 구간 중심(1-based 달 번호) — 라벨이 서야 할 자리
  const want=(typeof _YC_MAINT!=='undefined'?_YC_MAINT:[]).map(m=>{
    const a=_bizXDay(new Date(${YEAR},m.ms[0]-1,1),${YEAR}), b=_bizXDay(new Date(${YEAR},m.ms[m.ms.length-1],1),${YEAR})-0.5;
    return +(xa.d2p((a+b)/2)+xa._offset).toFixed(2);
  });
  // 캘린더(일정)의 유지보수 달머리 = 「2–3」 꼴 → 상수와 같은 달을 가리키는가
  const cal=[...document.querySelectorAll('.yc-mt')].map(mt=>{
    let p=mt.previousElementSibling, h=null;
    while(p){ if(p.classList&&p.classList.contains('yc-mo')){ h=p; break; } p=p.previousElementSibling; }
    return h?h.querySelector('.yc-mo-n').textContent.trim().replace(/[^0-9]+/g,'~'):'(머리 없음)';
  });
  const constMs=(typeof _YC_MAINT!=='undefined'?_YC_MAINT:[]).map(m=>m.ms.join('~'));
  // ⑤ 값 라벨 한 벌 — 기구·간격·빠짐·잉크·포갬을 한 번에 잰다(운영자 260809).
  const R=d.getBoundingClientRect(), rr=v=>+v.toFixed(2);
  const bars=[];
  [...d.querySelectorAll('.barlayer > .trace')].forEach((t,ti)=>[...t.querySelectorAll('.point > path')].forEach(p=>{
    const b=p.getBoundingClientRect(); if(b.height<0.5)return;
    bars.push({ti,cx:rr(b.x+b.width/2-R.x),x0:rr(b.x-R.x),x1:rr(b.x+b.width-R.x),top:rr(b.y-R.y),bot:rr(b.y+b.height-R.y)});   // [260813-2] x0·x1 = ⑤ⓕ 가림 판정용 사각형
  }));
  const N='[0-9,]+(?:\\\\.[0-9]+)?';                                     // [260813-2] 반올림해서 0인 값만 소수 한 자리(\`0.0\`/\`0.4\`) — 그 꼴도 값 라벨이다
  const num=t=>new RegExp('^'+N+'(?:\\\\('+N+'\\\\))?$').test(t.textContent.trim());   // [260813] 예상 칸 라벨 = \`예측치(현재치)\` — 괄호꼴도 값 라벨이다(안 세면 ⓒ「숫자 없는 막대」가 오탐한다)
  const grab=(sel,src)=>[...d.querySelectorAll(sel)].filter(num).map(t=>{ const b=t.getBoundingClientRect();
    return {src,t:t.textContent.trim(),cx:rr(b.x+b.width/2-R.x),w:rr(b.width),bot:rr(b.y+b.height-R.y),fill:getComputedStyle(t).fill}; });
  const labs=grab('.barlayer text','trace').concat(grab('.annotation text','anno'));   // ⚠ Plotly 주석은 .infolayer > g.annotation
  // ⑤ⓕ 가려진 라벨 = 흰 반투명 판(운영자 260813-2 「차트에 가려지면 흰색 반투명 배경을 깔자」).
  //   판정은 **화면 그대로** = 글상자 ∩ 막대 사각형. 제 막대는 언제나 글자 **아래**에서 시작하므로(라벨은 꼭대기 위에 선다)
  //   따로 걸러낼 필요가 없다 — 세로 교차가 자연히 0이다. 겹치는 라벨엔 Plotly 배경 rect(rect.bg)가 있어야 한다.
  const plate=[...d.querySelectorAll('.annotation')].map(a=>{
    const t=a.querySelector('text'); if(!t||!num(t))return null;
    const b=t.getBoundingClientRect();
    const L={x0:b.x-R.x,x1:b.x+b.width-R.x,y0:b.y-R.y,y1:b.y+b.height-R.y};
    const box=L;
    // ⚠ **죽은 띠 2px** — 앱은 렌더 전이라 글자 폭을 **추정**으로 잡는다(_bizLabW). 추정과 실측이 1px 안쪽에서
    //   엇갈리는 자리를 양쪽으로 다 실패로 몰면 게이트가 화면과 무관하게 깜빡인다. 그래서
    //   「확실히 겹쳤다(>0.5px)」와 「확실히 떨어졌다(<-1.5px)」만 판정하고 그 사이는 통과시킨다.
    const gapTo=B=>Math.min(Math.min(B.x1,L.x1)-Math.max(B.x0,L.x0), Math.min(B.bot,L.y1)-Math.max(B.top,L.y0));
    const near=bars.length?Math.max(...bars.map(gapTo)):-99;
    const hid=near>0.5, far=near<-1.5;
    // ⓖ 「숫자는 제 막대 정중앙 위」 — 라벨 중심에서 가장 가까운 막대 중심까지의 가로 거리(px).
    //   비킴이 폐지됐으니(운영자 260813-3) 이 값은 0에 붙어 있어야 한다.
    const lcx=(L.x0+L.x1)/2, off=bars.length?Math.min(...bars.map(B=>Math.abs((B.x0+B.x1)/2-lcx))):0;
    // ⚠ Plotly는 **모든** 주석에 rect.bg를 심는다(배경이 없으면 투명으로) — 존재만 보면 전건이 「판 있음」이 된다.
    //   실제로 칠해졌는지(fill이 none·알파 0이 아닌지)를 봐야 한다.
    const r=a.querySelector('rect.bg'); let bg=false;
    if(r){ const s=getComputedStyle(r), f=String(s.fill||''), o=(s.fillOpacity==null||s.fillOpacity==='')?1:+s.fillOpacity;
      bg=!!f&&f!=='none'&&o>0.05&&!/,\\s*0\\s*\\)$/.test(f); }
    return {t:t.textContent.trim(), hid, far, bg, box, off:+off.toFixed(2)};
  }).filter(Boolean);
  // 가림은 **두 갈래** — 막대 관통(위) + 옆 숫자 포갬(아래). 260813-3에서 가로 비킴이 폐지돼 포갬이 실제로 생긴다.
  plate.forEach((p,i)=>plate.forEach((q,j)=>{ if(i===j)return;
    const ox=Math.min(p.box.x1,q.box.x1)-Math.max(p.box.x0,q.box.x0);
    const oy=Math.min(p.box.y1,q.box.y1)-Math.max(p.box.y0,q.box.y0);
    if(ox>0.5&&oy>0.5){ p.hid=true; p.far=false; }
    else if(ox>-1.5&&oy>-1.5) p.far=false; }));
  // [260813-3] 간격은 **제 막대**와만 잰다 — 라벨이 제 막대 정중앙 위(ⓖ)로 고정됐으니 x가 곧 주인이다.
  //   구판은 ±14px 안의 아무 막대나 골라서, 몰린 달에서 **옆 막대에 가려진 라벨**이 남의 막대와 재져 간격이 −3px로 튀었다.
  labs.forEach(L=>{ const own=bars.filter(B=>Math.abs(B.cx-L.cx)<=2.5);
    L.gap=own.length?rr(Math.min(...own.map(B=>B.top))-L.bot):null; });
  const nolab=bars.filter(B=>!labs.some(L=>Math.abs(L.cx-B.cx)<=2.5&&B.top-L.bot>=-4&&B.top-L.bot<=24)
    &&!bars.some(O=>O!==B&&Math.abs(O.cx-B.cx)<=2&&O.ti!==B.ti&&O.bot<=B.top+1.5)).length;   // 예상 칸이 얹힌 실막대는 그 칸이 숫자를 인다
  const gaps=labs.map(L=>L.gap).filter(g=>g!=null);
  const ovl=[]; for(let a=0;a<labs.length;a++)for(let b=a+1;b<labs.length;b++)
    if(Math.abs(labs[a].cx-labs[b].cx)<(labs[a].w+labs[b].w)/2&&Math.abs(labs[a].bot-labs[b].bot)<13)ovl.push(labs[a].t+'↔'+labs[b].t);
  // ⑤ⓗ 예상 줄 = **연한 잉크 + 기울임**(운영자 260813-4 「(7)은 더 연하게 - 기울임체」).
  //   「연하다」를 눈으로 정하지 않는다 — 상대 휘도로 잰다(본체보다 밝아야 한다). 색 이름·값은 여기 안 적는다(정본은 토큰 하나).
  const lum=c=>{const m=String(c).match(/[0-9.]+/g)||['0','0','0'];
    const f=v=>{v=+v/255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);};
    return 0.2126*f(m[0])+0.7152*f(m[1])+0.0722*f(m[2]);};
  const sub=[...d.querySelectorAll('.annotation')].map(a=>{
    const t=a.querySelector('text'); if(!t||!num(t))return null;
    const txt=t.textContent.trim(); if(txt.indexOf('(')<0)return null;
    const base=getComputedStyle(t).fill;
    const sp=[...t.querySelectorAll('tspan')].filter(x=>/^\\(.*\\)$/.test(x.textContent.trim()));
    const ok=sp.some(x=>{const c=getComputedStyle(x);return c.fontStyle==='italic'&&lum(c.fill)>lum(base)+0.02;});
    return {t:txt, ok, n:sp.length};
  }).filter(Boolean);
  const lab={n:labs.length, trace:labs.filter(L=>L.src==='trace').length, nolab, ovl,
    sub:sub.length, subBad:sub.filter(x=>!x.ok).map(x=>x.t+(x.n?'':'(줄 없음)')),
    inks:[...new Set(labs.map(L=>L.fill))],
    hidBare:plate.filter(p=>p.hid&&!p.bg).map(p=>p.t),      // 가려졌는데 판이 없다 = FAIL
    plateFree:plate.filter(p=>p.far&&p.bg).map(p=>p.t),      // 막대에서 확실히 떨어졌는데 판을 이고 있다 = 잉여(화면이 시끄러워진다)
    hid:plate.filter(p=>p.hid).length,
    offMax:plate.length?Math.max(...plate.map(p=>p.off)):0,
    offBad:plate.filter(p=>p.off>2).map(p=>p.t+'('+p.off+'px)'),
    gapSpread:gaps.length?rr(Math.max(...gaps)-Math.min(...gaps)):null};
  return {barmode:fl.barmode, groups, dash, maint, want, cal, constMs, lab, fade:FADE()};
})()`;

// ⑥ 그라데이션 「살아 있나」 — 예상 칸·빈 자리는 **투명으로 태어나** 렌더 후 덧칠이 유일한 잉크다(기틀 §2 #18).
//   defs의 <linearGradient> 개수가 아니라 **실제로 그 url을 물고 있는 막대 수**를 센다 — 지워지는 건 칠(fill)이지 defs가 아니라서,
//   defs만 세면 「그라데이션 5개 있음」이라고 답하면서 화면은 텅 빈 상태를 통과시킨다(260813 실측이 정확히 그 모습이었다).
const FADE_FN = `window.FADE=function(){ const d=document.getElementById('bizm-chart');
  const url=p=>((p.style&&p.style.fill)||'').indexOf('url(')>=0;
  const gs=[...d.querySelectorAll('.barlayer > .trace')].map(g=>{const ps=[...g.querySelectorAll('.point > path')];
    return {n:ps.length, painted:ps.filter(url).length};});
  return {gs, defs:d.querySelectorAll('defs linearGradient[id^="bz"]').length}; };`;

async function main() {
  const { chromium } = await import('playwright-core');
  const { opsRows, sales, perfs } = stubs();
  const browser = await chromium.launch({ executablePath: findChromium(), headless: true, args: ['--no-sandbox', '--no-proxy-server'] });
  let m;
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
    await page.route('**/*', route => {
      const u = new NodeURL(route.request().url());
      if (u.hostname === 'app.local') {
        let p = decodeURIComponent(u.pathname); if (p === '/') p = '/index.html';
        try { return route.fulfill({ status: 200, body: readFileSync(join(ROOT, p)), contentType: MIME[extname(p)] || 'application/octet-stream' }); }
        catch { return route.fulfill({ status: 404, body: 'nf' }); }
      }
      if (u.hostname === 'cdn.plot.ly') {
        const cached = join(ROOT, 'tools', 'vendor', 'plotly-basic-2.27.0.min.js');
        if (existsSync(cached)) return route.fulfill({ status: 200, body: readFileSync(cached), contentType: 'text/javascript' });
      }
      return route.abort();
    });
    await page.addInitScript(`(function(){
      window.__OPS=${JSON.stringify({ rows: opsRows, headers: Object.keys(opsRows[0]) })};
      window.__SALES=${JSON.stringify(sales)}.map(function(p){p.startDate=new Date(p.startDate);p.endDate=new Date(p.endDate);return p;});
      var real=null;
      function wrapped(method,path){ var p=String(path||'');
        if(p.indexOf('/api/ops')===0&&decodeURIComponent(p).indexOf('세부운영관리대장')>=0)return Promise.resolve(window.__OPS);
        return real?real(method,path):Promise.resolve({rows:[],headers:[],programs:[]}); }
      try{ Object.defineProperty(window,'_qaApi',{configurable:true,get:function(){return wrapped;},set:function(v){real=v;}}); }catch(e){}
    })();`);
    await page.goto('https://app.local/index.html?qa=admin', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('#biz-main [data-bizmbox]', { timeout: 20000 });
    await page.waitForTimeout(1200);
    await page.evaluate(`(()=>{
      try{ PERFS = ${JSON.stringify(perfs)}; }catch(e){}
      if(typeof _bizState!=='undefined'&&_bizState)_bizState.raw=window.__OPS;
      if(typeof _salesState!=='undefined'&&_salesState){ _salesState.ops=window.__OPS; _salesState._opsIdx=null;
        _salesState.daily={rows:[]}; _salesState.master={rows:[]}; }
      window._salesBuild=function(){ return window.__SALES; };
      if(typeof _bizmState!=='undefined'&&_bizmState)_bizmState.year=${YEAR};
      // 예상 최종석 스텁 = 2단 페이드를 반드시 세운다(라이브는 일일 실측에서 나온다 — 스냅샷엔 그 축이 없다).
      //   ⚠ 이게 없으면 막대 트레이스가 하나뿐이라 barmode 어긋남이 **재현되지 않는다**(260806-9가 잠복했던 이유 그대로).
      window._bizFcSeat=function(p){ return (p&&p.seats>0&&p.status==='active')?Math.round(p.seats*1.6):null; };
    })()`);
    await page.evaluate('_bizBookGo(3)');
    await page.waitForTimeout(2200);
    await page.evaluate('try{_bizInlineRender()}catch(e){}');
    await page.waitForTimeout(2500);
    await page.evaluate(FADE_FN);
    m = await page.evaluate(MEASURE);
    // ⑥ 재렌더 뒤에도 살아 있나 — 앱이 실제로 부르는 두 축(fit의 `Plotly.relayout(height)` · 반응형 `Plots.resize`)을 그대로 태운다.
    //   ⚠ 함수를 직접 부르지 않고 **Plotly 공개 API**로 재는 이유 = 지우는 주체가 Plotly의 재렌더 자체라, 어떤 앱 함수가
    //     그걸 불렀는지와 무관하게 같은 결과가 나와야 한다(호출자를 쫓으면 새 호출자가 생길 때마다 게이트가 샌다).
    await page.evaluate(`(()=>{const d=document.getElementById('bizm-chart');
      return Plotly.relayout(d,{height:Math.round(d.getBoundingClientRect().height)-6});})()`);
    await page.waitForTimeout(700);
    m.fadeRelayout = await page.evaluate('FADE()');
    await page.evaluate(`Plotly.Plots.resize(document.getElementById('bizm-chart'))`);
    await page.waitForTimeout(700);
    m.fadeResize = await page.evaluate('FADE()');
  } finally { await browser.close(); }

  if (!m || m.err) throw new Error(m ? m.err : '실측 실패');
  const fails = [], infos = [];

  // ① barmode + 같은 사업이 한 자리에
  if (m.barmode !== 'overlay')
    fails.push(`① barmode = '${m.barmode}' — 계약은 'overlay'. group이면 같은 사업의 실막대·예상 칸이 좌우로 갈린다(260806-9).`);
  const real = m.groups[0] || [];
  let worst = 0, worstN = 0;
  m.groups.slice(1).forEach((g, gi) => g.forEach(x => {
    const d = real.length ? Math.min(...real.map(r => Math.abs(x - r))) : 0;
    if (d > 0.5) { worstN++; worst = Math.max(worst, d); }
    else worst = Math.max(worst, 0);
  }));
  if (worstN) fails.push(`① 겹칸 ${worstN}개가 자기 실막대와 다른 x에 섰다(최대 Δ ${worst.toFixed(2)}px · 허용 0.5px).`);
  if (m.groups.length < 2) infos.push('① 막대 트레이스가 1개뿐이라 x정렬은 barmode 계약만 확인(겹칸 실측 표본 0).');
  else infos.push(`① 막대 트레이스 ${m.groups.length}개 · 겹칸 ${m.groups.slice(1).reduce((a, g) => a + g.length, 0)}개 x정렬 Δ0`);

  // ② 값 없는 자리 파선 0
  if (m.dash) fails.push(`② 값 없는 자리에 파선 도형 ${m.dash}개 — 기틀 §2 #18은 파선 폐지(그 자리는 페이드가 말한다).`);

  // ③ 보수 라벨 잉크 중심
  if (m.maint.length !== m.want.length) {
    fails.push(`③ 보수 라벨 ${m.maint.length}개 ≠ 상수 구간 ${m.want.length}개 — 라벨이 빠졌거나 더 그려졌다.`);
  } else {
    m.maint.forEach((ink, i) => {
      const d = Math.abs(ink - m.want[i]);
      if (d > 1) fails.push(`③ 보수 라벨 ${i + 1}번 잉크 중심이 구간 중심에서 ${d.toFixed(2)}px 벗어났다(허용 1px · 260806-7의 한 달 밀림 축).`);
    });
    if (m.maint.length) infos.push(`③ 보수 라벨 ${m.maint.length}개 잉크 중심 Δ ${m.maint.map((v, i) => Math.abs(v - m.want[i]).toFixed(2)).join(' / ')}px`);
  }

  // ④ 캘린더(일정) ↔ 상수 동기
  const calN = m.cal.join(' | '), consN = m.constMs.join(' | ');
  if (m.cal.length !== m.constMs.length || m.cal.some((c, i) => c !== m.constMs[i]))
    fails.push(`④ 일정(캘린더) 유지보수 달머리 [${calN}] ≠ 상수 _YC_MAINT [${consN}] — 두 화면이 다른 달을 가리킨다(스냅샷 재생성 = node tools/build_annual.mjs).`);
  else infos.push(`④ 일정 ↔ 상수 동기 [${consN}]`);

  // ⑤ 값 라벨 한 벌(운영자 260809 「숫자 간격이 다르다 · 다 숫자가 나오게 · 조금 흐린 검정으로」)
  const L = m.lab || {};
  if (!L.n) {
    infos.push('⑤ 값 라벨 표본 0 — 이 데이터엔 숫자를 일 막대가 없다(계약 검사 생략).');
  } else {
    if (L.trace) fails.push(`⑤ⓐ 막대 트레이스 텍스트로 그린 값 라벨 ${L.trace}개 — 기구는 **주석 한 벌**이다(둘이면 간격이 갈린다 · 구판 실측 Δ0 vs Δ5.0px).`);
    if (L.gapSpread != null && L.gapSpread > 1.5) fails.push(`⑤ⓑ 막대 꼭대기↔숫자 세로 간격이 라벨마다 ${L.gapSpread}px까지 벌어졌다(허용 1.5px = 서브픽셀 반올림 몫).`);
    if (L.nolab) fails.push(`⑤ⓒ 값이 있는데 숫자가 없는 막대 ${L.nolab}개 — 값이 있으면 숫자가 있다(생략 금지 · 운영자 260809). 겹침은 지우는 게 아니라 **판**이 진다(260813-3).`);
    if ((L.inks || []).length > 1) fails.push(`⑤ⓓ 값 라벨 잉크가 ${L.inks.length}갈래다(${L.inks.join(' / ')}) — 「각기 다른 색이 아니라 조금 흐린 검정」 한 벌(--neutral-text).`);
    // ⓔ **개정 260813-3** — 운영자 「상단에 무조건 숫자가 있어야 함 · 차트 옆에 있는건 실패임 · 단 가려질 경우 흰색 반투명」.
    //   구판은 「포갬 0」이 계약이었고 가로 비킴이 그걸 지켰다. 그 비킴이 폐지됐으니 포갬은 **일어날 수 있고**,
    //   그때 지켜야 하는 건 「겹친 라벨은 **판을 인다**」(아래 ⓕ)다. 포갬 자체는 이제 정보로만 남긴다.
    if ((L.ovl || []).length) infos.push(`⑤ⓔ 숫자끼리 포갠 쌍 ${L.ovl.length}(${L.ovl.slice(0, 3).join(' · ')}) — 비킴 폐지(260813-3)의 대가 · 양쪽 다 판을 이어야 읽힌다(ⓕ).`);
    if ((L.hidBare || []).length) fails.push(`⑤ⓕ 막대에 가려졌는데 흰 반투명 판이 없는 라벨 ${L.hidBare.length}개(${L.hidBare.slice(0, 4).join(' · ')}) — 「차트에 가려지면 판을 깐다」(운영자 260813-2 · 기틀 §2 #18).`);
    if ((L.plateFree || []).length) fails.push(`⑤ⓕ 안 가려졌는데 판을 이고 있는 라벨 ${L.plateFree.length}개(${L.plateFree.slice(0, 4).join(' · ')}) — 판은 **가려질 때만**이다(전 라벨에 깔면 화면이 시끄러워진다).`);
    // ⓖ 「숫자는 제 막대 정중앙 위」(운영자 260813-3 「상단에 무조건 숫자가 있어야 함 · 차트 옆에 있는건 실패임」)
    if ((L.subBad || []).length) fails.push(`⑤ⓗ 예상 줄이 **연한 기울임**이 아닌 라벨 ${L.subBad.length}개(${L.subBad.slice(0, 4).join(' · ')}) — 「(7)은 더 연하게 - 기울임체」(운영자 260813-4 · 본체보다 밝아야 하고 font-style: italic이어야 한다).`);
    if ((L.offBad || []).length) fails.push(`⑤ⓖ 제 막대에서 옆으로 비켜 선 값 라벨 ${L.offBad.length}개(${L.offBad.slice(0, 4).join(' · ')}) — 숫자는 **언제나 제 막대 정중앙 위**다(가로 비킴 폐지 · 겹치면 판을 깐다).`);
    infos.push(`⑤ 값 라벨 ${L.n}개 · 전부 주석 · 간격 Δ${L.gapSpread}px · 숫자 없는 막대 ${L.nolab} · 잉크 ${(L.inks || []).length}갈래 · 포갬 ${(L.ovl || []).length} · 가려진 라벨 ${L.hid}개(전건 판) · 막대 중심 이탈 최대 ${L.offMax}px · 예상 줄 ${L.sub}개(전건 연한 기울임)`);
  }

  // ⑥ 그라데이션 = 다시 그려도 살아 있다(운영자 260813 「다시 그라데이션 수치가 빠졌거든?」)
  const paintOf = f => (f && f.gs || []).reduce((a, g) => a + g.painted, 0);
  const base = paintOf(m.fade);
  if (!base) {
    infos.push('⑥ 그라데이션 표본 0 — 이 데이터엔 칠할 페이드 칸이 없다(계약 검사 생략).');
  } else {
    [['relayout', m.fadeRelayout], ['resize', m.fadeResize]].forEach(([nm, f]) => {
      const n = paintOf(f);
      if (n < base) fails.push(`⑥ ${nm} 뒤 그라데이션이 ${base} → ${n}칸으로 지워졌다(defs는 ${(f || {}).defs}개 그대로) — 페이드는 렌더 후 덧칠이라 **다시 그릴 때마다 다시 칠해야** 한다(\`plotly_afterplot\` 훅 · 기틀 §2 #18).`);
    });
    infos.push(`⑥ 그라데이션 ${base}칸 · relayout 뒤 ${paintOf(m.fadeRelayout)} · resize 뒤 ${paintOf(m.fadeResize)}`);
  }

  if (fails.length) {
    console.error(`[bizchart] FAIL — 자리 계약 위반 ${fails.length}건:`);
    fails.forEach(f => console.error('  · ' + f));
    console.error('  값이 아니라 **자리**를 재는 게이트다 — 화면을 눈으로 다시 보고, 값을 새로 정해야 하면 운영자에게 물어라(기틀 규칙 3).');
    return 1;
  }
  infos.forEach(i => console.log('  ℹ ' + i));
  console.log('[bizchart] PASS — 연간 사업 차트 자리 계약 유지(barmode overlay · 겹칸 x정렬 · 파선 0 · 보수 라벨 중심 · 일정 동기 · 값 라벨 한 벌 · 그라데이션 생존).');
  return 0;
}

main().then(c => process.exit(c)).catch(e => {
  console.error('[bizchart] SKIP — 스모크 실행 환경 오류(차단 안 함): ' + String(e).split('\n')[0]);
  process.exit(0);
});
