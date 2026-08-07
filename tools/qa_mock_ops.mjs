// [260802f] 레이아웃 스모크용 QA 목데이터 — 실데이터·PII 미접촉(?qa 진입로가 이미 실API를 차단한다).
// 값은 「형태 재현」이 목적: 운영대장 행(장르·회차·점유율 분포)과 판매중 목록(공연 7 + 전시 1)의 **모양**만 만든다.
// 결정적 PRNG(시드 고정) = 실행마다 같은 화면 → 기하 실측이 흔들리지 않는다(Date.now·Math.random 금지).
export const INIT_SCRIPT = `(function(){
  var seed=42; function rnd(){ seed=(seed*1103515245+12345)&0x7fffffff; return seed/0x7fffffff; }
  var GENRES=['클래식','클래식','클래식','클래식','뮤지컬','발레/연극','어린이·가족','대중','기타'];
  var rows=[];
  function push(y,m,d,name,genre,type,seat,paid){
    rows.push({'상태':'','사업구분':'공연','티켓구분':'유료','기본좌석':seat,'발권유료':paid,
      '년도':y,'월':m,'일':d,'공연구분':type,'장르1':genre,'공연명':name,'수익성':''});
  }
  for(var y=2012;y<=2025;y++){
    var n=12+Math.floor(rnd()*9);
    for(var i=0;i<n;i++){
      var g=GENRES[Math.floor(rnd()*GENRES.length)];
      var m=1+Math.floor(rnd()*12), d=1+Math.floor(rnd()*27), seat=926, occ=0.2+rnd()*0.8;
      var reps=1+Math.floor(rnd()*3);
      for(var r=0;r<reps;r++)push(y,m,Math.min(28,d+r),g+' 공연 '+y+'-'+i,g,(rnd()<0.85?'기획':'대관'),seat,Math.round(seat*Math.min(1,occ+rnd()*0.06)));
    }
  }
  // [260804] 3면 판매현황 막대의 **y축 중략(≈) 경로**를 게이트가 실제로 지나게 하는 최소 표본
  //   — 구 목데이터는 2026년이 2건뿐이라 _bizBarBreak이 항상 null이었고, 중략이 켜진 상태의 레이아웃 계약이
  //   한 번도 측정되지 않았다(초기판의 계약③ −18px 위반이 그래서 게이트를 통과했다 · 평의회4).
  //   형태만 재현: 본체 8건 + 이상치 1건(야외 대형 공연) = 끊는 조건 충족(최대 ≥ B×2 · 잘릴 최소값 ≥ B×1.25).
  push(2026,2,14,'2026 대형 야외 특별공연','대중','기획',12000,11200);
  push(2026,3,5,'2026 봄 실내악','클래식','기획',926,410);
  push(2026,3,21,'2026 어린이 가족극','어린이·가족','기획',926,520);
  push(2026,4,11,'2026 봄 연극','발레/연극','기획',926,300);
  push(2026,5,9,'2026 정기연주회','클래식','기획',926,640);
  push(2026,6,6,'2026 초여름 무용','발레/연극','기획',926,210);
  push(2026,6,27,'2026 대중음악 콘서트','대중','기획',926,700);
  push(2026,1,9,'2026 신년음악회','클래식','기획',926,908);
  // [260806 2차] **미래(예정) 표본** — 3면 막대의 「진행 완료 │ 진행·예정」 구획 박스가 실제로 두 영역으로 갈리는 상태를
  //   게이트가 한 번도 못 재고 있었다(구 목데이터 2026분이 전부 과거 날짜라 완료 영역 하나뿐). 형태만 재현.
  push(2026,11,14,'2026 늦가을 실내악','클래식','기획',926,120);
  push(2026,12,19,'2026 송년음악회','클래식','기획',926,340);
  // [260807] 판매현황 상세 표 개정(일시 M/D·제목 1행 말줄임·대소 배지)이 실제로 지나는 경로 표본 — 형태만 재현.
  //   ① 긴 제목 = 말줄임(…) 경로 · ② 소극장(기본좌석 302 = 운영대장 최빈 소극장값) = '소' 배지 경로 ·
  //   ③ 달 넘김 범위(11/28-12/2) = 「12/24-1/3」 형 표기 경로 · ④ 야외(12,000) = 배지 없음 경로(위 대형 야외 특별공연).
  push(2026,4,9,'2026 브런치 콘서트 I <클래식과 함께 하는 미술관 여행 I>','클래식','기획',926,202);
  push(2026,5,23,'한국페스티발앙상블 <세상에서 가장 편한 음악>','클래식','기획',302,94);
  push(2026,11,28,'2026 늦가을 연극 <겨울로 가는 길>','발레/연극','기획',926,301);
  push(2026,12,2,'2026 늦가을 연극 <겨울로 가는 길>','발레/연극','기획',926,288);
  // [260807-4] **어린이·가족 우선 규칙** 표본 2종 — 없으면 게이트가 이 분기를 못 밟는다.
  //   · 운영대장 장르1은 '뮤지컬'인데 **이름에 어린이** → 이름 기반 승격(_bizClean 경로)
  //   · 프로그램 시트 구분이 '뮤지컬(어린이)' → 문자열 기반 승격(_bizGenreKey 경로 · 아래 QPF4)
  push(2026,8,20,'어린이 뮤지컬 <100층짜리 집>','뮤지컬','기획',926,700);
  // [260807-5] 「가족」 규칙 표본 2종 — 본제목에 있으면 승격 / 부제에만 있으면 본제목 장르 유지(운영자 판정선)
  push(2026,8,29,'가족오페라 <신콩쥐>','클래식','기획',926,540);
  push(2026,9,26,'2026 정기연주회 <송년의 밤, 가족음악회>','클래식','기획',926,610);
  // [260807] **2자리 회차** 표본 — 오픈석 괄호 폭 상자(_cntBox) 경로. 없으면 회차 1자리만 측정돼
  //   좌석 숫자 끝자리가 7px 어긋나는 상태를 게이트가 못 본다(실데이터 1,307공연 중 10회 이상 13건).
  for(var _q=1;_q<=12;_q++)push(2026,7,_q+5,'연극 <옥탑방 고양이>','발레/연극','기획',302,180+_q*3);
  push(2026,1,24,'뮤지컬 <미세스 다웃파이어>','뮤지컬','기획',973,830);
  push(2026,1,24,'뮤지컬 <미세스 다웃파이어>','뮤지컬','기획',973,820);
  push(2026,1,25,'뮤지컬 <미세스 다웃파이어>','뮤지컬','기획',973,826);
  push(2026,1,25,'뮤지컬 <미세스 다웃파이어>','뮤지컬','기획',973,826);
  window.__MOCK_OPS={rows:rows,headers:Object.keys(rows[0])};

  // ?qa 목 API 훅 — 페이지가 function _qaApi(){}로 재선언해도 setter가 원본을 품고 getter가 래퍼를 준다
  // [260805] 3면 분야 축(공연/전시·교육) 신설 — 전시 반쪽의 레이아웃 계약을 재려면 전시 원천 2시트가 있어야 한다.
  //   형태만 재현(실데이터·PII 미접촉): 연도별 전시 + 2026 진행중/종료/예정 3상태 · 목표관객 유/무 · 매출 유/무.
  var exM=[],exD=[];
  (function(){
    var NM=['봄 소장품전','여름 기획전 <빛의 결>','가을 사진전','겨울 공예전','신진작가 초대전'];
    var id=0;
    for(var y=2022;y<=2026;y++){
      var n=(y===2026)?4:5;
      for(var i=0;i<n;i++){
        id++;
        var eid='EXM'+id, mm=2+i*2, goal=(i===3)?'':String(1200+Math.round(rnd()*2600));
        var tot=Math.round(600+rnd()*2400), paid=Math.round(tot*(0.55+rnd()*0.35));
        var st=(y<2026)?'종료':((i===0)?'종료':((i===1)?'진행중':((i===2)?'진행중':'예정')));
        if(y===2026&&st==='예정'){ tot=0; paid=0; }
        exM.push({'전시ID':eid,'전시명':y+' '+NM[i],'연도':y,'상태':st,'무료여부':'',
          '목표관객':goal,'목표금액':'','최종유료':String(paid),'최종무료':String(tot-paid),
          '최종총인원':String(tot),'최종매출':(i%2===0?String(tot*7000):''),
          '시작일':y+'-'+('0'+mm).slice(-2)+'-05','종료일':y+'-'+('0'+Math.min(12,mm+2)).slice(-2)+'-24',
          '운영일수':String(40+Math.round(rnd()*30)),'최종점유율':''});
        if(tot>0)exD.push({'전시ID':eid,'전시명':y+' '+NM[i],'기준일자':String(y)+('0'+mm).slice(-2)+'20',
          '누계유료':String(paid),'누계무료':String(tot-paid),'누계총인원':String(tot),'누계금액':'','점유율':''});
      }
    }
  })();
  window.__MOCK_EXM={rows:exM,headers:Object.keys(exM[0])};
  window.__MOCK_EXD={rows:exD,headers:Object.keys(exD[0])};

  // [260808] 고객 분류(AI 홍보 3탭) 목 — 예매집계 × 회원. **전부 지어낸 형태**(실데이터·PII 미접촉).
  //   회원키 = 휴대폰 11자리(운영 규약과 같은 축)지만 010-0000-00NN 대역이라 실번호와 안 겹친다.
  //   분포는 신 포맷 YYYYMM|장르 — 「최근 N년」 월 정밀 경로가 실제로 밟히는지 재려면 월 키가 있어야 한다.
  //   ⚠ 이 블록은 INIT_SCRIPT 템플릿 리터럴 안이다 — 주석에도 백틱을 쓰지 마라(문자열이 거기서 끊긴다).
  (function(){
    var GEN=['클래식','뮤지컬','발레/연극','어린이·가족'], NM=['김가온','이서진','박도윤','최하람','정유나','강시우','조은결','윤나린','임채원','한소율','오지호','신예람'];
    var SI=[['전남광주통합특별시','여수시','학동'],['전남광주통합특별시','순천시','조례동'],['전남광주통합특별시','광양시','중동'],['서울특별시','강남구','역삼동']];
    var agg=[],mem=[];
    for(var i=0;i<NM.length;i++){
      var ph='0100000'+('0000'+i).slice(-4);
      var loc=SI[i%SI.length];
      mem.push({'이름':NM[i],'휴대폰정규화':ph,'주소1':loc[0],'주소2':loc[1],'주소3':loc[2],'주소4':'','우편번호':'','연령대':(20+(i%5)*10)+'대'});
      // i가 클수록 최근에 자주 — 「최근 3년 5회 이상」이 일부만 걸리도록 층을 만든다(전건 통과 = 못 재는 목)
      var cnt=1+i, d={}, tix=0, amt=0, first='', last='';
      for(var j=0;j<cnt;j++){
        var ym=202101+Math.round(rnd()*49);                 // 2021.01~2025.12 범위
        var yy=2021+Math.floor((ym-202101)/50*5), mm2=1+((ym+j)%12);
        var key=String(yy)+('0'+mm2).slice(-2);
        var g=GEN[(i+j)%GEN.length];
        d[key+'|'+g]=(d[key+'|'+g]||0)+1;
        var day=yy+'-'+('0'+mm2).slice(-2)+'-1'+(j%9);
        if(!first||day<first)first=day; if(day>last)last=day;
        tix+=1+(j%3); amt+=(30000+(j%4)*20000);
      }
      agg.push({'회원키':ph,'총구매':String(cnt),'총매수':String(tix),'총금액':String(amt),
        '첫구매일':first,'최근구매일':last,
        '분포':Object.keys(d).map(function(k){return k+':'+d[k];}).join(';')});
    }
    window.__MOCK_BKAGG={rows:agg,headers:Object.keys(agg[0]),count:agg.length};
    window.__MOCK_MEM={rows:mem,headers:Object.keys(mem[0]),count:mem.length};
  })();

  // [260804] 예술교육 프로그램 목 — 3면 예술교육 반쪽(당해 연도 월별 일정 게이지)이 빈 상태가 아니라
  //   실제 차트를 그린 상태의 레이아웃 계약을 재도록 프로그램 시트에 t'a' 행을 준다(260805 전시 2시트 목과 같은 축).
  //   형태만 재현(실데이터·PII 미접촉): 과거·진행·예정이 섞인 4건 — 공연축(t'c') 무접촉.
  window.__MOCK_PROGRAMS={programs:[
    {'프로그램ID':'QEDU1','풀네임':'예울마루 아카데미 봄학기','줄임말':'아카데미 봄','콘텐츠구분':'예술교육','시작일':'2026-03-10','종료일':'2026-06-25'},
    {'프로그램ID':'QEDU2','풀네임':'청소년 해설 음악회','줄임말':'해설음악회','콘텐츠구분':'예술교육','시작일':'2026-04-08','종료일':'2026-04-08'},
    {'프로그램ID':'QEDU3','풀네임':'어린이 여름 예술캠프','줄임말':'여름캠프','콘텐츠구분':'예술교육','시작일':'2026-07-29','종료일':'2026-08-22'},
    {'프로그램ID':'QEDU4','풀네임':'예울마루 아카데미 가을학기','줄임말':'아카데미 가을','콘텐츠구분':'예술교육','시작일':'2026-09-02','종료일':'2026-11-27'},
    // [260807] 공연축(t'c') + **장소** 3건 — 판매현황 상세 표의 두 경로를 게이트가 실제로 밟게 한다.
    //   구 목엔 t'c'가 하나도 없어 ① 대·소 배지의 **확정 분기**(프로그램 시트 장소)와 ② **예정 행**(오픈 전 · 오픈석 「—(N)」)이
    //   한 번도 렌더되지 않았다 = 좌석 추정 분기만 측정되던 사각. 형태만 재현(실데이터·PII 미접촉).
    //   · QPF1 = 운영대장 소극장 행과 같은 이름 → 장소 '소극장'이 좌석 추정을 이기는 확정 경로
    //   · QPF2 = 대극장 확정 경로 · QPF3 = 운영대장에 없는 **미래** 공연 → 예정 행(값 없음) + 달 안 범위 표기
    {'프로그램ID':'QPF1','풀네임':'한국페스티발앙상블 <세상에서 가장 편한 음악>','줄임말':'한국페스티발앙상블','콘텐츠구분':'공연','장소':'소극장','구분':'클래식','시작일':'2026-05-23','종료일':'2026-05-23'},
    {'프로그램ID':'QPF2','풀네임':'2026 신년음악회','줄임말':'신년음악회','콘텐츠구분':'공연','장소':'대극장','구분':'클래식','시작일':'2026-01-09','종료일':'2026-01-09'},
    {'프로그램ID':'QPF3','풀네임':'2026 가을 오페라 <세비야의 이발사>','줄임말':'가을 오페라','콘텐츠구분':'공연','장소':'대극장','구분':'클래식','시작일':'2026-10-15','종료일':'2026-10-16'},
    // [260807-4] 구분이 '뮤지컬(어린이)' — 이름엔 어린이가 없다 = **문자열 기반** 어린이·가족 승격 경로(구판은 통째로 '뮤지컬'로 떨어졌다)
    {'프로그램ID':'QPF4','풀네임':'뮤지컬 <달 샤베트>','줄임말':'달 샤베트','콘텐츠구분':'공연','장소':'대극장','구분':'뮤지컬(어린이)','시작일':'2026-09-18','종료일':'2026-09-20'},
    // [260807-5] 구분 '무용' — 발레/연극 별칭 경로(구판은 기타)
    {'프로그램ID':'QPF5','풀네임':'국립현대무용단 <트리플 빌>','줄임말':'트리플 빌','콘텐츠구분':'공연','장소':'대극장','구분':'무용','시작일':'2026-10-29','종료일':'2026-10-29'}
  ]};

  var real=null;
  function wrapped(method,path){
    var p=String(path||''), dp=decodeURIComponent(p);
    if(p.indexOf('/api/ops')===0&&dp.indexOf('세부운영관리대장')>=0)return Promise.resolve(window.__MOCK_OPS);
    if(p.indexOf('/api/ops')===0&&dp.indexOf('전시마스터')>=0)return Promise.resolve(window.__MOCK_EXM);
    if(p.indexOf('/api/ops')===0&&dp.indexOf('전시일일')>=0)return Promise.resolve(window.__MOCK_EXD);
    // ⚠ 예매집계·회원 목을 여기 넣지 마라 — 이 접근자는 페이지의 _qaApi 함수 선언에 덮여 죽는다(FEED_SCRIPT 주석 참조).
    //   그 둘은 FEED_SCRIPT에서 window.api를 위임 래핑해 먹인다 = _bkLoad/_memLoad의 **실제 파싱 경로**를 그대로 밟는다.
    if(p.indexOf('/api/programs')===0)return Promise.resolve(window.__MOCK_PROGRAMS);
    return real?real(method,path):Promise.resolve({rows:[],headers:[],programs:[]});
  }
  try{ Object.defineProperty(window,'_qaApi',{configurable:true,get:function(){return wrapped;},set:function(v){real=v;}}); }catch(e){}

  // 판매중 목록(우 열) — 공연 7 + 전시 1(운영 화면 대표 형태)
  window._mockActives=function(){
    function D(m,d){ return new Date(2026,m-1,d); }
    // [260807] mny = 그 날짜의 **누계 금액** — 「전일 대비」 토글이 금액 증감을 이 두 점에서 뽑는다(_ryDodPick).
    //   없으면 그 칸이 통째로 '—'라 모드가 무측정 = 형태만 재현(석당 단가 대역만 실제와 같은 자릿수).
    //   ⚠ 누계라 **단조 증가**여야 한다 — 날마다 단가를 새로 굴려 s×단가로 만들면 좌석이 늘어도 금액이 줄어 실데이터에 없는 상태가 나온다.
    function days(base,step){ var a=[],s=base,m=base*42000; for(var i=0;i<7;i++){ a.push({bd:20260726+i,seat:s,mny:m}); var ds=Math.max(0,Math.round(step*(0.4+rnd()))); s+=ds; m+=ds*(35000+Math.round(rnd()*25000)); } return a; }
    function perf(m,d,name,seats,open,genre,run){
      var dd=days(Math.max(0,seats-40),9);
      // [260807-2] money = 누적 금액 — 전일 대비 모드 3열 아랫줄(_ryCumCell)이 읽는 자리. 없으면 그 줄이 '—'라 모드가 무측정.
      return {_kind:'perf',id:'',name:name,startDate:D(m,d),_ryDate:D(m,d),dday:30,noData:false,
        seats:seats,money:dd[dd.length-1].mny,totalOpen:open,occ:seats/open*100,days:dd,diff:null,_unit:'석',
        deltaPP:null,'수익성':'공공성',genre:genre,_venue:'대극장',_ryRun:run};
    }
    var a=[
      perf(9,3,'브런치 콘서트 III <현 위로 흐르는 계절>',295,926,'클래식','1일 1회'),
      perf(9,12,'조재혁 피아노 리사이틀',97,926,'클래식','1일 1회'),
      perf(9,18,'뮤지컬 <그날들>',990,3704,'뮤지컬','3일 4회'),
      perf(10,1,'뮤지컬 <달 샤베트>',950,5556,'어린이·가족','3일 6회'),
      perf(10,14,'국립현대무용단 <트리플 빌>',50,926,'발레/연극','1일 1회'),
      perf(10,27,'다비드 바뱅 & 아드리앙 몽도 <피아노 & 피아노>',21,926,'클래식','1일 1회'),
      perf(11,26,'뮤지컬 <러커스 더 스쿨>',140,5556,'뮤지컬','3일 6회')
    ];
    a.push({_kind:'ex',noData:false,id:'EX1',name:'GS칼텍스 예울마루 기획전시 <숨: 쉬는 SUM>',profit:'공공성',
      occ:null,deltaPP:null,spark:[],daily:[
        {'기준일자':'20260726','누계총인원':60,'누계금액':300000},{'기준일자':'20260728','누계총인원':90,'누계금액':450000},
        {'기준일자':'20260730','누계총인원':124,'누계금액':620000},{'기준일자':'20260801','누계총인원':155,'누계금액':775000}],
      '시작일':D(7,21),'종료일':D(11,1),_dday:-12,_endD:91,_paid:155,_total:155,_goal:null,_saleN:12,_venue:'7층 전시실'});
    return a;
  };
})();`;

// 데이터 주입(목록·운영대장) — 페이지 로드 후 호출
export const FEED_SCRIPT = `(()=>{
  // [260810] ⚠ **부팅 선로딩이 먼저 다녀간 자리를 비우고 시작한다** — initApp이 _memBootWarm으로 회원·예매집계를
  //   앱 진입 직후 부르는데, ?qa에선 그 응답이 _qaApi의 빈 데이터다. 그대로 두면 두 가지가 깨진다:
  //     ① 그 빈 응답이 **FEED보다 늦게 도착**하면 아래에서 넣은 _memState 목을 {rows:[]}로 덮는다(4면이 빈 화면).
  //     ② _bkState={n:0}이 이미 박혀 있어 아래 api 래핑 뒤의 _bkLoad(false)가 **early-return**한다(고객 분류 무측정).
  //   앱 자신의 규약(_memPurge = 상태 비우기 + _memEpoch++로 비행 중 응답 폐기)을 그대로 쓴다 — 새 기계 0.
  if(typeof _memPurge==='function'){ try{ _memPurge(); }catch(_e){ console.warn('[qa purge]',_e); } }
  // [260807] ⚠ **프로그램 시트 목은 API 훅으로는 앱에 못 닿는다** — INIT_SCRIPT가 심는 window._qaApi 접근자를
  //   페이지 최상위 \`async function _qaApi(...)\` 선언이 CreateGlobalFunctionBinding으로 데이터 속성으로 덮어쓴다
  //   (실측: getOwnPropertyDescriptor(window,'_qaApi') = {value:fn, get:undefined, configurable:false}).
  //   그래서 /api/programs는 앱 자체 폴백 {programs:[]}가 응답했고 **PERFS.length가 계속 0**이었다
  //   — 260804 예술교육 목(t'a')도, 260807 공연 목(t'c'·장소)도 통째로 죽어 있었다.
  //   → 운영대장 목이 _bizState.raw를 직접 넣는 것과 같은 방식으로 **PERFS에 직접 대입**한다(같은 realm이라
  //     let 바인딩에 그대로 닿는다). 이게 없으면 대·소 배지의 **확정 분기**·연도 가드·**예정 행**이 무측정이다.
  if(window.__MOCK_PROGRAMS&&typeof programToPerf==='function'){
    try{ PERFS=window.__MOCK_PROGRAMS.programs.map(programToPerf); _perfReady=true; }catch(_e){ console.warn('[qa perfs]',_e); }
  }
  if(typeof _bizState!=='undefined'&&_bizState)_bizState.raw=window.__MOCK_OPS;
  if(typeof _salesState!=='undefined'&&_salesState){ _salesState.ops=window.__MOCK_OPS; _salesState._opsIdx=null; }
  // [260805] 전시 캐시 = 레일 6시트 플로우가 채우는 자리(_anaState._exMaster/_exDaily)를 목값으로 선점 — 3면 전시 반쪽이 로딩 화면에 머물지 않게
  if(typeof _anaState!=='undefined'&&_anaState){ _anaState._exMaster=window.__MOCK_EXM; _anaState._exDaily=window.__MOCK_EXD; }
  if(typeof _railYrmSync==='function')_railYrmSync(window._mockActives());
  // [260803] 실앱 _srailRender와 같은 순서로 회전 상세(우하단 2×2)까지 켠다 — 이 배선이 빠져 있어서
  //   「본문 없는 빈 슬롯 4px + 카드 여백 14가 우 흰 카드를 18px 밀어올리는」 실제 운영 화면 상태가
  //   스모크에서 재현되지 않았다(운영자 260803 캡처). 목데이터라 실API·PII 미접촉은 그대로.
  if(typeof _srailUhaSync==='function')_srailUhaSync(window._mockActives());
  // [260803 2차] 4면(고객 분석) 좌 열 목데이터 — 이게 없으면 그 면은 「회원 데이터를 못 불러왔어요」 한 줄만 떠서
  //   흰 카드가 아예 없다 = 게이트가 4면을 검사한다고 돌지만 실제로는 아무것도 못 잰다(운영자 「넘어간거 많음」).
  //   값은 **완전 허구**(집계 모양만 재현: 주소1·주소2·연령대 3열) — 실 시트·PII 미접촉.
  if(typeof _memState!=='undefined'){
    var SIDO=[['전남광주통합특별시','여수시'],['전남광주통합특별시','순천시'],['전남광주통합특별시','광양시'],
              ['전남광주통합특별시','광주 동구'],['서울특별시','강남구'],['경기도','성남시'],['부산광역시','해운대구']];
    var AGES=['10세 미만','10대','20대','30대','40대','50대','60대','70대'];
    var mrows=[]; var sd=7;
    function rr(){ sd=(sd*1103515245+12345)&0x7fffffff; return sd/0x7fffffff; }
    for(var mi=0;mi<520;mi++){
      var g=SIDO[Math.floor(rr()*SIDO.length)];
      mrows.push({'주소1':(rr()<0.04?'':g[0]),'주소2':g[1],'연령대':AGES[Math.floor(rr()*AGES.length)]});
    }
    // [260808] 앞 12행 = 고객 분류(AI 홍보 3탭)용 — 이름·휴대폰정규화가 있어야 예매집계 회원키와 맞물린다.
    //   4면 집계는 주소1·주소2·연령대만 보므로 열이 더 있어도 무해하다(한 벌로 두 화면을 먹인다).
    if(window.__MOCK_MEM)mrows=window.__MOCK_MEM.rows.concat(mrows);
    window._memState={rows:mrows,ts:1,schemaWarn:''};
  }
  // [260808] 예매집계는 **window.api 위임 래핑**으로 먹인다 — _qaApi 접근자가 죽는 자리(위 주석)라
  //   여기서 api를 감싸야 _bkLoad가 실제로 돌면서 분포 키 파싱·연/월 판별까지 그대로 측정된다.
  //   _bkState를 직접 대입하면 재려던 그 로직을 건너뛰어 「목만 통과하는 게이트」가 된다.
  if(typeof api==='function'&&window.__MOCK_BKAGG&&!window.__MOCK_API_WRAPPED){
    window.__MOCK_API_WRAPPED=1;
    var _realApi=api;
    window.api=function(method,path){
      var dp=decodeURIComponent(String(path||''));
      if(dp.indexOf('/api/ops')===0&&dp.indexOf('sheet=예매집계')>=0)return Promise.resolve(window.__MOCK_BKAGG);
      if(dp.indexOf('/api/ops')===0&&dp.indexOf('sheet=회원')>=0)return Promise.resolve(window.__MOCK_MEM);
      return _realApi.apply(this,arguments);
    };
  }
})()`;
