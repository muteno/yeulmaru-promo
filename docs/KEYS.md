# 🔑 키·토큰 정리 (플랫폼별 · 프로세스 + 키)

> **이 문서엔 비밀값을 적지 않는다.** 키의 *이름·위치·용도·발급/회전 절차*만. 실제 값은 각 플랫폼 콘솔/시크릿에만 존재.
> 공개 식별자(MSAL clientId, Naver client key)는 이미 `index.html`에 박혀 있어 그대로 표기.
> Last updated: 2026-06-20 (KST)

---

## ⚡ 한눈에 — 어디에 무슨 키가 사는가

| 플랫폼 | 키(이름) | 비밀? | 사는 곳 | 용도 |
|---|---|---|---|---|
| **GitHub** | Fine-grained **PAT** | 🔒 | 브라우저 `localStorage.nb_gh_pat` (앱에서 1회 입력) | 블로그 도우미: 초안 생성 트리거 + 결과 읽기 + 톤 저장 |
| **GitHub** | `CLAUDE_CODE_OAUTH_TOKEN_EMS1130G` | 🔒 | Repo → Settings → Secrets → **Actions** | 초안 생성 엔진 (`claude -p` opus 4.8) |
| **Cloudflare** | `APP_PASSWORD` | 🔒 | Worker Variables/Secrets | 일반 사용자 앱 비번 (X-App-Password) |
| **Cloudflare** | `ADMIN_PASSWORD` | 🔒 | Worker Variables/Secrets | 관리자/슈퍼 비번 = **DB 스크립트 `DB_PW` 값** |
| **Cloudflare** | `AZURE_TENANT_ID/CLIENT_ID/CLIENT_SECRET` | 🔒 | Worker Secrets | Graph API 서비스계정 → SharePoint Excel 읽기/쓰기 |
| **Cloudflare** | `GEMINI_API_KEY` | 🔒 | Worker Secrets | OCR(상세페이지 → 텍스트) + 분석 |
| **Cloudflare** | `KASI_KEY` | 🔒 | Worker Secrets | 공휴일(천문연 특일정보) |
| **Azure AD** | MSAL `clientId` `9f3a0105-…854` | 공개 | `index.html:1609` | MS 로그인(SPA) + SharePoint 폴더 선택기 |
| **Naver Cloud** | Maps `ncpKeyId` `12kxk8z3z0` | 공개 | `index.html:4870` | 네이버 지도(DID 위치) |
| **DiceBear** | (없음) | — | — | 아바타 SVG |

> 🔒 = 절대 커밋·대화에 값 노출 금지. 표엔 **이름만**.

---

## 1. GitHub

- **레포**: `yeulmaru/yeulmaru-promo` (Public) · **사이트**: https://yeulmaru.github.io/yeulmaru-promo/
- **계정**: `yeulmarulicense@gmail.com`

### 1-a. Fine-grained PAT — 블로그 글쓰기 도우미 (브라우저용) ⭐ *지금 막힌 그거*
- **무엇**: Fine-grained Personal Access Token
- **권한(필수)**: Repository access = *Only select repositories* → `yeulmaru-promo` / Repository permissions → **Contents: Read and write**
  - ⚠️ 토스트 **"Contents: write 필요"** = 지금 넣은 토큰에 이 권한이 없다는 뜻.
- **용도**: 브라우저가 직접 호출 ①`POST /dispatches` (초안 생성 트리거 = repository_dispatch[nb-blog]) ②`GET /contents/drafts/<id>.json` (결과 폴링) ③`PUT /contents/docs/tone-refs.json` (톤 참조 저장)
- **발급**: https://github.com/settings/personal-access-tokens/new → Resource owner `yeulmaru` → Only select repositories `yeulmaru-promo` → Permissions: **Contents → Read and write** → Generate
- **앱에 넣는 법**: 블로그 도우미에서 [⚡ 초안 생성] 누르면 프롬프트 1회 → 붙여넣기. **이 브라우저에만(localStorage `nb_gh_pat`) 저장, 커밋 안 됨.**
- **다시 넣기/교체**: 브라우저 콘솔에서 `localStorage.removeItem('nb_gh_pat')` 후 다시 생성 누르면 재입력 프롬프트.
- **참고**: classic PAT(repo scope)도 동작하나 fine-grained 권장. 만료일은 짧게(7~90일) 잡고 만료 시 재발급.

### 1-b. Actions Secret `CLAUDE_CODE_OAUTH_TOKEN_EMS1130G` — 초안 생성 엔진
- **무엇**: Claude **구독(Max) OAuth 토큰** (`sk-ant-oat…`), 계정 `ems1130g@gmail.com`
- **용도**: `.github/workflows/nb-blog.yml`·`blog-draft.yml`에서 `claude -p --model claude-opus-4-8 --effort max` 실행 = **실제 글쓰기 엔진** (월 $200 Max 구독이라 초안당 추가비용 0)
- **위치**: Repo → Settings → Secrets and variables → **Actions** → `CLAUDE_CODE_OAUTH_TOKEN_EMS1130G`
- **발급/회전**: 로컬에서 `claude setup-token` → 출력된 `sk-ant-oat…`를 위 secret에 갱신
- **주의**: 구독 OAuth는 **Actions의 `claude -p`에서만** 동작(원시 Messages API 불가). 만료되면 초안 생성이 통째로 실패 → 재발급.

---

## 2. Cloudflare Worker `yeulmaru-promo-api`

- **위치**: 대시보드 → Workers & Pages → `yeulmaru-promo-api` → **Settings → Variables and Secrets** (또는 `wrangler secret put <NAME>`)
- **배포**: Quick Edit 또는 `wrangler deploy` — **git push와 무관** (Worker 코드 고쳐도 Pages 반영 안 됨, 반대도)
- **소스**: `src/index.js` (단일 원본) · 설정: `wrangler.toml`

**Secrets (🔒 값 비공개):**
- `APP_PASSWORD` — 일반 사용자 앱 비번 (`X-App-Password` 게이트 → role=user)
- `ADMIN_PASSWORD` — 슈퍼/관리자 비번 (role=admin). **= DB 인제스트 스크립트 실행 시 `DB_PW`에 넣는 값**
- `AZURE_TENANT_ID` / `AZURE_CLIENT_ID` / `AZURE_CLIENT_SECRET` — Graph API 서비스계정(SharePoint Excel CRUD)
- `GEMINI_API_KEY` — Google Gemini (OCR + 분석). 모델명은 `GEMINI_MODEL`/`OCR_MODEL`/`BLOG_MODEL`(비밀 아님)로 오버라이드
- `KASI_KEY` — 공공데이터포털(한국천문연구원) 특일정보 = 공휴일
- *(대체 경로, 현재 주력 아님)* `ANTHROPIC_API_KEY`/`ANTHROPIC_AUTH_TOKEN`, `CLOVA_OCR_INVOKE_URL`/`CLOVA_OCR_SECRET`(네이버 CLOVA OCR), `GOOGLE_SA_EMAIL`/`GOOGLE_SA_PRIVATE_KEY`/`GOOGLE_VISION_KEY`(Google Vision OCR)

**Config (비밀 아님):** `ALLOWED_ORIGIN=*` (`wrangler.toml [vars]`) · KV `ops_kv`(binding, 메모 등) · cron `0 1 * * *`(보류 자동취소)

---

## 3. Azure AD (Microsoft Entra) — 프론트 MSAL 로그인

- **clientId**: `9f3a0105-aa86-4a8b-bad0-bd651688d854` *(공개 SPA client ID, `index.html:1609`)*
- **tenant(authority)**: `…/95768064-89cb-48c0-b5e5-e7bd309abcbd`
- **플랫폼**: **SPA** · redirectUri = `https://yeulmaru.github.io/yeulmaru-promo/` (**trailing slash 필수**, Web 아님 — CORS)
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
블로그 초안:  브라우저 + GitHub PAT(Contents:write) ──dispatch──▶ Actions(nb-blog.yml)
              Actions가 CLAUDE_CODE_OAUTH_TOKEN으로 claude -p 실행 ──▶ drafts/<id>.json
              브라우저가 PAT로 결과 폴링해 화면 표시
데이터(시트): 브라우저 + APP_PASSWORD/Sub-PIN ──▶ Worker ──AZURE_*──▶ Graph ──▶ SharePoint Excel
OCR:          브라우저 ──▶ Worker(GEMINI_API_KEY) ──▶ 텍스트
로그인:       브라우저 ──MSAL clientId──▶ MS 신원  +  담당자 PIN(시트)
DB 스크립트:  로컬 PowerShell  DB_PW=<ADMIN_PASSWORD> node docs/*.mjs --write
```
