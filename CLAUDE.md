1. [의도] 사용자의 말에서 진짜 목적을 파악해 그걸 해결한다. 간단한 일은 빠르게, 큰 일은 시작 전에 계획 한 줄 공유한다.
2. [확인] 불확실하면 파일이나 웹으로 확인한다. 추측 금지. 못 확인하면 「미확인」이라고 말한다.
3. [디자인] 새 디자인을 만들지 않는다. 같은 리포지토리 안의 기존 디자인·컴포넌트를 쓴다.
4. [전후] UI 변경은 전과 후를 보여준다. 시각 변경은 이미지나 html로.
5. [완료] 작업 끝 = 머지까지. 단 충돌·체크 실패·비가역 작업이면 멈추고 묻는다.
6. [보고] 딱 3줄: ①결과(실패는 실패라고) ②바뀐 것 ③머지 여부 + 다음 액션.

## 【바인딩】 yeulmaru-promo — 레포 고유 라우터

> 위 1~6 = 전 레포 공통 지침. 아래 = 이 레포 고유 절 — AGENTS.md·docs가 「마스터 라우터」로 가리키는 실체다(공통 지침 아래에 위치·자동 동기화 대상 아님). 값·규칙·컴포넌트·게이트의 **위치 SSOT** = `docs/절대명령2_정본인덱스.md`.

- **디자인 SSOT(UI 작업 전 필독)** = `docs/디자인기틀.md` — 토큰(`:root` 2블록)·정본 컴포넌트만. 새 raw hex·새 토큰·새 `:root` 블록 금지, 기틀에 없는 형태는 운영자에게 질문.
- **디자인 게이트** = `tools/check_design.py` — `index.html`·`signage/*.html` 편집 시 커밋 전 필수(`.githooks/pre-commit`이 강제).
- **모달 머리줄(운영자 260805-23 「모든 모달 창 윗부분을 저거로 스모킹 패리티 고정」)** = 모든 `.modal`은 강조색 밴드 머리줄 한 벌 — 모양 SSOT `CSS .mhead` · 내용 SSOT 빌더 `_mhead(제목, 부제)`. 인라인 재타이핑 금지 · 셸 패딩은 `--mpad-y`·`--mpad-x`. 게이트 = `tools/check_modal_head.py`(하드 0) + `tools/smoke_modal_head.mjs`(패리티 실측 · fail-soft).
- **연간 실적(`_YR`) 손대면** = `node tools/build_annual_yr.mjs` — 검산(길이·누계 sum·계=분야합·grand=계인원+장도) · `--recalc`(파생값 자동 재계산) · `--sync-partial`(진행 연도 잠정치를 거울에서 계산 · **후퇴 = 거울 낡음 신호로 거부**, 실측 260804에 라이브 9,568을 낡은 거울 4,210으로 되돌릴 뻔한 걸 막았다). `.githooks/pre-commit`·`npm run check`가 강제. ⚠ 과거 연도를 거울로 재생성하지 마라 — 기준이 다르다(취합본 2025 공연 83,455 = 무료 포함 vs 운영대장 발권유료 63,444 · 전시도 전체 취합 26,785 vs 전시DB 20,217). 거울로 재현되는 건 **진행 연도 잠정치**뿐이고 교육·장도·문화나눔은 연도별 원천 자체가 없다.
- **디자인 제안·시안·튜닝** = `docs/플레이그라운드_포터블.md` — 만지는 플레이그라운드식 HTML(정적 이미지·텍스트 나열 갈음 금지), 산출 = `docs/reports/`.
- **앱 도메인 상세** = `docs/앱지침.md`.
- **동시 편집 주의(다중 세션)** = 커밋·푸시·머지 직전 `git fetch origin main` 필수. main force-push 금지, 머지는 PR로, 머지된 브랜치에 새 커밋 금지.
- **데이터 안전** = SharePoint 마스터(xlsm) 직접 편집 금지 — 시트 데이터는 앱 모달/Worker API로만. Worker(`src/index.js`)는 **main 머지 시 자동 배포**(`.github/workflows/deploy-worker.yml` — `src/index.js`·`wrangler.toml` 변경 감지 → `wrangler deploy`). 260803 실측 = 최근 30회 전부 성공. ⚠ 구 문구 「wrangler deploy 별도 필요」는 이 워크플로 신설 전 이야기 — 그대로 두면 세션마다 운영자에게 불필요한 수동 배포를 시킨다(실제로 시켰다).
- **빌드 큐 = 손댈 것 없음(260804 실측 · 이식 금지 명문)** = 이 레포 프론트는 **GitHub Pages**(`pages-build-deployment` · CF Pages 아님). Pages 빌드 **120런 실측 = 큐 대기 0초 전건**(빌드 26~250s·평균 40s · 피크 60분 창 15빌드), 밀린 이력 0 — 정기 봇 커밋 축이 **없고**(워크플로 6종 전부 dispatch성) 시트 데이터는 Worker API 경유라 빌드와 무관하다. ⚠ nomute-editor의 `[CF-Pages-Skip]` 코얼레싱·`check_pages_skip`·`check_coalesce_pair`를 **이식하지 마라** — CF 전용 토큰이라 GitHub Pages엔 대응물이 없고, 유일한 GitHub 토큰 `[skip ci]`는 Actions 스킵 = 발화 반경 정반대다. GitHub Pages는 **앞 빌드가 끝나기 전 새 커밋이 오면 앞 빌드를 자동 취소**해 최신만 배포한다(실측 = 간격 24s인 #1300만 `cancelled` · 간격 36~58s 6건은 전건 `success`) = 코얼레싱이 플랫폼 내장. **정기 봇 커밋 축을 신설할 때만** 짝 규칙 적용 — 화면이 fetch하는 산출 JSON은 빌드 우회 서빙(Worker API)을 함께 배선(nomute `check_coalesce_pair` 원칙).
- **작업 이력(append-only)** = `docs/작업이력.md`.
- **시크릿 인벤토리·회전 절차(값 없음·이름/위치/회전만)** = `docs/KEYS.md`.

> ⚠️ SYNC 상태: 이 레포는 위 공통 지침을 nomute-editor에서 `SYNC-COMMON-START`·`SYNC-COMMON-END` 마커로 동기화받는다. 현재 마커 부재 = 전파 수신 중단(260801 간소화 개정에서 마커·구 바인딩 블록이 함께 삭제됨). 마커 재삽입 = 동기화 재가동(공통 지침이 nomute-editor 골격으로 덮일 수 있음) → 운영자 결정 사항. 이 【바인딩】 절은 마커 밖이라 재가동돼도 보존.
