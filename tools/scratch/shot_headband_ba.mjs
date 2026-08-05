#!/usr/bin/env node
// AI 홍보·점검 + 카카오 메세지 설계 — 머리줄 밴드 전후 실측/촬영 (shot_promo_check_ba.mjs 골격 계승)
// 실API·실데이터 미접촉: PERFS/records는 운영자 스샷 재현 목데이터.
import { existsSync, readdirSync, readFileSync, mkdirSync } from 'node:fs';
import { URL as NodeURL } from 'node:url';
import { dirname, join, extname } from 'node:path';

const ROOT = '/home/user/yeulmaru-promo';
const OUT = process.argv[2] || 'before';
const OUTDIR = '/tmp/claude-0/-home-user-yeulmaru-promo/952f20e1-29b3-5fe6-9113-7b9cd23b172a/scratchpad/shots';
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

// 운영자 스샷 재현 목데이터 — 오늘=2026-08-05 기준 (shot_promo_check_ba.mjs 원본 그대로)
const MOCK = `(()=>{
  var T='2026-08-05';
  var perfs=[];
  function P(o){ perfs.push(o); return o; }
  P({id:'A1',f:'연극 <그때도 오늘>',n:'그때도 오늘',ss:'2026-08-26',se:'2026-10-01',e:'2026-10-01',pf:'',ps:false});
  P({id:'A2',f:'브런치 콘서트 IV <찬란한 시작의 울림>',n:'브런치 콘서트 IV',ss:'2026-09-03',se:'2026-10-01',e:'2026-10-01',pf:'',ps:false});
  P({id:'A3',f:'2026 헬로!오페라 <마술피리>',n:'헬로!오페라',ss:'2026-09-09',se:'2026-10-01',e:'2026-10-01',pf:'',ps:false});
  P({id:'A4',f:'연극 <쉬어 매드니스>',n:'쉬어 매드니스',ss:'2026-09-16',se:'2026-10-01',e:'2026-10-01',pf:'',ps:false});
  P({id:'B1',f:'여수세계섬박람회 기념 음악회',n:'섬박람회 음악회',ss:'2026-08-06',se:'2026-12-31',e:'2026-12-31',pf:'',ps:true});
  var mates=['2026 헬로!오페라 <세비야의 이발사>','2026 가을 정기연주회','2026 실내악 시리즈 III','전시 <빛의 결>',
             '2026 어린이 가족극 <숲의 노래>','2026 대중음악 콘서트','2026 발레 갈라','2026 국악 한마당',
             '2026 재즈 나이트','2026 송년음악회'];
  mates.forEach(function(nm,i){
    P({id:'C'+i,f:nm,n:(i===0?'헬로!오페라':nm.replace(/^2026 /,'')),ss:'2026-07-0'+((i%9)+1),se:'2026-12-31',e:'2026-12-31',pf:'',ps:true});
  });
  PERFS=perfs;
  _perfReady=true;
  var recs=[];
  function R(iso,prog,plat,title){
    var p=iso.split('-');
    recs.push({'연도':+p[0],'월':+p[1],'일':+p[2],'프로그램':prog,'플랫폼 1':plat,'플랫폼 2':'-',
      '콘텐츠 제목':title||prog,'진행 상태':(iso>=T?'예정':'완료'),'임시저장':'N'});
  }
  R('2026-08-06','여수세계섬박람회 기념 음악회','카카오톡');
  R('2026-09-02','존재하지 않는 프로그램 A','인스타그램');
  R('2026-09-04','존재하지 않는 프로그램 B','블로그·맘카페');
  var d=new Date('2026-08-10T00:00:00');
  for(var i=0;i<29;i++){
    var iso=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    R(iso, mates[i%mates.length], (i%2?'인스타그램':'블로그·맘카페'));
    d.setDate(d.getDate()+3);
  }
  var g=new Date('2026-01-05T00:00:00');
  for(var j=0;j<102;j++){
    var iso2=g.getFullYear()+'-'+String(g.getMonth()+1).padStart(2,'0')+'-'+String(g.getDate()).padStart(2,'0');
    R(iso2, mates[j%mates.length], (j%2?'인스타그램':'블로그·맘카페'));
    g.setDate(g.getDate()+2);
  }
  records=recs;
  window.getApplyMonths=function(){return [];};
  try{ APPLY_SETTINGS=APPLY_SETTINGS||{}; APPLY_SETTINGS['AI_연일회피']=false; }catch(e){}
  return {perfs:PERFS.length, recs:records.length};
})()`;

// 머리줄·잉크·이모지 실측 — 전·후 DOM 양쪽에서 도는 관용 측정기
const MEASURE = (rootSel, titleText) => `(()=>{
  var root=document.querySelector('${rootSel} .modal'); if(!root)return {err:'no modal'};
  var deepest=null;
  [].slice.call(root.querySelectorAll('*')).forEach(function(el){
    var direct=[].slice.call(el.childNodes).some(function(n){return n.nodeType===3&&n.textContent.indexOf('${titleText}')>-1;});
    if(direct)deepest=el;
  });
  var head=deepest, hb=null, hs=null;
  // 밴드(직계 헤더 줄) = 제목 요소에서 modal 직계 자식까지 올라간 조상
  var band=deepest; while(band&&band.parentElement!==root)band=band.parentElement;
  if(band){var bc=getComputedStyle(band); hb={bg:bc.backgroundColor,h:+band.getBoundingClientRect().height.toFixed(1),borderBottom:bc.borderBottomWidth+' '+bc.borderBottomColor};}
  if(head){var tc=getComputedStyle(head); hs={color:tc.color,fs:tc.fontSize,fw:tc.fontWeight};}
  var x=root.querySelector('.modal-x'); var xr=null;
  if(x){var xc=getComputedStyle(x), xb=x.getBoundingClientRect(), mb=root.getBoundingClientRect();
    xr={color:xc.color,glyph:x.textContent.trim(),fromTop:+(xb.top-mb.top).toFixed(1),fromRight:+(mb.right-xb.right).toFixed(1)};}
  var emo=(root.textContent.match(/[\\u{1F300}-\\u{1FAFF}\\u{2600}-\\u{27BF}]/gu)||[]);
  return {band:hb, title:hs, x:xr, emojis:emo, textHead:(band?band.textContent.trim().slice(0,60):'')};
})()`;

async function shoot(page, rootSel, name) {
  const box = await page.evaluate(`(()=>{const b=document.querySelector('${rootSel} .modal').getBoundingClientRect();
    return {x:Math.max(0,Math.floor(b.left)-12),y:Math.max(0,Math.floor(b.top)-12),width:Math.ceil(b.width)+24,height:Math.min(${1000},Math.ceil(b.height)+24)};})()`);
  await page.screenshot({ path: join(OUTDIR, name + '.png'), clip: box });
}

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
  console.log('seed', JSON.stringify(seeded));

  // ① AI 홍보 · 점검
  await page.evaluate(`openPromoCheck()`);
  await page.waitForTimeout(400);
  console.log('promo', JSON.stringify(await page.evaluate(MEASURE('#promo-check', 'AI 홍보 · 점검')), null, 1));
  await shoot(page, '#promo-check', OUT + '_promo');
  await page.evaluate(`closePromoCheck()`);

  // ② 카카오 메세지 설계 — 상세 링크 있는 프로그램 8건 부여(첨부1 기본 상태 재현)
  await page.evaluate(`PERFS.slice(0,8).forEach(function(p,i){p.u='https://www.yeulmaru.or.kr/perf/'+(101+i);})`);
  await page.evaluate(`openKakaoDesigner()`);
  await page.waitForTimeout(400);
  console.log('kakao', JSON.stringify(await page.evaluate(MEASURE('#km-board', '카카오 메세지 설계')), null, 1));
  await shoot(page, '#km-board', OUT + '_kakao');

  if (errs.length) console.log('pageerror:', errs.slice(0, 5));
  await browser.close();
}
main();
