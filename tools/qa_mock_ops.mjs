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
  push(2026,1,9,'2026 신년음악회','클래식','기획',926,908);
  push(2026,1,24,'뮤지컬 <미세스 다웃파이어>','뮤지컬','기획',973,830);
  push(2026,1,24,'뮤지컬 <미세스 다웃파이어>','뮤지컬','기획',973,820);
  push(2026,1,25,'뮤지컬 <미세스 다웃파이어>','뮤지컬','기획',973,826);
  push(2026,1,25,'뮤지컬 <미세스 다웃파이어>','뮤지컬','기획',973,826);
  window.__MOCK_OPS={rows:rows,headers:Object.keys(rows[0])};

  // ?qa 목 API 훅 — 페이지가 function _qaApi(){}로 재선언해도 setter가 원본을 품고 getter가 래퍼를 준다
  var real=null;
  function wrapped(method,path){
    var p=String(path||'');
    if(p.indexOf('/api/ops')===0&&decodeURIComponent(p).indexOf('세부운영관리대장')>=0)return Promise.resolve(window.__MOCK_OPS);
    return real?real(method,path):Promise.resolve({rows:[],headers:[],programs:[]});
  }
  try{ Object.defineProperty(window,'_qaApi',{configurable:true,get:function(){return wrapped;},set:function(v){real=v;}}); }catch(e){}

  // 판매중 목록(우 열) — 공연 7 + 전시 1(운영 화면 대표 형태)
  window._mockActives=function(){
    function D(m,d){ return new Date(2026,m-1,d); }
    function days(base,step){ var a=[],s=base; for(var i=0;i<7;i++){ a.push({bd:20260726+i,seat:s}); s+=Math.max(0,Math.round(step*(0.4+rnd()))); } return a; }
    function perf(m,d,name,seats,open,genre,run){
      return {_kind:'perf',id:'',name:name,startDate:D(m,d),_ryDate:D(m,d),dday:30,noData:false,
        seats:seats,totalOpen:open,occ:seats/open*100,days:days(Math.max(0,seats-40),9),diff:null,_unit:'석',
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
        {'기준일자':'20260726','누계총인원':60},{'기준일자':'20260728','누계총인원':90},
        {'기준일자':'20260730','누계총인원':124},{'기준일자':'20260801','누계총인원':155}],
      '시작일':D(7,21),'종료일':D(11,1),_dday:-12,_endD:91,_paid:155,_total:155,_goal:null,_saleN:12,_venue:'7층 전시실'});
    return a;
  };
})();`;

// 데이터 주입(목록·운영대장) — 페이지 로드 후 호출
export const FEED_SCRIPT = `(()=>{
  if(typeof _bizState!=='undefined'&&_bizState)_bizState.raw=window.__MOCK_OPS;
  if(typeof _salesState!=='undefined'&&_salesState){ _salesState.ops=window.__MOCK_OPS; _salesState._opsIdx=null; }
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
    window._memState={rows:mrows,ts:1,schemaWarn:''};
  }
})()`;
