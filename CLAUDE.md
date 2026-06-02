# yeulmaru-promo — CLAUDE.md (인계 문서)

> **예울마루 홍보 계획표 웹앱.** GS칼텍스 예울마루 직원이 홍보 콘텐츠 신청·관리하는 단일파일 웹앱. 엑셀+VBA 매크로 대체.
> **Last updated**: 2026-06-03 (KST) · **현재 HEAD**: `4d0f9ad`
>
> 이 파일은 **매 세션 새 Claude에게 넘기는 인계서**다. 여기 적힌 건 "이미 정해진 사실"이니 다시 캐묻거나 추측으로 뒤집지 말 것. 코드 세부(컬럼순서·함수 시그니처)는 `index.html`을 직접 검색. 과거 전체 이력은 `docs/CLAUDE_full_backup_260601.md`.

---

## ⚡ 먼저 읽어라 — 작업 태도 & 도구 선택 (이거 안 지켜서 매번 시간 날림)

### 작업 태도 (애자일)
- **혼자 맴돌지 마라.** 같은 시도 2번 실패하면 즉시 멈추고 사용자에게 물어라. 환경/경로/계정 정보는 사용자가 1초면 알려준다 — 4번씩 헛돌지 말 것.
- **추측 패치 금지.** 브라우저 콘솔은 너(Claude)가 못 본다. 원인 모르면 **진단 로그 박고 → 사용자가 시크릿창 캡처 → 원인 확정 → 수정**. (이게 이 프로젝트 제1원칙)
- **커밋 작게, 한 변경마다 즉시 배포·테스트.** "전부 새로 설계하자" 충동이 와도, 원인만 특정되면 대개 10줄 안쪽으로 끝난다.
- **작업 전 `git fetch + status` 의무.** 어느 커밋 위에 있는지부터 확인.

### 🛠️ 도구 선택 — 작업 시작 전 사용자에게 먼저 물어라
**"이 작업, Desktop Commander(DC)로 할까요, 아니면 클코(Claude Code)로 할까요?"**
- **DC는 느리다** (한 줄씩 깨작, 큰 파일 freeze 위험). 간단 확인·소규모 수정엔 OK.
- **실제 코드 작업은 클코(Claude Code) 권장** — 로컬 git 직접, 빠르고 토큰 노출 없음. 큰 변경/연속 작업이면 무조건 클코.
- 기본 제안: "코드 수정이면 클코프로모로 붙는 게 빠릅니다. 띄워주시면 명령 드릴게요."

### 💻 PC 환경 — 오해하지 말 것
- **두 PC 모두 세웅 개인 소유** (집/회사). 보안·권한 걱정 없이 **DC 켜고 작업해도 된다. 권한 FULL.** 머뭇거리지 말 것.
- 집 PC = 사용자명 `Hwang`, 회사 PC = `황세웅`. **`C:\Users\{사용자명}\` 뒤 `OneDrive - GS칼텍스 예울마루\DAX\Sewoong Hwang\yeulmaru-promo`는 완전히 동일** (SharePoint Document Library 동기화 — **DAX 이후 경로·내용 100% 같음**). 그래서 `$env:USERNAME`로 자동 감지하면 양 PC에서 같은 코드가 돈다.
- 기본 셸 = **PowerShell 5.1**. 한글 경로.

---

## 🔧 환경 제약 & 검증된 명령 패턴 (그대로 복붙)

### 🚫 하지 말 것 (전부 실제로 당한 함정)
- **cmd에서 `cd /d "한글경로"`** → 코드페이지 949 한글 깨짐 → "디렉터리 이름이 잘못되었습니다" → git이 엉뚱한 데서 돌아 `not a git repository`. → **cmd 말고 PowerShell.**
- **cmd `&&` 체이닝 + 한글경로** → 첫 명령에서 깨지면 뒤 전부 무산. (260601 재확인)
- **PowerShell `& $git ...` 직접 호출** → stdout이 통째로 안 잡혀 빈 출력. (260601 재확인 — fetch/status/log가 빈 줄로만 나옴) → **반드시 아래 Start-Process + 파일 리다이렉트 패턴.**
- **PowerShell `& $git ... | Out-String`** (네이티브 exe 파이프) → `CantActivateDocumentInPipeline`, stdout 통째로 안 잡힘.
- **`git`/`python`/`node`를 PATH로 호출** → 세션 따라 안 잡힘. **항상 풀패스.**
- **GitHub Pages 브라우저 캐시** → push가 라이브 서버엔 반영돼도 **브라우저가 옛 index.html을 캐시**해 새 코드가 안 보임(이번 세션 반복 발생). 확인 시 **`?cb=고유값` 쿼리로 캐시버스트 navigate** 하거나 사용자에게 `Ctrl+Shift+R` 요청. 쿼리 붙여도 path 동일이라 MSAL/세션 정상.
- **배포 검증 패턴(추측 금지)**: push 후 `Invoke-WebRequest "https://yeulmaru.github.io/yeulmaru-promo/index.html?cb=$(Get-Random)"` 로 **새 코드 마커 문자열을 폴링**(보통 60~160초에 반영). 라이브 확인 후 캐시버스트 navigate로 화면 검증.
- **sessionStorage는 창/탭별** → 새 창=재로그인. **Claude in Chrome 중 다른 브라우저(브레이브 등) 띄우면 기존 연결 끊김** → 단일 창 유지.

### ✅ git (풀패스 + Start-Process + 파일 리다이렉트)
```powershell
$git="C:\Program Files\Git\bin\git.exe"
$repo="C:\Users\$env:USERNAME\OneDrive - GS칼텍스 예울마루\DAX\Sewoong Hwang\yeulmaru-promo"
$o="$env:TEMP\g_o.txt"; $e="$env:TEMP\g_e.txt"
function G([string[]]$x){ Start-Process -FilePath $git -ArgumentList $x -WorkingDirectory $repo -NoNewWindow -Wait -RedirectStandardOutput $o -RedirectStandardError $e; $oc=Get-Content $o -Raw -EA SilentlyContinue; $er=Get-Content $e -Raw -EA SilentlyContinue; if($oc){Write-Output $oc}; if($er){Write-Output ("[err] "+$er)} }
G @('fetch','origin'); G @('status','--short','-b'); G @('log','--oneline','-3')
```
- push 진행상황·`LF will be replaced by CRLF` 경고는 `[err]`(stderr)로 나와도 정상. 한글 commit은 ASCII 파일에 저장 후 `-F`:
```powershell
Set-Content "$env:TEMP\cmsg.txt" -Value "fix: ..." -Encoding ASCII -NoNewline
G @('-c','user.name=yeulmaru','-c','user.email=yeulmarulicense@gmail.com','commit','-F',"$env:TEMP\cmsg.txt")
G @('push','origin','main')
```

### ✅ index.html 수정 (한글·대용량 무손상, BOM 없이, CRLF 유지)
```powershell
$p="$repo\index.html"
$c=[IO.File]::ReadAllText($p,[Text.Encoding]::UTF8)
$cnt=([regex]::Matches($c,[regex]::Escape($old))).Count   # 반드시 1 확인, 아니면 ABORT
$c=$c.Replace($old,$new)
[IO.File]::WriteAllText($p,$c,(New-Object Text.UTF8Encoding $false))
```
- 큰 교체 전 `Copy-Item $p "$p.bak_YYMMDD"`. 개행 CRLF(``r`n``). **검증 끝나면 bak 파일 정리** — git 이력으로 복원 가능하므로 쌓아둘 필요 없음.

### ✅ JS 문법 체크 (커밋 전 — 깨지면 페이지 전체 사망)
```powershell
$node="C:\Program Files\nodejs\node.exe"
$ms=[regex]::Matches($c,'(?s)<script>(.*?)</script>'); $main=$null
foreach($m in $ms){ if($m.Groups[1].Value.Contains('goToPinStep')){ $main=$m.Groups[1].Value; break } }
[IO.File]::WriteAllText("$env:TEMP\chk.js",$main,(New-Object Text.UTF8Encoding $false))
Start-Process -FilePath $node -ArgumentList @('--check',"$env:TEMP\chk.js") -NoNewWindow -Wait -RedirectStandardOutput $o -RedirectStandardError $e
Get-Content $e -Raw   # 비어있으면 OK
```

---

## 🚀 Claude Code (클코) — 등록 & 사용법 (코드 작업은 이걸로)

### 띄우는 법 (풀 명령)
```powershell
cd "C:\Users\$env:USERNAME\OneDrive - GS칼텍스 예울마루\DAX\Sewoong Hwang\yeulmaru-promo"; claude --dangerously-skip-permissions --remote-control
```

### PowerShell 프로필에 단축어 등록 (1회만)
프로필 열기: `notepad $PROFILE` (없으면 `New-Item -ItemType File -Path $PROFILE -Force` 후 열기). 아래 함수 추가:
```powershell
function 클코프로모 {
  cd "C:\Users\$env:USERNAME\OneDrive - GS칼텍스 예울마루\DAX\Sewoong Hwang\yeulmaru-promo"
  claude --dangerously-skip-permissions --remote-control
}
```
저장 후 `. $PROFILE`로 리로드 → 이후 터미널에서 `클코프로모`만 치면 실행.

### 다른 프로젝트 클코 단축어 (참고 — 같은 패턴, 경로만 다름)
`클코대시`(yeulmaru-dash) / `클코노뮤트` / `클코스크랩` / `클코캘린더`(yeulmaru-calandar-2026) / `클코프로모`(이 프로젝트). 경로는 전부 `$env:USERNAME` 자동 감지.

### 클코에게 일 시키는 법
- 사용자가 클코를 띄우면, Claude는 **클코에 그대로 붙여넣을 자연어 명령**을 코드블록으로 만들어 준다.
- 명령에 항상 포함: ① 무엇을·왜 ② "다른 기능 건드리지 마" 범위 제한 ③ git 풀패스/author ④ "작업 전 git fetch+status, 추측 금지 콘솔 먼저" ⑤ 커밋 메시지 명확히.

---

## 🔑 Git · Worker · 계정 · 토큰 (★ 가장 중요)

### GitHub
- **레포**: `yeulmaru/yeulmaru-promo` (Public) · **사이트**: https://yeulmaru.github.io/yeulmaru-promo/ (push 후 1~2분 빌드)
- **계정**: `yeulmarulicense@gmail.com`
- **git author**: `user.name=yeulmaru`, `user.email=yeulmarulicense@gmail.com`
- **PAT(토큰)**: Classic PAT(repo scope) 7일 단위 재사용 OK. Fine-grained는 **Contents: Read and write** 권한 명시 필수(없으면 PUT 막힘). 발급: https://github.com/settings/tokens/new?scopes=repo
- ⚠️ **토큰 값을 메모리/파일에 저장하지 마라.** 매 턴 revoke 잔소리도 금지 — 만료 임박·노출·오용·사용자 요청 시에만 언급.
- 클코는 Windows Credential Manager 사용(토큰 노출 X). GitHub API PUT 방식은 토큰을 직접 넘김(모바일/웹 패치용).

### Cloudflare Worker (백엔드 프록시)
- **역할**: 클라이언트 ↔ Graph API 사이 프록시. PIN 검증, 시트 CRUD, 관리자 인증, cron(보류 자동취소).
- **소스**: `src/index.js` (레포 안) + 루트 `wrangler.toml`. 배포 백업: `docs/260526_yeulmaru_promo_worker_patched_v2_214830.js`.
- **배포**: Cloudflare 대시보드 Quick Edit 또는 `wrangler deploy`. **git과 무관** — Worker 코드 고쳐도 GitHub push로 반영 안 됨, 반대도 마찬가지.
- **주요 엔드포인트**:
  - `GET/POST/PATCH/DELETE /api/sheet/<slug>` — 시트 row CRUD (body.values / rowIndex)
  - `POST /api/auth/set-pin`·`reset-pin`·`set-password` — PIN/비번 설정 (※ `/api/auth/super`는 260601 제거됨)
  - `POST /api/records` — 신청내역 전용
  - `GET /api/lastmod` — 파일 mtime/eTag (C-1 변경감지 폴링용)
  - `GET/POST/PATCH /api/messages` — 메시지함 알림 (없으면 '메시지' 시트 자동생성, 셀 텍스트서식)
- **인증 헤더**: 서브admin `X-Sub-Admin-PIN` + `관리자여부=true` (`checkAdmin` + 5분 매니저 캐시). ⚠️ 슈퍼admin(0511)·`/api/auth/super` 폐기 — 권한은 시트 `관리자여부`로만 결정.
- **cron**: `autoCancelStalePending` — 보류 3일 자동취소 (`scheduled` 핸들러)

### Azure AD (Graph API 인증 — Worker가 SharePoint 접근)
- service account 앱이 Graph API 토큰 흐름으로 SharePoint Excel 읽기/쓰기.
- **MSAL(프론트, MS 로그인)**: clientId `9f3a0105-aa86-4a8b-bad0-bd651688d854`, **SPA 플랫폼**, redirectUri `https://yeulmaru.github.io/yeulmaru-promo/` (**trailing slash 필수**, Web 플랫폼 아님 — CORS). CDN 2.35.0 + fallback. Brave Shields ON이면 popup `user_cancelled` → Shields OFF.

---

## 🏗️ 시스템 설계 — 데이터가 어떻게 흐르는가

```
[브라우저] index.html (Vanilla JS 단일파일 ~7,100줄, GitHub Pages)
    │  fetch (X-App-Password / X-Sub-Admin-PIN 헤더)
    ▼
[Cloudflare Worker] src/index.js  (프록시 + 인증 + cron)
    │  Microsoft Graph API (Azure AD service account 토큰)
    ▼
[SharePoint Excel] "통합 문서1.xlsm" = 데이터 마스터 (시트별 slug 매핑)
```

### 🚨 두 갈래 흐름 — 섞으면 데이터 손상 (필독)
| 무엇을 바꾸나 | 어디서 | 경로 | 속도 |
|---|---|---|---|
| **시트 데이터**(PIN/홍보기록/일정/설정) | **모달에서만** | Worker→Graph→SharePoint 마스터 | 1~3초 |
| index.html / CSS / JS | 에디터+git push | GitHub→Pages | 1~2분 |
| Worker 코드 | Cloudflare Quick Edit/wrangler | (git 무관) | 즉시 |
| CLAUDE.md / docs | 에디터+git push | GitHub (동작영향 X) | - |

- **모달 데이터 변경은 OneDrive를 안 거친다.** Worker가 Graph API로 마스터 xlsm을 직접 수정. OneDrive sync는 로컬 복사본을 뒤늦게 따라오게 할 뿐.
- 🚫 **로컬 `통합 문서1.xlsm` 직접 편집 절대 금지.** OneDrive가 SharePoint에 push 시도 → Worker 수정과 충돌 → conflict copy + 손상. `.gitignore`로 `*.xlsm` 차단됨. **데이터 구조 참고용 read-only로만** 열 것.

### SHEET_MAP slug → 시트
`applysettings`(홍보접수설정) · `records`(신청내역) · `programs`(프로그램) · `platforms`(플랫폼) · `contents`(콘텐츠형식) · `managers`(담당자) · `special`(PromoSpecial 담당자 특별일정) · `logs`(로그)

---

## 🔐 인증 모델

- 담당자 시트 **개별 4자리 PIN**으로 로그인. **MSAL로 MS 신원 확인 + PIN 둘 다** 통과해야 입장.
- ⚠️ **슈퍼admin(0511)·앱 내 권한전환은 260601 전면 폐기** (`12f4746`/`d5d4115`). 권한은 **담당자 시트 `관리자여부`로 고정**, 앱 안에서 일반↔관리자 전환 불가. 삭제·관리자컬럼 편집 = admin 전체 허용(`_canDelete`/`userRole==='admin'`). `isSuperAdmin`/`_verifySuperForDelete`/`switchRole`/`/api/auth/super` 제거됨.
- **admin(서브admin = 최고권한)**: 담당자 PIN + `관리자여부=true` → `role=admin` + `sessionStorage.subAdminPin` (Worker `X-Sub-Admin-PIN`).
- **일반 user**: 담당자 PIN + `관리자여부=false`.
- **신원·세션 전부 `sessionStorage`** (`role/pw/subAdminPin/myApplicant/myUserDept`). localStorage 쓰면 탭간 신원 오염. 페이지 로드 시 localStorage 잔재 청소.
- ⚠️ **MSAL loginPopup 직후 같은 페이지 화면전환 = COOP가 깨뜨림.** → loginPopup 성공 시 `localStorage._resumePin=email` 저장 후 `location.reload()` → 새 페이지에서 PIN칸 재개. (세션20에서 확립)
- ⚠️ 관리자목록(`loadManagers`) 로드용으로 `password='0510'` 임시로 박은 뒤 **반드시 `password=''` 복구** (안 하면 PIN 우회 백도어). 로그아웃/취소 시 `_fullLogout()` 필수.

---

## 📅 화면 구성 & 기능 연결 (캘린더 중심으로 무엇이 어디에 붙어있나)

### 메인 = 월간 캘린더 그리드
- 로그인 통과 → `initApp()` → 캘린더 렌더. 헤더(월 네비) + 요일 헤더 + **날짜 셀 그리드**가 본문.
- 각 날짜 셀에 그날의 **신청 콘텐츠 row**(records)와 **담당자 특별일정**(special)이 뱃지로 표시됨.
- ⚠️ 증상 디버깅 힌트: "헤더·월네비·요일은 멀쩡한데 날짜 셀 본문만 안 그려짐" = 캘린더 그리드 빌드 함수가 중간에 죽은 것(보통 데이터 로드 실패 or JS 에러). 로그인 흐름이 렌더를 못 부르고 끊긴 경우도 있음 → 콘솔 에러부터 확인.

### 셀 상호작용
- **좌클릭**: 빈 셀 → 신청/등록 위저드. 콘텐츠 row/특별일정 → 조회·수정 모달.
- **우클릭**: role(user/admin) × 대상(빈셀/남신청/본인신청/특별일정)별로 컨텍스트 메뉴 분기.
- 신청자(S) 기준으로 본인/남 판별 = `_isMineRec(rec, myAppl)`. (※ 게시담당자 P 아님 — 아래 함정)

### 변경 모달 (`_renderChangeMenu`) — 콘텐츠 row 좌클릭 시
- 변경할 항목(프로그램/제목/일자·시간/플랫폼/비고/[admin]진행상태) 체크박스 + 하단 버튼 2개.
- **하단 버튼** (260601 추가): 좌측 **[신청 취소]**(빨강 `#e5484d`, 본인 신청 `_isMineRec` + 진행상태가 완료/취소 아닐 때만 조건부 노출 → `cancelPromoRequest(rowIndex)`) + 우측 **[선택한 항목 변경 →]**(`_startChangeWizard(rowIndex)`).
- admin이 「신청 중」 상태 변경 시 자동 승인 안내 배너 표시.

### 위저드 (신청/등록)
- **User 신청**: `openPromoWizard()` → 프로그램 → 콘텐츠제목 → 일자+시간(`canApplyOnDateTime` 검증) → 플랫폼/게시자 → 확인 → `submitPromoRequest`.
- **Admin 직접등록**: `openAdminWizard()` → 담당자 → 일자+시간 → 플랫폼 → 제목 → `submitAdminEntry`.
- 검증 함수: `canApplyOnDate`(접수ON/접수월/일요일/휴무/제외일자), `canApplyAtTime`(낮에만/공통제외), `canApplyOnDateTime`(통합, 담당자 시간충돌까지). 시간정책 `start ≤ time < end`.

### 사이드바 / 보조 모달
- 오른쪽 **사이드바**: 프로그램 목록. 좌클릭 → 조회모달(`openProgramView`), 우클릭 → 홍보현황(`openPromoBoardForProgram`).
- **플랫폼 현황** 트리뷰 풀스크린: `openPlatformBoard` (오프라인 4그룹/온라인 5채널, `PLATFORM_TREE` const).
- **메시지함/알림**: 신청 상태변경(승인/보류/취소/완료/반려) 시 `pushMessage`로 **신청자(S)**에게 알림. 클릭→상세모달(`openScheduleRow`). 읽음처리 `markMsgRead`.

### 🚨 신청자(S) ≠ 게시담당자(P) — 자주 헷갈리는 함정
`records` 시트: **S열=신청자**(실제 신청 본인 = `sessionStorage.myApplicant`), **P열=게시담당자**(지정값, `상관 없음` 또는 특정인).
- UI 표시·메시지 수신자·"내 신청" 필터 **전부 신청자(S) 기준.** P로 표시하면 "상관없음 님이 신청…" 버그 재발.

### 자동 접수 옵션 (홍보접수설정 시트)
- `자동_낮에만`: 17:00~22:00 차단 / `자동_일요일`: 일·월 차단(화~토만) / `자동_휴무`: PR_MANAGERS 전원 종일충돌 시 그날 차단.
- `MANAGERS`=전체 담당자, `PR_MANAGERS`=홍보여부 ON만(`isFlagOn`).

---

## ✅ 현재 상태 (2026-06-03, HEAD `4d0f9ad`)

### 🆕 세션 (2026-06-03) — 성과분석 차트 + 수익성 인덱싱 + UI/UX (전부 라이브 배포·검증)
- **⚠️ 유휴 자동잠금 현재 OFF** — `index.html`의 `var _idleLockDisabled=true` (IDLE_MS 선언 줄, ~1781). 작업 편의용 임시. **점검 끝나면 `false`로 원복**(또는 플래그 줄 제거). `resetIdleTimer`에 `if(_idleLockDisabled)return` 가드 있음. 잠금 메시지는 `IDLE_MS`에서 분 자동 산출(하드코딩 30분 제거됨).
- **DB/데이터 모델 (판매·사업 현황 — dash 동기화, 읽기전용)**:
  - **판매현황**(`openSalesBoard`/`_salesBuild`): `/api/ops?sheet=` 로 **일일입력**(공연명·기준일자`YYYYMMDD`·합계좌석·합계금액·점유율·전일대비) + **공연마스터**(사업명·ID·기준석·총회차·총오픈석·목표점유율·수익성·티켓오픈일·시작일·종료일·상태) + **회차상세**(ID·공연일). daily↔master **`공연명==사업명` 문자열 조인**. 마스터 7행뿐(2026 판매중).
  - **사업현황**(`openBusinessBoard`/`_bizClean`): 시트 **`세부운영관리대장(정리)`**(공연명·사업구분·**공연구분(기획/대관)**·장르1·티켓구분·기본좌석·발권유료·년도·월·일·상태) ~1454행/1270공연.
  - **핵심 개념**: **대관=장소만 대여(예울마루 직접판매 X, 분석 대상 아님)**, **기획=직접 기획·판매(분석 대상)**. 분석/차트는 `공연구분=기획`만. 사업현황 기획/대관 체크박스 기본=기획.
- **수익성(공공성/상업성) = 별개 인덱싱 축**:
  - **기획 + 2023년 이후 + (공연/전시/예술교육)** 에만 유효. 2023이전·대관·교육(특강/포럼 등)은 분류 대상 아님(교육은 일단 대관 취급).
  - **데이터에 미저장 → 런타임 분류기 `_profitType(name,genre)`** (규칙) + **`운영_수익성` 시트 override**(공연명,수익성 — 아직 미생성=전부 규칙). 규칙: 상업=브런치·어린이·가족·크리스마스·호두까기·설민석·청소년·연극 / 공공=리사이틀·신년음악회·오페라·플라멩코·실내악·페스티발·교향·심포니·오케스트라·국립·창작·백건우·모차르트·클래식 / 장르 fallback(클래식→공공, 어린이가족·대중·뮤지컬→상업, 발레연극→공공). 예울마루 위크=무료(분류 제외). 미분류 1건=연희단팔산대〈무풍〉→공공.
  - `_salesBuild`는 마스터 수익성 결측 시 `_profitType`로 폴백(판매현황 KPI 상업/공공 0.0% 버그 수정됨).
- **추가된 성과분석 차트(Plotly basic 2.27 lazy-load `_bizEnsurePlotly`; box trace 없음→scatter strip으로 구현)**:
  - 판매현황 **[4] 페이싱 곡선**(`_salesDrawPacing`, D-day 정규화 누적점유율) · **[5] 점유율×객단가 4분면**(`_salesDrawYield`, 버블=매출, 중앙값 점선).
  - 사업현황 **장르 벤치마크**(`_bizDrawGenreBench`, 장르별 strip+◆평균+⭐선택연도).
  - **통합 필터 칩 바**(`_chipRow`): 수익성[전체/공공/상업]·**회차**[1/2~4/5+]·**진행일**[단일/2~3/4+] (구간 칩). 회차=공연건수, 진행일=공연일 distinct 일수.
  - **[N] 섹션 아코디언**(`_accordionize('sales-body'|'biz-body')`, DOM 후처리, 헤더 클릭 토글, 기본 펼침).
- **남은 백로그(미완)**: ① 일정관리 테이블 "콘텐츠" 컬럼 세로 깨짐/과절단(`_sh('content',…)` ~5414, 자동폭 시스템) · ② "신청 중" 카운트 정의 불일치(요약 `myPending` ~5273 raw비교 vs `statusToPrimary` ~4782 보류흡수 — **보류 포함 여부 제품 결정 필요**) · ③ 차트 단위(%,원) 축·범례에 작고 연하게 · ④ 필터칩 바를 ★3/사업 월별차트에도 확장 · 신규차트 후보(Bullet/워터폴, 홍보↔판매 연결[records+일일입력], 월×장르 히트맵) · ★1 페이싱 "정상 페이스 밴드"는 과거 마스터 데이터 필요.
- **차트형 원칙(사용자 요구)**: 가로로 긴 분포는 막대 X → strip/dot. 단위는 인덱싱(축)에 작고 연하게. 모든 인덱싱은 클릭 필터 가능하게(칩). 애매하면 묻고, 무응답이면 진행.


- **세션20 완료**: 로그인 무한루프 + PIN 우회 백도어 대수술 끝. 안정.
  - 버그A(PIN칸 무한): TDZ(`MANAGERS`)→setTimeout, COOP→reload 방식, `backToAccountStep`이 `initLoginScreen()` 재렌더.
  - 버그B(PIN 우회): 전역 `password='0510'` 잔존 → `_fullLogout()` + loadManagers 후 복구.
- **260601 작업분** (커밋 순서):
  - `c97f614` 0511 백도어 제거(로그인 PIN칸 + role-switch 에스컬레이션)
  - `8bf17c3` 중복 PIN 허용(dup-check 제거) + 시트/프로그램 폼 모달 z-index 상향
  - `9ae917f` user-register 폼 개편(부서/직위 드롭다운, 가로 duty 체크박스, PIN/pw/active 숨김) + 콘텐츠-admin 메뉴 제거
  - `3c70982` row 삭제 슈퍼admin 전용화(버튼 비활성 + 삭제 시 슈퍼 패스워드 요구)
  - `b6df0b1` 유휴 자동잠금 1min→10min
  - **`15a5625` 변경 모달 하단에 [신청 취소] 버튼 추가** (빨강, 본인 신청, 비종결 상태 조건부)
- **260601 후속 (F5수정 + 큐 A·B·C, 전부 배포됨)**:
  - `33cec19` **F5 false-lock 수정** — `IDLE_MS`를 세션복원 IIFE 위로 호이스팅(reload 시 undefined IDLE_MS로 `setTimeout(lockScreen)=0ms` 즉시잠금 버그). 라이브 PASS.
  - `8a81302` **[A]** 리스트 액션 → 단일 [변경] 메뉴 통일(클릭→`onEvContextMenu`, admin 인라인 승인/완료는 메뉴로 흡수), **예정 상태 user 변경·취소 차단**(admin만).
  - `61ee570` **/api/lastmod** Worker 엔드포인트.
  - `12f4746`+`d5d4115` **[B]** 0511 슈퍼admin + 권한전환 전면 제거, 삭제권한 admin 재배치, Worker `/api/auth/super` 제거.
  - `3a062ad` **[C-1]** 변경감지 폴링 뱃지(45초 `/api/lastmod`, 수동 새로고침, 자동리로드 X, `loadData`에 baseline 훅).
  - `59bfb9e`+`d771131` **[C-2]** 서버 기반 메시지함 — Worker `/api/messages`(GET/POST/PATCH, '메시지' 시트 자동생성·텍스트서식), 프론트 알림 **S(신청자) 엄격**(`||게시담당자` 폴백 제거) + 재신청 시 관리자 전원 알림. (이전 localStorage-only → 크로스유저 전달)
- **메시지함 구조**: 알림은 이제 **'메시지' 시트(서버)** 저장. 컬럼 `ID·수신자·종류·트리거·이전·이후·사유·참조번호·참조요약·KST·읽음`, 수신자=**신청자(S) 이름**. ⚠️ 메시지 DELETE API 없음. 시트에 `ZZTEST` 테스트 row 2개 잔존(무해, 수동삭제 가능).
- **남은 정리거리**(기능 무해): 진단로그 떨거지(`[IIFE]/[zombie-check]/[pinFix]/[fullLogout]` 등), `_pinGuard` MutationObserver/`_pinActive` 가드, **죽은 코드**(`_promptSuperSecret` 모달, IIFE의 `0511` 분기 — F5 핵심 IIFE라 보존). → **로그 한 줄씩 빼고 시크릿창 테스트** 원칙.
- **Q-3 (캘린더 그리드 프로그램 좌클릭 → 조회모달)**: 사이드바는 `openProgramView` 매핑됨, 그리드 내 프로그램 표시요소 좌클릭 미연결이 인계 포인트.
- **잔여 기획**: 이메일 알림(Graph `sendMail`, **A안 확정** — `Mail.Send` + `/api/notify/mail`) → Teams 알림(Power Automate) → 조회모달 Y/Z/AA 표시분리.

---

## 📎 더 깊은 정보

- **컬럼 순서/함수 시그니처/UI 흐름 상세** → `index.html` 직접 검색 (여기 박으면 코드와 어긋남).
- **과거 변경이력 전체(세션 10~20)** → `docs/CLAUDE_full_backup_260601.md`
- **세션별 인계/audit** → `docs/260529_yeulmaru-promo_handoff_064500.md`, `docs/260526_session15_audit_180000.md`
- **Worker 배포 백업** → `docs/260526_yeulmaru_promo_worker_patched_v2_214830.js`
- **외부 API**: Naver Maps(NCP **VPC>Maps**, Client ID `12kxk8z3z0`, 월100만 무료). ⚠️ `AI·NAVER API` 쪽 동명 앱(`sgzrzp8ucm`)은 Maps 호출 시 429 — 안 씀.
