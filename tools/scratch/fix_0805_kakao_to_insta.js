/* 8/5 카톡 → 인스타 변경 — 앱 탭(로그인 상태) 콘솔에 붙여넣기
   왜: 8/5(수) 카톡 → 8/6(목) 카톡 = 연일 발송. 8/6은 섬박람회 티켓오픈이라 못 옮기니 8/5를 옮긴다.
       바꾸고 나면 카톡이 8/6(오픈) → 8/8(마감)으로 이틀 간격이 된다.
   무엇을: 조재혁 「조기예매 25% 마감 D-3」 1건
       플랫폼 카카오톡 → 인스타그램 · 시각 11:00 → 15:00(인스타 11~17시 규칙) · 게시담당 황세웅 → 심희은
   앱 자체 함수(_buildRecRow · api PATCH)만 쓴다 = 변경 모달이 타는 경로 그대로.
   붙여넣고 Enter → 대상 1건을 보여주고 「바꿀까요?」 팝업 → [확인]. [취소]면 아무것도 안 바뀐다. */
(async () => {
  const miss = ['api','_buildRecRow','_findPerfByName','records','userRole','syncReload','password','PERFS']
    .filter(n => { try { return typeof eval(n) === 'undefined'; } catch (e) { return true; } });
  if (miss.length) { console.error('앱 페이지에서 실행하세요. 없는 심볼:', miss); return; }
  if (!password) { console.error('로그인 후 실행하세요.'); return; }

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 60; i++) {
    if ((typeof _perfReady === 'undefined' || _perfReady) && PERFS && PERFS.length && records && records.length) break;
    if (i === 0) console.log('데이터 로딩 대기 중…');
    await sleep(500);
  }
  if (!PERFS || !PERFS.length) { console.error('프로그램 목록이 비어 있습니다. 캘린더가 다 뜬 뒤 다시 실행하세요.'); return; }

  const key = r => `${r['연도']||''}-${String(r['월']||'').padStart(2,'0')}-${String(r['일']||'').padStart(2,'0')}`;
  const live = st => ['신청 중','예정','완료'].includes(String(st||'').trim());
  const hits = records.filter(r =>
    key(r) === '2026-08-05'
    && String(r['플랫폼 1']||'').includes('카카오')
    && live(r['진행 상태'])
    && String(r['콘텐츠 제목']||'').includes('조기예매'));

  if (!hits.length) { console.warn('대상을 못 찾았습니다 — 이미 바뀌었거나 8/5 카톡 건이 없습니다.'); return; }
  console.table(hits.map(r => ({ 행: r._rowIndex, 날짜: key(r), 플랫폼: r['플랫폼 1'],
    제목: r['콘텐츠 제목'], 게시: r['게시 담당자'], 상태: r['진행 상태'] })));
  if (hits.length > 1) { console.warn('대상이', hits.length, '건입니다. 1건일 때만 진행합니다 — 확인 후 알려주세요.'); return; }

  const r = hits[0];
  if (!confirm('8/5 「' + (r['콘텐츠 제목']||'') + '」을\n\n'
      + '  카카오톡 11:00 (황세웅)\n    ↓\n  인스타그램 15:00 (심희은)\n\n으로 바꿀까요?\n\n'
      + '[확인] = 변경 / [취소] = 그대로 둠')) { console.warn('취소됨 — 변경 없음.'); return; }

  const perf = _findPerfByName(r['프로그램']);
  const pw = {
    date: '2026-08-05', time: '15:00', plat1: '인스타그램', plat2: '-', format: '이미지',
    programType: (perf || {}).t || 'c', program: r['프로그램'] || '',
    title: r['콘텐츠 제목'] || '', applicant: '심희은', memo: String(r['비고'] || ''),
    folders: [], kakaoText: '', instaText: String(r['콘텐츠 내용'] || '').replace(/^\[[^\]]*\]\n/, ''),
    blogDirection: '', b2bIntraText: '', b2bLink: '', smsBody: '', freeText: '', intent: '', customPlatform: ''
  };
  const row = _buildRecRow(pw, String(r['진행 상태'] || '예정'), r['No'] || r['NO'] || records.length + 1, false);
  try {
    await api('PATCH', '/api/records/' + r._rowIndex, { values: row });
    console.log('%c✓ 변경 완료 — 8/5 인스타그램 15:00 (심희은)', 'font-weight:bold;color:#1A6B3C');
    console.log('  카톡 간격: 8/6 티켓오픈 → 8/8 조기예매 마감 (이틀 간격 · 연일 해소)');
    await syncReload(0);
  } catch (e) { console.error('✗ 실패 —', e.message); }
})();
