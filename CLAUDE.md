# yeulmaru-promo — CLAUDE.md

> **예울마루 홍보 계획표 웹앱**  
> GS칼텍스 예울마루 직원이 홍보 콘텐츠 신청·관리를 위해 사용하는 단일파일 웹앱.  
> 기존 엑셀+VBA 매크로 워크플로우를 대체.  
>   
> **Last updated**: 2026-05-25 (KST)

> ⚠️ **대화 시작 시 첨부 룰**: yeulmaru-promo 작업할 때 이 파일을 채팅창에 첨부하면 매번 설명 안 해도 됨. 노뮤트 프로젝트와 동일 패턴.

---

## 1. 프로젝트 개요

- **레포**: [`yeulmaru/yeulmaru-promo`](https://github.com/yeulmaru/yeulmaru-promo) (Public, GitHub Pages)
- **사이트**: https://yeulmaru.github.io/yeulmaru-promo/
- **사용자**: GS칼텍스 예울마루 직원
- **인증**: PIN 4자리 (admin / user 2개 role)
- **메인 파일**: `index.html` (Vanilla JS 단일파일, ~7,100 lines, ~450KB)

## 2. 아키텍처

```
Client (index.html, GitHub Pages)
  ↓ fetch
Cloudflare Worker  (proxy)
  ↓ Graph API (Azure AD service account)
SharePoint Excel (통합 문서1.xlsm)
```

- **Frontend**: 단일 HTML, 외부 라이브러리 X, 모든 로직 inline
- **Backend**: Cloudflare Worker — Graph API 토큰 흐름 + SHEET_MAP slug 매핑
- **Storage**: SharePoint Excel (`통합 문서1.xlsm`)
- **Auth (Worker→Graph)**: Azure AD 앱 (service account)

### ⚠️ 데이터 흐름 — 헷갈리지 말 것 (다음 Claude 필독)

이 시스템엔 **완전히 별개의 두 흐름**이 공존한다. 섞으면 데이터 손상.

#### A. 데이터 흐름 (모달 변경 → Excel, 실시간 1~3초)

```
사용자 모달 → fetch → Cloudflare Worker → Graph API → SharePoint Excel 마스터
```

- 모달에서 일정 등록/수정/삭제 = **즉시** SharePoint 마스터 xlsm 반영 (1~3초)
- **OneDrive 동기화 안 거침** (그래서 빠름)
- 양 PC 로컬 xlsm 복사본은 *뒤늦게* OneDrive sync로 따라옴

#### B. 코드/파일 흐름 (수초~분)

```
회사 PC ↔ OneDrive 클라우드 (= SharePoint Document Library) ↔ 집 PC
```

- index.html, CLAUDE.md, docs/, .gitignore 등 *코드/문서 파일*
- OneDrive client가 변경 감지 → 양 PC + 클라우드 자동 반영
- 회사 PC `C:\Users\황세웅\...` ↔ 집 PC `C:\Users\Hwang\...` = **사용자명만 다르고 같은 파일** (OneDrive 안 경로 동일)

#### 🚨 절대 금지 — 로컬 xlsm 직접 편집

- 로컬 `통합 문서1.xlsm` = OneDrive sync로 받은 **복사본** (마스터 아님)
- 직접 편집 → OneDrive가 SharePoint에 push 시도 → Worker가 Graph API로 마스터 수정 중이면 **conflict copy 생성 + 데이터 손상**
- 그래서 `.gitignore`로 xlsm 차단 (`*.xlsm`) + **모든 데이터 변경은 반드시 모달에서만**
- `.xlsm` 로컬 파일은 *데이터 구조 참고용 read-only*로만 열 것

#### 변경 대상별 cheat sheet

| 변경 대상 | 어디서 | 흐름 | 속도 |
|---|---|---|---|
| 시트 데이터 (PIN/비번/홍보기록/일정/applysettings) | **모달** | Worker → Graph API → SharePoint Excel | 1~3초 |
| index.html / CSS / inline JS | **에디터 + git push** | GitHub → GitHub Pages | 1~2분 |
| Worker 코드 | **Cloudflare Quick Edit** 또는 wrangler | Cloudflare 배포 (git 무관) | 즉시 |
| CLAUDE.md / docs/ / README.md | **에디터 + git push** | GitHub (참고용, 시스템 동작 영향 X) | - |
| `통합 문서1.xlsm` 로컬 파일 | **🚫 절대 X** | (데이터 손상 위험) | - |

#### 헷갈리기 쉬운 포인트 정리

1. **"OneDrive sync로 데이터가 SharePoint Excel에 들어가는 거 아냐?"** → ❌ NO. Worker가 Graph API로 *직접 마스터 수정*. OneDrive 무관.
2. **"GitHub push하면 Excel 데이터도 바뀌나?"** → ❌ NO. GitHub는 index.html/Worker 코드만. Excel 데이터는 시스템 어디서도 git이 안 건드림.
3. **"회사 PC에서 작업한 게 집 PC에 안 보임"** → OneDrive sync 지연 (큰 파일/네트워크 느림). 5분 기다리거나 OneDrive 강제 sync. *git push한 코드는 git pull로 즉시 받기 가능*.
4. **"통합 문서1.xlsm 열어서 수동으로 한 줄 추가하면?"** → 🚨 conflict 위험. 데이터 백업하고 싶으면 *모달에서 export* 또는 SharePoint 웹에서 *읽기 전용 사본 다운로드*.

### Worker API 패턴
```
GET    /api/sheet/<slug>             → 시트 row 전체
POST   /api/sheet/<slug>             → row 추가 (body.values)
PATCH  /api/sheet/<slug>/<rowIndex>  → row 갱신
DELETE /api/sheet/<slug>/<rowIndex>  → row 제거
POST   /api/login                    → PIN 검증 → {ok, role}
POST   /api/records                  → records 시트 전용 (위 sheet/records와 별도)
```

### SHEET_MAP slug
- `applysettings` → `홍보접수설정`
- `records` → 신청 내역
- `programs` → 프로그램
- `platforms` → 플랫폼
- `contents` → 콘텐츠 형식
- `managers` → 담당자
- `special` → PromoSpecial (담당자 특별 일정)
- `logs` → 로그

## 3. 로컬 환경

- **회사 PC**: `C:\Users\황세웅\OneDrive - GS칼텍스 예울마루\DAX\Sewoong Hwang\yeulmaru-promo`
- **집 PC**: `C:\Users\Hwang\OneDrive - GS칼텍스 예울마루\DAX\Sewoong Hwang\yeulmaru-promo`
- **회사/집 동일 환경** — `$env:USERNAME` 자동 감지

### PowerShell 단축어
```powershell
클코프로모  # cd 프로젝트 + claude --dangerously-skip-permissions --remote-control
```

### Git 명령 (Windows)
```powershell
& "C:\Program Files\Git\bin\git.exe" -c user.name=yeulmaru -c user.email=yeulmarulicense@gmail.com commit -m "..."
```
- 작업 전 의무: `git fetch origin && git status`
- 한글 commit msg는 OneDrive 외부 파일에 utf8 저장 후 `-F`로 전달

## 4. GitHub 인증

- **계정**: `yeulmarulicense@gmail.com`
- **Classic PAT**: 7일 단위 재사용 OK (repo scope, yeulmaru 레포 한정)
- **Fine-grained**: Contents Read and write 권한 명시 필수 (없으면 PUT 막힘)
- **토큰 발급 URL**: https://github.com/settings/tokens/new?scopes=repo
- **바이브코딩 용도** — 매 turn revoke 잔소리 X, 만료/노출/오용 시점에만

## 5. 데이터 모델

### `APPLY_SETTINGS` (홍보접수설정 시트, 키-값 row)
```js
{
  접수ON: boolean,
  접수월: ['2026-06', '2026-07'],   // 배열, 최대 2개
  자동_낮에만: true,                  // 17:00~22:00 차단
  자동_일요일: true,                  // 일·월 차단 (시트 키 호환)
  자동_휴무: false                    // 모든 담당자 종일 충돌 시 차단
}
```
- 접수월은 시트에 **다중 row 허용** (같은 키 '접수월'로 row 2개)
- 헬퍼: `getApplyMonths()` / `getApplyMonthRows()` 로 배열/단수 둘 다 정규화

### `APPLY_EXCLUSIONS` (제외 일정, 같은 시트의 '제외' 키 row들)
```js
[
  {rowIndex, date: '', start: '18:00', end: '09:00'},   // 공통 시간 (모든 날)
  {rowIndex, date: '2026-06-17', start: '09:00', end: '14:00'},  // 개별
  {rowIndex, date: '2026-06-20', start: '', end: ''}    // 일자 차단 (그 날 전체)
]
```
시트 row 값 포맷: `"YYYY-MM-DD|HH:MM|HH:MM"` (date|start|end). 빈 값은 빈 문자열.

### `records` (신청 내역)
컬럼 순서:  
NO, 입력시간(KST), 날짜, 연도, 월, 일, 요일, 플랫폼1, 플랫폼2, 콘텐츠구분, 프로그램, 담당부서, 콘텐츠제목, 콘텐츠형식, 콘텐츠내용, 게시담당자, 진행상태, 비고

### `PROMO_SPECIAL` (담당자 특별 일정)
```js
{
  _rowIndex, id, sheetNo,
  type: '휴무' | '출장' | '교육' | '회의' | '기타',
  label: string,            // 사용자 자유 입력
  start: 'YYYY-MM-DD',
  end: 'YYYY-MM-DD',
  time: 'HH:MM-HH:MM' | '',  // 빈값이면 종일
  person: string,            // 담당자
  author, kstStr
}
```

### `MANAGERS` / `PR_MANAGERS`
- `MANAGERS`: 전체 담당자 (휴직 X)
- `PR_MANAGERS = MANAGERS.filter(m => isFlagOn(m['홍보여부']))` — 홍보 담당자만

## 6. 인증 / 권한

### 로그인
- PIN 4자리 → Worker `/api/login` → `{ok, role: 'admin'|'user'}`
- `sessionStorage.pw`, `sessionStorage.role`
- 현재 **공유 PIN 방식** (모두 같은 PIN). 개별 user PIN 없음.

### 본인 식별
- `localStorage.myApplicant` (게시자명 string)
- 현재 자유 입력 — 검증 없음 (개선 여지)

## 7. 핵심 함수

### 검증 (`canApply*`)
- `canApplyOnDate(dateKey)`: 일자 — 접수ON, 접수월, 자동_일요일, 자동_휴무(`allManagersConflict`), APPLY_EXCLUSIONS 일자
- `canApplyAtTime(time)`: 공통 시간 — 자동_낮에만, APPLY_EXCLUSIONS 공통
- `canApplyOnDateTime(dateKey, time)`: **통합 검증** — 위 둘 + 개별 제외 + 모든 담당자 시간 충돌

> **시간 정책**: `start ≤ time < end` (end 시점은 신청 가능)

### 충돌
- `personHasConflict(person, date, time)`: boolean
- `personConflictInfo(person, date, time)`: `{type, label}` | null
- `allManagersConflict(date, time)`: PR_MANAGERS 전원 충돌 여부

### 헬퍼
- `getApplyMonths()` / `getApplyMonthRows()`: 접수월 배열 정규화

## 8. UI 흐름

### 위저드 — User 신청
```
openPromoWizard(prefillDate?)
  → Step 1: 프로그램 (판매종료 ≥ _pwData.date)
  → Step 2: 콘텐츠 제목
  → Step 3: 일자 + 시간  (canApplyOnDateTime 검증)
  → Step 4: sub-steps (플랫폼, 게시자, 메시지 등)
  → Step 5: 확인
  → submitPromoRequest  (마지막 안전망 canApplyOnDateTime)
```

### 위저드 — Admin 직접 등록
```
openAdminWizard(prefillDate?)
  → Step 1: 담당자
  → Step 2: 일자 + 시간  (canApplyOnDateTime 검증)
  → Step 3: 플랫폼
  → Step 4: 콘텐츠 제목
  → submitAdminEntry  (마지막 안전망 canApplyOnDateTime)
```

### 우클릭 라우팅

| 우클릭 위치 | user | admin |
|---|---|---|
| 빈 셀 (당월) | 홍보 신청 / 신청 불가 안내 | 새 콘텐츠 등록 / 담당자 일정 추가 |
| 빈 셀 (비당월 빗금) | "이번 달이 아닙니다" | 동일 |
| 콘텐츠 row — 남 신청 | 살구색 "수정 불가 / OOO 님이 신청" | 수정/복사/삭제 |
| 콘텐츠 row — 본인 + '신청 중' | 살구색 "신청 대기 중" + 수정/취소 | 수정/복사/삭제 |
| 콘텐츠 row — 본인 + 그 외 | 수정/취소 | 수정/복사/삭제 |
| 특별 일정 항목 | 옅은 하늘색 "📌 홍보 담당자 일정 / OOO · 회의" | 수정/삭제 |

### 모달 헤더 표준
- X 닫기 버튼: `top:14px; right:14px`
- 뒤로 (`<`) 버튼: `top:14px; right:54px` (X 옆), 32×32 동그라미, SVG chevron
- 인라인 텍스트 "뒤로" 버튼은 모두 제거됨

### Step 4 게시자 자동 fallback (user)
- PR_MANAGERS 중 충돌 있는 사람은 select option `disabled` + `(해당 일시 {type} 중)` 표시
- 차단된 담당자가 있고 사용 가능한 1명만 남으면 자동 선택 + 살구색 말풍선
- 사용자가 명시적으로 선택한 경우 말풍선 안 뜸

## 9. 자동 옵션 의미

| 옵션 | 동작 |
|---|---|
| **자동_낮에만** | 17:00 ~ 22:00 시간대 신청 차단 (라벨 "낮에만" = 저녁·심야 차단 의미) |
| **자동_일요일** | 일(0) + 월(1) 차단. 화-토만 가능. (시트 키는 호환 위해 자동_일요일 유지) |
| **자동_휴무** | 모든 PR_MANAGERS가 종일 일정(휴무/출장 등) 충돌일 때 해당 날 전체 차단 |

## 10. 개발 워크플로우

### A. claude.ai 채팅 (모바일/웹/데스크탑) — 빠른 patch
1. Python 패치 작성
2. GitHub API `PUT /repos/yeulmaru/yeulmaru-promo/contents/index.html` 으로 직접 push
3. base SHA matching → 새 commit 생성

### B. PC 동기화
```powershell
cd "C:\Users\$env:USERNAME\OneDrive - GS칼텍스 예울마루\DAX\Sewoong Hwang\yeulmaru-promo"
& "C:\Program Files\Git\bin\git.exe" pull origin main
```

### C. Claude Code (`클코프로모`) — 토큰 노출 X
- 로컬 git 직접 작업, credential은 Windows Credential Manager
- 큰 변경/장기 작업에 적합

---

## 🚧 추후 추가 예정 (캘린더 기능 완료 후)

### 1️⃣ 이메일 알림 (Microsoft Graph API `sendMail`) — **A안 확정**

**목적**: 신청 등록/확정/취소 시 신청자·admin에게 알림 메일 자동 발신

**발신 계정**: 회사 M365 라이선스 1개 (남는 라이선스 활용, 공용 발신 계정으로 운용)

**구현 방식**:
1. 기존 Azure AD 앱(Worker가 사용 중)에 **`Mail.Send` 권한 추가** (Application permission)
2. Tenant admin consent
3. Worker에 `/api/notify/mail` 엔드포인트 추가
4. Graph API 호출: `POST https://graph.microsoft.com/v1.0/users/{발신계정}/sendMail`
5. 페이로드: `{message: {subject, body, toRecipients: [...]}}`

**트리거 시점**:
- user 신청 등록 → 신청자 본인 + admin(들)
- admin 확정 → 신청자
- admin 거절/취소 → 신청자
- user 자체 취소 → admin

**이점**:
- 기존 인프라 그대로 (Worker + Azure AD)
- 새 비용 0
- 발신 한도: 분당 ~30건, 일 ~10,000건 (Graph API 기본 한도)

**구현 시 확인 사항**:
- 발신 계정 실제 이메일 주소 (도메인 포함)
- 권한 추가 시 admin consent 필요 여부
- 발신자명 / 서명 포맷

---

### 2️⃣ Teams 알림 (보너스, 이메일 다음 단계)

**현재 환경 (2026-05-25 기준)**:
- ⚠️ **Incoming Webhook (Office 365 Connectors)는 2026-04-30 deprecated** — 신규 사용 불가
- ✅ **Power Automate Workflows** — 새 표준
- ✅ **Graph API `chatMessage`** — 코드 베이스 통합

**구현 옵션**:

**A. Power Automate Workflows** (가장 단순)
- Teams 채널 → "..." → Workflows → "Send webhook alerts to a channel" 템플릿
- 발급된 HTTP 트리거 URL을 Worker에서 POST
- Adaptive Card JSON 페이로드
- 단점: 채널 단위, 개인 DM 어려움

**B. Graph API `chatMessage`** (강력)
- 동일 Azure AD 앱에 권한 추가:
  - 채널 메시지 → `ChannelMessage.Send` (Application)
  - 개인 DM → `Chat.ReadWrite.All` (Application은 제한, Delegated 필요할 수도)
- 코드: `POST /teams/{teamId}/channels/{channelId}/messages`
- 단점: 개인 DM의 Application permission 정책 변동 가능 (구현 시 재확인)

**C. Adaptive Card 양방향** (최종 형태)
- 알림 카드에 "확정 / 거절" 버튼
- admin이 Teams 안에서 바로 처리 → Bot Framework 또는 Workflow 응답 처리
- 구현 복잡, 다만 UX 최고

**추천 순서**: 1차 **A (Workflows)** → 필요시 2차 **B (chatMessage)** → 향후 **C**

---

### 3️⃣ 그 외 검토 후보
- **사용자별 PIN / 본인 식별 강화** (현재 공유 PIN + 자유 myApplicant)
- **신청 상태 변경 admin 워크플로우 (대량 처리, 일괄 확정 등)**
- **모바일 반응형 추가 점검**

---

## 변경 이력

### 2026-05-24 ~ 25 (세션 10~11)
| commit | 내용 |
|---|---|
| `7ff80fe` | 신청 불가 메시지 우선순위 + 사유별 표현 개선 |
| `14d3bed` | UX 4건 — `.dn` 간격, 비당월 우클릭, 알림 타이틀 숨김, 뒤로 아이콘 통일 |
| `91066b7` | 담당자별 일정 충돌 + 판매종료 기준 변경 |
| `ad8a50a` + `2a08b0c` | 접수월 복수 (최대 2개) — 데이터 모델 + 헬퍼 함수 마무리 |
| `0a2fb9a` | Step 3 시간 검증 통합 (낮에만/공통제외/개별제외 모두 차단) |
| `3578c76` | Step 4 게시자 — 충돌 type 표시 + 자동 fallback + 말풍선 |
| `d646eec` | 콘텐츠 우클릭 4가지 케이스 분기 (admin/남신청/본인신청중/본인기타) |
| `e235cb6` | admin 직접 등록 흐름(`validateAwStep` Step 2 + `submitAdminEntry`) 검증 누락 fix |
| `46f7098` | 담당자 일정 우클릭 user 안내 ("📌 홍보 담당자 일정") |

---

## 알아두면 좋은 패턴 / 트러블슈팅

### 시트 키-값 다중 row
- `홍보접수설정` 시트는 키-값 row 구조. 같은 키로 여러 row 가능 (예: 접수월 2개).
- POST → 새 row 추가, PATCH → 특정 row 갱신, DELETE → row 제거

### 셀 비당월 (nm)
- 흐릿 + 빗금 패턴, `cursor:default`
- 우클릭 시 `onCellContextMenu` 안에서 `event.currentTarget.classList.contains('nm')` 분기 처리

### "신청 중" 상태 — 띄어쓰기 주의
- 시트 값: 한국어 `'신청 중'` (가운데 띄어쓰기 포함)
- 모든 비교 코드가 이 형식 사용. 띄어쓰기 빠지면 매칭 실패.
- 신규 신청 기본값 = `'신청 중'`. admin 확정 시 `'확정'` 등으로 변경.

### Cloudflare Worker 변경 시
- `wrangler deploy` 또는 Cloudflare dashboard에서 배포
- `SHEET_MAP` 변경 시 frontend slug와 정합성 확인

### GitHub Pages 캐시
- push 후 1~2분 대기 (Pages 빌드/배포)
- 강제 새로고침: `Ctrl + Shift + R` (또는 시크릿창)
- 캐시 이상 시 사용자에게 안내 필요

### Untracked 로컬 파일 (현재 로컬에만 있는 것)
- `README.md`, `_CLAUDE.md.local`, `index.js`, `index2.html`, `통합 문서1.xlsm`
- git에 포함 안 됨 (의도된 분리). 동기화에 영향 X.
