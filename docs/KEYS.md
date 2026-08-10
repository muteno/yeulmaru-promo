# 🔑 키·토큰 정리 (플랫폼별 · 프로세스 + 키)

> **이 문서엔 비밀값을 적지 않는다.** 키의 *이름·위치·용도·발급/회전 절차*만. 실제 값은 각 플랫폼 콘솔/시크릿에만 존재.
> 공개 식별자(MSAL clientId, Naver client key)는 이미 `index.html`에 박혀 있어 그대로 표기.
> Last updated: 2026-07-13 (KST)
>
> 🔌 **아직 도입 전인 외부 공공 API의 발급 절차** = `docs/공공API_발급절차.md`
> (여수·순천·광양 대상 4종 — 교통안전공단 주차정보 · 관광공사 방문자수 · KOPIS · 여수시 포털).
> 발급이 끝난 키는 그 문서에서 **이 문서로 옮겨 적는다** — 저기는 절차, 여기는 현황.

---

## ⚡ 한눈에 — 어디에 무슨 키가 사는가

| 플랫폼 | 키(이름) | 비밀? | 사는 곳 | 용도 |
|---|---|---|---|---|
| **GitHub** | Fine-grained **PAT** | 🔒 | **Cloudflare Worker 시크릿** `GITHUB_PAT` (260701 브라우저→서버 이관) | 블로그 도우미: 초안 생성 트리거 + 결과 폴링 (Worker가 대행) |
| **GitHub** | `CLAUDE_CODE_OAUTH_TOKEN_*` (5계정: EMS1130G·EMS1130N·MUTENO·MUTENONA·NOMUTEFB) | 🔒 | Repo → Settings → Secrets → **Actions** | 초안 생성 엔진 (`claude -p` opus 5) — 활성 계정 쿼터 시 순환 폴오버 |
| **GitHub** | `GH_VARS_TOKEN` (Fine-grained PAT · Variables RW) | 🔒 | Repo → Settings → Secrets → **Actions** | 활성 계정 자동 승격이 `vars.ACTIVE_ACCOUNT` 를 쓰는 권한 |
| **Cloudflare** | `APP_PASSWORD` | 🔒 | Worker Variables/Secrets | 일반 사용자 앱 비번 (X-App-Password) |
| **Cloudflare** | `ADMIN_PASSWORD` | 🔒 | Worker Variables/Secrets | 관리자/슈퍼 비번 = **DB 스크립트 `DB_PW` 값** |
| **Cloudflare** | `AZURE_TENANT_ID/CLIENT_ID/CLIENT_SECRET` | 🔒 | Worker Secrets | Graph API 서비스계정 → SharePoint Excel 읽기/쓰기 |
| **Cloudflare** | `GEMINI_API_KEY` | 🔒 | Worker Secrets | OCR(상세페이지 → 텍스트) + 분석 + **로고 제작(이미지 생성, 260805)** + **카카오 76자 문구 제안(260805)** |
| **Cloudflare** | `KASI_KEY` | 🔒 | Worker Secrets | 공휴일(천문연 특일정보) |
| **Azure AD** | MSAL `clientId` `9f3a0105-…854` | 공개 | `index.html:1609` | MS 로그인(SPA) + SharePoint 폴더 선택기 |
| **Naver Cloud** | Maps `ncpKeyId` `12kxk8z3z0` | 공개 | `index.html:4870` | 네이버 지도(DID 위치) |
| **DiceBear** | (없음) | — | — | 아바타 SVG |

> 🔒 = 절대 커밋·대화에 값 노출 금지. 표엔 **이름만**.

---

## 1. GitHub

- **레포**: `muteno/yeulmaru-promo` (Public) · **사이트**: https://muteno.github.io/yeulmaru-promo/
- **계정**: `yeulmarulicense@gmail.com`

### 1-a. Fine-grained PAT — 블로그 글쓰기 도우미 (⚠️ 260701 브라우저→Worker 시크릿 이관)
- **무엇**: Fine-grained Personal Access Token — **이제 브라우저가 아니라 Cloudflare Worker가 보유**(서버 시크릿 `GITHUB_PAT`). 브라우저엔 GitHub 토큰이 전혀 없다.
  - *왜 옮겼나*: 브라우저 저장은 ①공개 사이트라 토큰 노출 위험 ②그 브라우저에서만 동작(사용자마다 개별 입력). 서버 시크릿 1개로 통일 → 로그인 사용자 누구나 사용, 노출 위험 제거.
- **권한(필수)**: Repository access = *Only select repositories* → `yeulmaru-promo` / Repository permissions → **Contents: Read and write** (repository_dispatch 트리거 + drafts 파일 읽기에 필요)
  - ⚠️ 예전 토스트 **"Contents: write 필요"** = 그 토큰에 이 권한이 없다는 뜻 (이제 서버 PAT가 이 권한을 가져야 함).
- **용도**: Worker가 대행 ①`POST /dispatches` (초안 생성 트리거 = repository_dispatch[nb-blog]) ②`GET /contents/drafts/<id>.json` (결과 폴링). 프론트는 `POST /api/blog/dispatch`·`GET /api/blog/draft?id=`로 **Worker만** 호출(X-App-Password 게이트). 톤 참조는 이제 localStorage 전용(GitHub 저장 폐지).
- **발급**: https://github.com/settings/personal-access-tokens/new → Resource owner `muteno` → Only select repositories `yeulmaru-promo` → Permissions: **Contents → Read and write** → Generate → 값 복사
- **Worker에 넣는 법**: Cloudflare 대시보드 → Workers & Pages → `yeulmaru-promo-api` → Settings → Variables and Secrets → **Secret 추가 `GITHUB_PAT`** = 복사한 값 → 저장 → 배포. (또는 `wrangler secret put GITHUB_PAT`) 대체 이름 `GH_BLOG_PAT`/`GITHUB_TOKEN`도 인식. repo/branch는 `GITHUB_REPO`/`GITHUB_BRANCH`로 오버라이드(기본 `muteno/yeulmaru-promo`·`main`).
- **회전(교체)**: GitHub에서 Regenerate → 새 값을 Worker 시크릿 `GITHUB_PAT`에 갱신 → 재배포. **브라우저는 건드릴 것 없음.** 만료일은 짧게(7~90일).
- **미설정 시**: 시크릿 없으면 `/api/blog/dispatch`가 503 → 프론트가 '초안 생성이 서버에 아직 설정되지 않았어요' 토스트. 앱 나머지 기능은 무관하게 정상.

### 1-b. Actions Secret `CLAUDE_CODE_OAUTH_TOKEN_*` (5계정) — 초안 생성 엔진 + 순환 폴오버
- **무엇**: Claude **구독(Max) OAuth 토큰** (`sk-ant-oat…`) 5개. 계정·순서(체인) = `EMS1130G`(활성 기본) → `EMS1130N` → `MUTENO` → `MUTENONA` → `NOMUTEFB`.
- **용도**: `nb-blog.yml`·`blog-draft.yml`에서 `claude -p --model claude-opus-5 --effort max` 실행 = **실제 글쓰기 엔진** (Max 구독이라 초안당 추가비용 0). 같은 체인을 `hwp-edit.yml`·`office-edit.yml`·`promo-advise.yml`(AI 홍보 전략 추론 · 260806)도 쓴다. 활성 계정(`vars.ACTIVE_ACCOUNT`, 없으면 EMS1130G)이 주간 쿼터로 막히면 `shared/claude_failover.js`가 체인의 다음 계정으로 **순환 폴오버**해 결과물을 확보.
- **위치**: Repo → Settings → Secrets and variables → **Actions** → `CLAUDE_CODE_OAUTH_TOKEN_<계정명>` (각 계정 1개).
- **발급/회전**: 각 계정 로컬에서 `claude setup-token` → 출력된 `sk-ant-oat…`를 해당 secret에 갱신.
- **주의**: 만료되면 그 계정만 폴오버로 건너뛰고, 전 계정 만료 시 초안 생성 실패.
- **⚠️ 정정(260806)**: 구판 문구 「구독 OAuth는 **Actions의 `claude -p`에서만** 동작 — 원시 Messages API 불가」는 **오기**다. 구독 OAuth 토큰(`sk-ant-oat…`)은 `Authorization: Bearer <토큰>` + `anthropic-beta: oauth-2025-04-20` 헤더로 **`api.anthropic.com/v1/messages`에서 그대로 동작**한다(공식 문서 경로). 단 하나의 추가 규약 = **system 첫 블록이 Claude Code 신원**이어야 한다(아니면 403 `Request not allowed`) — `src/index.js` `claudeText`·`extractPromoInfo`·`yeulChat`이 이미 그렇게 부르고 있다.
  - *왜 정정하나*: 이 한 줄을 근거로 260806 세션이 「예울이를 Worker에서 즉답시키려면 **유료 `ANTHROPIC_API_KEY` 신규 발급 = 비용 발생**」이라고 운영자에게 보고했다. **이미 있는 배선을 못 본 오판**이었고, 문구를 고치지 않으면 다음 세션이 같은 오판을 반복한다.
- **⚠️ 계정 추가/제거 시 동기화 지점(반드시 전부)**: ①`shared/claude_failover.js` `CHAIN` ②`shared/account_failover.py` `CHAIN` ③`nb-blog.yml` env `ACC_*` ④`blog-draft.yml` env `ACC_*` ⑤(체인 선두 변경 시) 각 워크플로 `|| 'EMS1130G'` 기본값 ⑥해당 `CLAUDE_CODE_OAUTH_TOKEN_*` 시크릿. CHAIN 4곳(①②③④)이 어긋나면 폴오버/승격 오작동.

### 1-c. Actions Secret `GH_VARS_TOKEN` — 활성 계정 자동 승격(sticky failover)
- **무엇**: Fine-grained **PAT**, 권한 = 이 레포 **Variables: Read and write** (딱 이것만 — 최소권한).
- **용도**: 활성 계정 쿼터가 THRESHOLD(기본 2)회 누적되면 `shared/account_failover.py`가 `vars.ACTIVE_ACCOUNT`를 체인의 다음 계정으로 PATCH(승격) + `ACTIVE_QUOTA_HITS` 카운트 관리. **승격은 concurrency로 직렬화되는 `nb-blog.yml`에서만** 실행(경쟁 방지) — vars 하나 바꾸면 전 워크플로 반영.
- **위치**: Repo → Settings → Secrets and variables → **Actions** → `GH_VARS_TOKEN` (⚠️ Variables 탭 아님, **Secrets** 탭).
- **발급**: github.com/settings/personal-access-tokens/new → Only select repositories `yeulmaru-promo` → Permissions → **Variables: Read and write** → Generate → 값 복사.
- **미설정 시**: 승격 완전 no-op(라이브 무해). 폴오버(다계정)는 GH_VARS_TOKEN 없이도 동작 — 승격만 비활성.
- **실측**: Actions 탭 → `account-selftest` → Run workflow → 로그 `🎉 PAT 실측 통과`면 정상(활성 계정 무손상, probe 변수만 왕복).
- **상태 변수(자동 관리, 손대지 말 것)**: `vars.ACTIVE_ACCOUNT`(현재 활성 계정명) · `vars.ACTIVE_QUOTA_HITS`(쿼터 누적 카운트).

---

## 2. Cloudflare Worker `yeulmaru-promo-api`

- **위치**: 대시보드 → Workers & Pages → `yeulmaru-promo-api` → **Settings → Variables and Secrets** (또는 `wrangler secret put <NAME>`)
- **배포**: **main 머지 시 자동**(`.github/workflows/deploy-worker.yml` — `src/index.js`·`wrangler.toml` 변경 감지 → `wrangler deploy` · 260803 실측 최근 30회 전건 성공). 수동 배포 불필요 — Quick Edit/수동 `wrangler deploy`는 비상용. **시크릿은 대시보드에서 저장(및 배포)까지 완료해야 반영** — 반영 여부는 값 추측 말고 `/api/monitor/feed`의 `ready`(또는 해당 기능 5xx 여부)로 실측(260807 GALERT_RSS 입력 화면까지 가고도 라이브 `ready.google=false`였던 실례).
- **소스**: `src/index.js` (단일 원본) · 설정: `wrangler.toml`

**Secrets (🔒 값 비공개):**
- `APP_PASSWORD` — 일반 사용자 앱 비번 (`X-App-Password` 게이트 → role=user)
- `ADMIN_PASSWORD` — 슈퍼/관리자 비번 (role=admin). **= DB 인제스트 스크립트 실행 시 `DB_PW`에 넣는 값**
- `AZURE_TENANT_ID` / `AZURE_CLIENT_ID` / `AZURE_CLIENT_SECRET` — Graph API 서비스계정(SharePoint Excel CRUD)
- `GEMINI_API_KEY` — Google Gemini (OCR + 분석 + **로고 제작 이미지 생성** + **카카오 76자 문구 제안**). 모델명은 `GEMINI_MODEL`/`OCR_MODEL`/`BLOG_MODEL`/`LOGO_MODEL`(비밀 아님)로 오버라이드
  - **로고 제작(260805)은 키를 새로 안 만든다** — 이 키 하나를 이미지 생성에도 태웠다(`POST /api/content/logo`). 원본 프로젝트(Nutlope/logocreator)는 Together AI 키를 요구하지만 그걸 발급·등록하지 않기로 한 결정. 미설정이면 이 엔드포인트만 503(앱 나머지 무관하게 정상).
  - **카카오 76자 문구 제안(260805)도 키를 새로 안 만든다** — `POST /api/content/kakao`가 이 키 하나로 포스터 OCR(비전)과 문구 생성(텍스트)을 둘 다 한다. 미설정이면 이 엔드포인트만 503(앱 나머지 무관하게 정상) · 프론트는 「AI가 아직 연결되지 않았어요」 안내.
  - `LOGO_MODEL` 미설정 시 후보 순서 = `gemini-3.1-flash-image` → `gemini-2.5-flash-image`. 프리뷰 모델이 은퇴해 404가 나면 이 변수에 현행 모델명을 넣으면 코드 수정 없이 복구된다.
- `KASI_KEY` — 공공데이터포털(한국천문연구원) 특일정보 = 공휴일
- `ANTHROPIC_AUTH_TOKEN`(구독 OAuth `sk-ant-oat…`) **또는** `ANTHROPIC_API_KEY`(유료) — **예울이 채팅 즉답의 엔진**(`POST /api/yeul/chat` · 260806). 모델 = 기본 `claude-sonnet-5`·effort low / 어려우면 `claude-opus-5`·effort medium(SSOT = `src/index.js` `yeulChat`). 미설정이면 이 엔드포인트만 503 → **앱이 조용히 Actions 경로로 폴백**(느려질 뿐 기능은 산다). 블로그·분석의 `claudeText`/`extractPromoInfo`도 같은 키를 쓴다.
  - ⚠ 위 1-b 정정 참조 — 구독 OAuth 토큰이 원시 Messages API에서 동작한다. 이 슬롯을 채우려고 **유료 키를 새로 발급할 필요가 없다**(계정 5개의 `sk-ant-oat…` 중 하나를 넣으면 된다).
  - **검색 모니터링 AI 선별(260807)도 이 키를 그대로 쓴다** — 크론(KST 8·11·14·17시 :15)이 `smJudge`로 최근 3일치 관련/무관을 판정(sonnet 5·effort low·회당 ≤60건 = 구독 쿼터에 티끌). 모델 교체는 비밀 아닌 변수 `MONITOR_JUDGE_MODEL`. 수동 1회 = `POST /api/monitor/judge`.
- `GALERT_RSS` — **검색 모니터링 ① 구글 축**(키가 아니라 주소 목록): Google Alerts RSS 피드 주소를 줄바꿈(또는 쉼표·공백)으로 이어 **한 값**으로. 현행 13개 = 키워드 8종 + `site:` 5종(blog.naver/tistory/brunch/cafe.daum/yeosu.go.kr) · 코드 상한 16. 발급·회전 = alerts.google.com(RSS 전달 방식)에서 피드 추가/삭제 후 이 값 갱신. 미설정 = 구글 갈래만 꺼짐(`/api/monitor/*` 자체는 산다).
- `KAKAO_REST_KEY` — **검색 모니터링 ②′ 다음(카카오) 검색** REST API 키(developers.kakao.com → 앱 → 앱 키 → REST API 키). 티스토리·브런치·다음카페 커버 = robots로 막힌 네이버 카페의 실질 대체(260807 실측). 회전 = 카카오 콘솔 재발급.
- `KOPIS_KEY` — **검색 모니터링 ③ KOPIS 공연DB** 서비스키(kopis.or.kr 회원가입 → 인증키 신청 `openApiUseSend.do` → 승인 후 마이페이지에서 복사). **공연 전용**(전시는 안 나온다).
- `NAVER_SEARCH_ID` / `NAVER_SEARCH_SECRET` — 검색 모니터링 ② 네이버 검색 API. ⚠ **260806 실측 = 신규 발급 불가**(개발자센터 「검색」 소멸) — 코드만 존치, 키가 생기면 넣는 즉시 켜진다.
- *(대체 경로, 현재 주력 아님)* `CLOVA_OCR_INVOKE_URL`/`CLOVA_OCR_SECRET`(네이버 CLOVA OCR), `GOOGLE_SA_EMAIL`/`GOOGLE_SA_PRIVATE_KEY`/`GOOGLE_VISION_KEY`(Google Vision OCR)

**Config (비밀 아님):** `ALLOWED_ORIGIN=*` (`wrangler.toml [vars]`) · KV `ops_kv`(binding, 메모 등) · cron `*/15 * * * *`(보류 자동취소는 KST 10시대 분기 · **검색 모니터링 스캔은 매시 첫 틱 1회**) · `MONITOR_KEYWORDS`(선택 — 네이버/카카오 갈래 검색어 CSV, 기본 「예울마루」 · 최대 5)

---

## 3. Azure AD (Microsoft Entra) — 프론트 MSAL 로그인

- **clientId**: `9f3a0105-aa86-4a8b-bad0-bd651688d854` *(공개 SPA client ID, `index.html:1609`)*
- **tenant(authority)**: `…/95768064-89cb-48c0-b5e5-e7bd309abcbd`
- **플랫폼**: **SPA** · redirectUri = `https://muteno.github.io/yeulmaru-promo/` (**trailing slash 필수**, Web 아님 — CORS)
- **스코프**: `Files.Read`, `Files.Read.All`, `Sites.Read.All`
- **용도**: MS 신원확인(로그인 시 PIN과 2중) + SharePoint 사이트/폴더 선택기
- **콘솔**: portal.azure.com → App registrations. *(서비스계정 client secret = Worker의 `AZURE_CLIENT_SECRET`, 여기 clientId와 별개)*

---

## 4. Naver Cloud Platform — 지도

- **ncpKeyId**: `12kxk8z3z0` *(공개 client key, `index.html:4870`)*
- **용도**: 네이버 지도(DID 위치 지도). 월 100만 호출 무료
- **콘솔**: NCP → **VPC > Maps**. ⚠️ `AI·NAVER API` 쪽 동명 앱(`sgzrzp8ucm`)은 Maps 호출 시 429 — 안 씀

---

## 5. DiceBear — 아바타

- 키 없음. 공개 API: `https://api.dicebear.com/9.x/personas/svg?seed=<문구>`

---

## 🔁 키 흐름 한 줄 요약

```
블로그 초안:  브라우저(X-App-Password) ──▶ Worker(GITHUB_PAT) ──dispatch──▶ Actions(nb-blog.yml)
              Actions가 활성 CLAUDE_CODE_OAUTH_TOKEN(쿼터 시 5계정 순환 폴오버)으로 claude -p 실행 ──▶ drafts/<id>.json
              활성 쿼터 2회 누적 시 GH_VARS_TOKEN이 vars.ACTIVE_ACCOUNT를 다음 계정으로 자동 승격
              브라우저 ──▶ Worker가 PAT로 결과 폴링·디코드해 화면 표시
데이터(시트): 브라우저 + APP_PASSWORD/Sub-PIN ──▶ Worker ──AZURE_*──▶ Graph ──▶ SharePoint Excel
OCR:          브라우저 ──▶ Worker(GEMINI_API_KEY) ──▶ 텍스트
로그인:       브라우저 ──MSAL clientId──▶ MS 신원  +  담당자 PIN(시트)
DB 스크립트:  로컬 PowerShell  DB_PW=<ADMIN_PASSWORD> node docs/*.mjs --write
```
