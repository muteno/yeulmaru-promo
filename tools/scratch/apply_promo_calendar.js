/* 예울마루 홍보 계획 22건 일괄 신청 — 앱 탭(로그인 상태) 콘솔에 붙여넣기
   붙여넣고 Enter → 검증 표가 뜨고 「등록할까요?」 팝업 → [확인]을 눌러야 저장된다.
   [취소]하면 아무것도 저장되지 않는다. (검증만 하고 끝내려면 ASK를 false로)
   앱 자체 함수(_validateScheduleChange · _buildRecRow · api)를 그대로 사용 = 위저드와 같은 경로. */
(async () => {
  const ASK = true;                       // false = 검증만 하고 종료(저장 안 함)

  const E = [
{d:"2026-08-05",t:"11:00",p1:"카카오톡",p2:"-",f:"이미지",id:"260912_01",prog:"조재혁 피아노 리사이틀",ti:"조기예매 25% 마감 D-3",bo:"8/8(토) 마감 · R 60,000→45,000 / S 40,000→30,000",mg:"황세웅"},
{d:"2026-08-06",t:"14:00",p1:"카카오톡",p2:"-",f:"이미지",id:"260910_01",prog:"여수세계섬박람회 기념 음악회",ti:"티켓오픈 안내",bo:"9/10(목) 대극장 · 박람회 개막주 첫 공연",mg:"황세웅"},
{d:"2026-08-06",t:"15:00",p1:"인스타그램",p2:"-",f:"이미지",id:"260910_01",prog:"여수세계섬박람회 기념 음악회",ti:"티켓오픈 카드",bo:"섬박람회 계정 공동작업자 1순위 대상",mg:"심희은"},
{d:"2026-08-07",t:"16:00",p1:"인스타그램",p2:"-",f:"이미지",id:"260912_01",prog:"조재혁 피아노 리사이틀",ti:"조기예매 25% 마감 D-1",bo:"스토리 · 내일 마감 리마인드",mg:"심희은"},
{d:"2026-08-08",t:"11:00",p1:"카카오톡",p2:"-",f:"이미지",id:"260912_01",prog:"조재혁 피아노 리사이틀",ti:"조기예매 25% 오늘 마감",bo:"토요일 발송 · 마감 당일 마지막 푸시",mg:"황세웅"},
{d:"2026-08-12",t:"11:00",p1:"카카오톡",p2:"-",f:"이미지",id:"261009_01",prog:"뮤지컬 <이상한 나라의 춘자씨>",ti:"티켓오픈 안내",bo:"10/9~10 대극장 · R 30,000 / S 20,000",mg:"황세웅"},
{d:"2026-08-12",t:"14:00",p1:"인스타그램",p2:"-",f:"영상",id:"261009_01",prog:"뮤지컬 <이상한 나라의 춘자씨>",ti:"티켓오픈 릴스",bo:"2024 공연예술창작산실 올해의 신작",mg:"심희은"},
{d:"2026-08-14",t:"15:00",p1:"인스타그램",p2:"-",f:"이미지",id:"260912_01",prog:"조재혁 피아노 리사이틀",ti:"영화관 대신 공연장 ① 만원의 행복",bo:"학생 전학년 1만원 정액 2종 = 9/12 조재혁 · 10/22 18세기",mg:"심희은"},
{d:"2026-08-19",t:"11:00",p1:"카카오톡",p2:"-",f:"이미지",id:"261022_01",prog:"18세기, 시대악기로 만나는 바로크의 정점과 고전의 새벽",ti:"티켓오픈 안내",bo:"10/22(목) 소극장 · 학생 전학년 1만원",mg:"황세웅"},
{d:"2026-08-19",t:"14:00",p1:"인스타그램",p2:"-",f:"이미지",id:"261022_01",prog:"18세기, 시대악기로 만나는 바로크의 정점과 고전의 새벽",ti:"티켓오픈 카드",bo:"시대악기 = 거트현·바깥으로 휜 활·목재 관악기·가죽 타악기",mg:"심희은"},
{d:"2026-08-21",t:"15:00",p1:"인스타그램",p2:"-",f:"이미지",id:"260912_01",prog:"조재혁 피아노 리사이틀",ti:"바로크의 정점에서 고전의 새벽까지 — 예울마루의 18세기",bo:"9/12 현대 피아노(조재혁 = 모차르트 270주년 프로젝트) ↔ 10/22 시대악기 · 학생 둘 다 1만원",mg:"심희은"},
{d:"2026-08-26",t:"16:00",p1:"인스타그램",p2:"-",f:"영상",id:"260918_01",prog:"뮤지컬 <그날들>",ti:"출연 배우 인사영상",bo:"서울 종연(8/23) 직후 · 김광석 30주기",mg:"심희은"},
{d:"2026-09-01",t:"14:00",p1:"인스타그램",p2:"-",f:"이미지",id:"260910_01",prog:"여수세계섬박람회 기념 음악회",ti:"박람회 보러 온 김에, 저녁엔 예울마루",bo:"공동작업자 · 회기 9/5~11/4 시즌 안내",mg:"심희은"},
{d:"2026-09-03",t:"15:00",p1:"인스타그램",p2:"-",f:"이미지",id:"261009_01",prog:"뮤지컬 <이상한 나라의 춘자씨>",ti:"영화관 대신 공연장 ② %할인 3종",bo:"춘자씨 50%(초·중·고) · 트리플빌/피아노 30%",mg:"심희은"},
{d:"2026-09-16",t:"11:00",p1:"카카오톡",p2:"-",f:"이미지",id:"260918_01",prog:"뮤지컬 <그날들>",ti:"공연 D-2",bo:"9/18~20 4회차 · 10년 만의 재방문",mg:"황세웅"},
{d:"2026-09-24",t:"15:00",p1:"인스타그램",p2:"-",f:"이미지",id:"261014_01",prog:"국립현대무용단 <트리플 빌>",ti:"10월, 여수에서만 (희소성 묶음)",bo:"트리플 빌 + 피아노 & 피아노 · 학생 30%",mg:"심희은"},
{d:"2026-09-24",t:"16:00",p1:"블로그·맘카페",p2:"블로그",f:"텍스트",id:"261014_01",prog:"국립현대무용단 <트리플 빌>",ti:"10월, 여수에서만 — 롱폼",bo:"국립 단체 지역투어 + 해외 아티스트 내한",mg:"심희은"},
{d:"2026-10-06",t:"14:00",p1:"인스타그램",p2:"-",f:"영상",id:"261009_01",prog:"뮤지컬 <이상한 나라의 춘자씨>",ti:"공연 D-3 릴스",bo:"10/9~10 · 가족 관람 소구",mg:"심희은"},
{d:"2026-10-08",t:"16:00",p1:"블로그·맘카페",p2:"블로그",f:"텍스트",id:"261014_01",prog:"국립현대무용단 <트리플 빌>",ti:"윌리엄 포사이스 심화",bo:"서울 CJ토월 10/2~4 직후 · 검색 유입용",mg:"심희은"},
{d:"2026-10-16",t:"15:00",p1:"인스타그램",p2:"-",f:"이미지",id:"261022_01",prog:"18세기, 시대악기로 만나는 바로크의 정점과 고전의 새벽",ti:"시대악기로 듣는 18세기",bo:"제목 그대로 = 바로크의 정점 → 고전의 새벽 · 소극장",mg:"심희은"},
{d:"2026-10-21",t:"14:00",p1:"인스타그램",p2:"-",f:"영상",id:"261027_01",prog:"다비드 바뱅 & 아드리앙 몽도 <피아노 & 피아노>",ti:"20년 전 아비뇽의 재회",bo:"babx × Adrien M & Claire B · 2023 초연",mg:"심희은"},
{d:"2026-10-21",t:"16:00",p1:"블로그·맘카페",p2:"블로그",f:"텍스트",id:"261027_01",prog:"다비드 바뱅 & 아드리앙 몽도 <피아노 & 피아노>",ti:"미디어아트 롱폼",bo:"아르떼 컨택 연계 · 검색 유입용",mg:"심희은"}
  ];

  const miss = ['api','_buildRecRow','_validateScheduleChange','_findPerfByName','records','userRole','syncReload','password']
    .filter(n => { try { return typeof eval(n) === 'undefined'; } catch (e) { return true; } });
  if (miss.length) { console.error('앱 페이지에서 실행하세요. 없는 심볼:', miss); return; }
  if (!password)   { console.error('로그인 후 실행하세요 (password 비어 있음).'); return; }

  /* 데이터 로딩 대기 — 로그인 직후엔 PERFS/records가 아직 비어 있다.
     (260804 실패 원인: 이 대기가 없어서 22건 전부 「프로그램 못 찾음」으로 떨어졌다) */
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 60; i++) {
    const ready = (typeof _perfReady === 'undefined' || _perfReady) && PERFS && PERFS.length;
    if (ready) break;
    if (i === 0) console.log('프로그램 데이터 로딩 대기 중…');
    await sleep(500);
  }
  if (!PERFS || !PERFS.length) { console.error('프로그램 목록이 비어 있습니다. 캘린더가 다 뜬 뒤 다시 실행하세요.'); return; }
  console.log('프로그램 ' + PERFS.length + '건 · 기존 홍보기록 ' + records.length + '건 확인');

  const status = (userRole === 'admin') ? '예정' : '신청 중';
  const ok = [], ng = [];
  E.forEach((e, i) => {
    /* 프로그램ID 우선 매칭 — 이름은 바뀔 수 있어도 ID는 안 바뀐다. 못 찾으면 이름으로 폴백 */
    const p = PERFS.find(x => String(x.id || '').trim() === e.id) || _findPerfByName(e.prog);
    if (!p) { ng.push({ '#': i + 1, 날짜: e.d, 사유: '프로그램 못 찾음 (ID ' + e.id + ' / ' + e.prog + ')' }); return; }
    e._p = p; e.prog = p.f || e.prog;          // 앱이 들고 있는 이름을 정본으로 사용
    const v = _validateScheduleChange(null, e.d, e.t, { action: 'submit', plat1: e.p1, applicant: e.mg, program: e.prog });
    if (!v.ok) { ng.push({ '#': i + 1, 날짜: e.d + ' ' + e.t, 제목: e.ti, 사유: v.reason }); return; }
    ok.push(e);
  });
  console.log('%c[홍보계획] 검증 %d/%d 통과 · 실패 %d · 진행상태=%s',
    'font-weight:bold', ok.length, E.length, ng.length, status);
  if (ng.length) console.table(ng);
  console.table(ok.map(e => ({ 날짜: e.d, 시간: e.t, 플랫폼: e.p1, 프로그램: e.prog, 제목: e.ti, 게시: e.mg })));
  if (!ok.length) { console.warn('등록할 게 없습니다.'); return; }
  if (!ASK) { console.warn('검증만 하고 종료 — 저장 안 함.'); return; }
  const dup = records.filter(r => ok.some(e => String(r['프로그램'] || '') === e.prog && String(r['콘텐츠 제목'] || '') === e.ti)).length;
  if (!confirm('예울마루 홍보 계획 ' + ok.length + '건을 지금 등록할까요?\n\n'
      + '진행 상태: ' + status + '\n'
      + (dup ? '\u26a0 같은 프로그램·제목이 이미 ' + dup + '건 있습니다(중복 등록될 수 있음)\n' : '')
      + '\n[확인] = 등록  /  [취소] = 아무것도 저장 안 함')) {
    console.warn('취소됨 — 저장 안 함.'); return;
  }

  let n = 0;
  for (const e of ok) {
    const pw = {
      date: e.d, time: e.t, plat1: e.p1, plat2: e.p2, format: e.f,
      programType: (e._p || {}).t || 'c', program: e.prog,
      title: e.ti, applicant: e.mg, memo: '', folders: [],
      kakaoText: e.p1 === '카카오톡' ? e.bo : '', instaText: e.p1 === '인스타그램' ? e.bo : '',
      blogDirection: e.p1.indexOf('블로그') === 0 ? e.bo : '',
      b2bIntraText: '', b2bLink: '', smsBody: '', freeText: '', intent: '', customPlatform: ''
    };
    try {
      await api('POST', '/api/records', { values: _buildRecRow(pw, status, records.length + 1 + n, false) });
      n++; console.log('  ' + n + '/' + ok.length + ' \u2713 ' + e.d + ' ' + e.t + ' [' + e.p1 + '] ' + e.ti);
    } catch (err) {
      console.error('  \u2717 ' + e.d + ' ' + e.t + ' ' + e.ti + ' \u2014 ' + err.message);
      console.warn('여기서 중단합니다. 앞의 ' + n + '건은 이미 등록됐습니다.'); break;
    }
    await new Promise(r => setTimeout(r, 300));
  }
  await syncReload(n);
  console.log('%c완료 — ' + n + '건 등록. 캘린더를 확인하세요.', 'font-weight:bold;color:#1A6B3C');
})();
