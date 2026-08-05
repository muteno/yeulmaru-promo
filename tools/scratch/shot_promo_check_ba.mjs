#!/usr/bin/env node
// AI 홍보·점검 모달 실측/촬영 — smoke_layout.mjs 하네스 골격 계승(가상호스트 서빙 + ?qa=admin).
// 실API·실데이터 미접촉: PERFS/records는 운영자 스샷 화면을 재현한 형태 목데이터.
import { existsSync, readdirSync, readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { dirname, join, extname } from 'node:path';

const ROOT = '/home/user/yeulmaru-promo';
const OUT = process.argv[2] || 'before';
const OUTDIR = '/tmp/claude-0/-home-user-yeulmaru-promo/1d951faa-975b-516a-be61-347ae8a84e72/scratchpad/shots';
mkdirSync(OUTDIR, { recursive: true });
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

// 운영자 스샷 재현 목데이터 — 오늘=2026-08-05 기준
const MOCK = `(()=>{
  var T='2026-08-05';
  var perfs=[];
  function P(o){ perfs.push(o); return o; }
  // A0 = 홍보 불가(ps=false) + 판매시작 임박
  P({id:'A1',f:'연극 <그때도 오늘>',n:'그때도 오늘',ss:'2026-08-26',se:'2026-10-01',e:'2026-10-01',pf:'',ps:false});
  P({id:'A2',f:'브런치 콘서트 IV <찬란한 시작의 울림>',n:'브런치 콘서트 IV',ss:'2026-09-03',se:'2026-10-01',e:'2026-10-01',pf:'',ps:false});
  P({id:'A3',f:'2026 헬로!오페라 <마술피리>',n:'헬로!오페라',ss:'2026-09-09',se:'2026-10-01',e:'2026-10-01',pf:'',ps:false});
  P({id:'A4',f:'연극 <쉬어 매드니스>',n:'쉬어 매드니스',ss:'2026-09-16',se:'2026-10-01',e:'2026-10-01',pf:'',ps:false});
  // A5 = 홍보 열림 + 티켓오픈 D-1 (그날 카톡 자리 이미 있음)
  P({id:'B1',f:'여수세계섬박람회 기념 음악회',n:'섬박람회 음악회',ss:'2026-08-06',se:'2026-12-31',e:'2026-12-31',pf:'',ps:true});
  // 나머지 홍보 열린 공연 10건(합 11) — ss는 D-3 밖, se는 D-14 밖이라 A5/A2에 안 걸린다
  var mates=['2026 헬로!오페라 <세비야의 이발사>','2026 가을 정기연주회','2026 실내악 시리즈 III','전시 <빛의 결>',
             '2026 어린이 가족극 <숲의 노래>','2026 대중음악 콘서트','2026 발레 갈라','2026 국악 한마당',
             '2026 재즈 나이트','2026 송년음악회'];
  mates.forEach(function(nm,i){
    P({id:'C'+i,f:nm,n:(i===0?'헬로!오페라':nm.replace(/^2026 /,'')),ss:'2026-07-0'+((i%9)+1),se:'2026-12-31',e:'2026-12-31',pf:'',ps:true});
  });
  PERFS=perfs;
  _perfReady=true;

  // records — 전체 슬롯 134행(과거 102 + 미래 32). 미래 중 2건은 프로그램 시트 미조인.
  var recs=[];
  function R(iso,prog,plat,title){
    var p=iso.split('-');
    recs.push({'연도':+p[0],'월':+p[1],'일':+p[2],'프로그램':prog,'플랫폼 1':plat,'플랫폼 2':'-',
      '콘텐츠 제목':title||prog,'진행 상태':(iso>=T?'예정':'완료'),'임시저장':'N'});
  }
  R('2026-08-06','여수세계섬박람회 기념 음악회','카카오톡');           // A5 taken=true
  R('2026-09-02','존재하지 않는 프로그램 A','인스타그램');              // 미조인 1
  R('2026-09-04','존재하지 않는 프로그램 B','블로그·맘카페');            // 미조인 2
  // 미래 29건 더 (연일 발송 경고를 안 내려고 카카오·문자는 안 쓴다)
  var d=new Date('2026-08-10T00:00:00');
  for(var i=0;i<29;i++){
    var iso=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    R(iso, mates[i%mates.length], (i%2?'인스타그램':'블로그·맘카페'));
    d.setDate(d.getDate()+3);
  }
  // 과거 102건
  var g=new Date('2026-01-05T00:00:00');
  for(var j=0;j<102;j++){
    var iso2=g.getFullYear()+'-'+String(g.getMonth()+1).padStart(2,'0')+'-'+String(g.getDate()).padStart(2,'0');
    R(iso2, mates[j%mates.length], (j%2?'인스타그램':'블로그·맘카페'));
    g.setDate(g.getDate()+2);
  }
  records=recs;
  window.getApplyMonths=function(){return [];};              // '접수월 낡음' 항목 비활성(스샷 재현)
  try{ APPLY_SETTINGS=APPLY_SETTINGS||{}; APPLY_SETTINGS['AI_연일회피']=false; }catch(e){}
  return {perfs:PERFS.length, recs:records.length};
})()`;

const MEASURE = `(()=>{
  var m=document.querySelector('#promo-check .modal');
  var x=document.querySelector('#promo-check .modal-x');
  var mb=m.getBoundingClientRect(), xb=x.getBoundingClientRect();
  var cs=getComputedStyle(x);
  var cards=[].slice.call(document.querySelectorAll('#promo-check .bizm-card'));
  var gaps=[];
  for(var i=1;i<cards.length;i++){
    gaps.push(+(cards[i].getBoundingClientRect().top - cards[i-1].getBoundingClientRect().bottom).toFixed(2));
  }
  var stat=document.querySelector('#promo-check .modal>div:last-child>div:last-child');
  var lastCard=cards[cards.length-1];
  var titles=[].slice.call(document.querySelectorAll('#promo-check .bizm-card>div:first-child')).map(function(t){
    var c=getComputedStyle(t);
    return {text:(t.childNodes[0].textContent||'').trim(), color:c.color, fs:c.fontSize, fw:c.fontWeight};
  });
  var scroll=document.querySelector('#promo-check .modal>div:last-child');
  return {
    modal:{top:+mb.top.toFixed(1),right:+mb.right.toFixed(1),w:+mb.width.toFixed(1),h:+mb.height.toFixed(1)},
    x:{pos:cs.position,float:cs.float,top:+xb.top.toFixed(1),right:+xb.right.toFixed(1),left:+xb.left.toFixed(1),
       fromModalRight:+(mb.right-xb.right).toFixed(1), fromModalTop:+(xb.top-mb.top).toFixed(1)},
    cardCount:cards.length,
    cardMarginBottom:getComputedStyle(cards[0]).marginBottom,
    gaps:gaps,
    lastCardToStat: stat? +(stat.getBoundingClientRect().top - lastCard.getBoundingClientRect().bottom).toFixed(2) : null,
    scrollPadTop: getComputedStyle(scroll).paddingTop,
    titles:titles
  };
})()`;

async function main() {
  const { chromium } = await import('playwright-core');
  const exe = findChromium();
  const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--no-sandbox', '--no-proxy-server'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).split('\n')[0]));
  await page.route('**/*', route => {
    const u = new NodeURL(route.request().url());
    if (u.hostname === 'app.local') {
      let p = decodeURIComponent(u.pathname); if (p === '/') p = '/index.html';
      try { return route.fulfill({ status: 200, body: readFileSync(join(ROOT, p)), contentType: MIME[extname(p)] || 'application/octet-stream' }); }
      catch { return route.fulfill({ status: 404, body: 'nf' }); }
    }
    return route.abort();
  });
  await page.goto('https://app.local/index.html?qa=admin', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2500);
  const seeded = await page.evaluate(MOCK);
  await page.evaluate(`openPromoCheck()`);
  await page.waitForTimeout(500);
  const m = await page.evaluate(MEASURE);
  console.log('seed', JSON.stringify(seeded));
  console.log(JSON.stringify(m, null, 1));
  if (errs.length) console.log('pageerror:', errs.slice(0, 4));
  // 모달 바깥 12px 여백까지 = 창 모서리(둥근 모서리·X 자리)가 잘리지 않게
  const box = await page.evaluate(`(()=>{const b=document.querySelector('#promo-check .modal').getBoundingClientRect();
    return {x:Math.floor(b.left)-12,y:Math.floor(b.top)-12,width:Math.ceil(b.width)+24,height:Math.ceil(b.height)+24};})()`);
  await page.screenshot({ path: join(OUTDIR, OUT + '.png'), clip: box });
  await browser.close();
}
main();
