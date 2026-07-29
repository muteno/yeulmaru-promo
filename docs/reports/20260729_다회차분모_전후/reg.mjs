import pw from 'playwright-core';
const { chromium } = pw;
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });
const pg = await b.newPage({ ignoreHTTPSErrors:true });
await pg.goto('https://localhost:8766/index.html?qa=1',{waitUntil:'domcontentloaded',timeout:90000});
await pg.waitForFunction(()=>typeof window._salesBuild==='function',null,{timeout:30000});
const out = await pg.evaluate(()=>{
  const D=[], M=[], R=[], O=[];
  function daily(nm,id,seat){ for(let d=2;d>=0;d--){const dt=new Date(2026,6,29-d);D.push({기준일자:dt.getFullYear()*10000+(dt.getMonth()+1)*100+dt.getDate(),공연명:nm,공연ID:id,합계좌석:Math.round(seat*(1-d*0.05)),합계금액:0});} }
  // A) 회차합산(_rsOk): 회차상세 3행 전부 오픈좌석 → Σ = 2,400
  M.push({사업명:'A_회차합산',ID:'A1',기준석:926,총회차:3,총오픈석:926,목표점유율:50,티켓오픈:'2026-01-01',시작일:'2026-09-01',종료일:'2026-12-31'});
  [800,800,800].forEach((s,i)=>R.push({ID:'A1',공연일:'2026-09-0'+(i+1),오픈좌석:s}));
  daily('A_회차합산','A1',1200);
  // B) 정상 총합 입력(총오픈석 > 기본석) → 그대로 2,778
  M.push({사업명:'B_총합입력',ID:'B1',기준석:926,총회차:3,총오픈석:2778,목표점유율:50,티켓오픈:'2026-01-01',시작일:'2026-09-01',종료일:'2026-12-31'});
  daily('B_총합입력','B1',1200);
  // C) 1회차 기준 총오픈석 + 명시 총회차 3 → ×N 보정 2,778
  M.push({사업명:'C_1회차기준',ID:'C1',기준석:926,총회차:3,총오픈석:926,목표점유율:50,티켓오픈:'2026-01-01',시작일:'2026-09-01',종료일:'2026-12-31'});
  daily('C_1회차기준','C1',1200);
  // D) 총오픈석 공란 + 명시 총회차 4 → 926×4
  M.push({사업명:'D_회차만',ID:'D1',기준석:926,총회차:4,총오픈석:'',목표점유율:50,티켓오픈:'2026-01-01',시작일:'2026-09-01',종료일:'2026-12-31'});
  daily('D_회차만','D1',1000);
  // E) 단일회차 마스터(시작=종료) → 926 불변
  M.push({사업명:'E_단일',ID:'E1',기준석:926,총회차:'',총오픈석:'',목표점유율:50,티켓오픈:'2026-01-01',시작일:'2026-09-05',종료일:'2026-09-05'});
  daily('E_단일','E1',300);
  // F) 운영대장 폴백(마스터 없음, 운영대장 3행) → 기본좌석 900 × 3
  ['01','02','03'].forEach(d=>O.push({공연명:'F_운영대장',년도:2026,월:9,일:+d,기본좌석:900,장르1:'클래식',공연구분:'기획'}));
  daily('F_운영대장','',1000);
  // G) 마스터·운영대장 없음 + 프로그램 시트 3일 → 926×3 (이번 수정 대상)
  PERFS=[{s:'2026-09-18',e:'2026-09-20',n:'G_미등재',f:'G_미등재',t:'c',o:1,ss:'2026-01-01',se:'2026-12-31',ps:'2026-01-01',pf:'Y',m:'',l:'대극장',u:'',id:'G1',g:'뮤지컬'}];
  daily('G_미등재','G1',921);
  _salesState.master={rows:M}; _salesState.rounds={rows:R}; _salesState.ops={rows:O};
  _salesState.group={rows:[]}; _salesState.daily={rows:D}; _salesState._opsIdx=null;
  const got={}; _salesBuild().forEach(p=>{got[p.name]={open:p.totalOpen,rc:p._rcEst,src:p._openSrc,rcSrc:p._rcSrc};});
  return got;
});
const EXP={A_회차합산:2400,B_총합입력:2778,C_1회차기준:2778,D_회차만:3704,E_단일:926,F_운영대장:2700,G_미등재:2778};
let fail=0;
for(const k of Object.keys(EXP)){ const g=out[k]; const ok=g&&g.open===EXP[k]; if(!ok)fail++;
  console.log((ok?'✅':'❌')+' '+k+' 분모='+(g?g.open:'없음')+' (기대 '+EXP[k]+') 회차='+(g?g.rc:'-')+' 출처='+(g?g.src+'/'+g.rcSrc:'-')); }
console.log(fail?('FAIL '+fail):'ALL PASS');
await b.close();
process.exit(fail?1:0);
