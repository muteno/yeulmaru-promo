# 예울마루 홍보 계획표 (yeulmaru-promo)

## 프로젝트 개요
GS칼텍스 예울마루(GS칼텍스재단) 홍보 계획표 웹앱. 엑셀 매크로(VBA)에서 웹으로 전환한 프로젝트.
공연/전시 일정 + 홍보 콘텐츠 캘린더를 한 화면에서 관리.

## 아키텍처
```
GitHub Pages (index.html)
  → 4자리 PIN 인증
  → Cloudflare Worker (API 프록시)
  → Azure AD Client Credentials
  → Graph API
  → SharePoint 엑셀 (통합 문서1.xlsm)
```

## 리소스
| 항목 | 값 |
|---|---|
| GitHub 레포 | `yeulmaru/yeulmaru-promo` |
| 배포 URL | `https://yeulmaru.github.io/yeulmaru-promo/` |
| Worker URL | `https://yeulmaru-promo-api.yeulmarumaster.workers.dev` |
| Worker PIN | `<<PIN>>` |
| GitHub 토큰 (muteno, 8/12 만료) | `<<GITHUB_TOKEN>>` |
| Azure 클라이언트 ID | `<<AZURE_CLIENT_ID>>` |
| Azure 테넌트 ID | `<<AZURE_TENANT_ID>>` |
| SharePoint 사이트 | `gscaltexyeulmaru.sharepoint.com/sites/daxteam` |
| 연간 캘린더 | `https://yeulmaru.github.io/yeulmaru-calandar-2026/` |

## 배포 워크플로우
Claude가 GitHub API로 직접 커밋:
```bash
SHA=$(curl -s -H "Authorization: token $TOKEN" \
  "https://api.github.com/repos/yeulmaru/yeulmaru-promo/contents/index.html" \
  | python3 -c "import json,sys;print(json.load(sys.stdin)['sha'])")
CONTENT=$(base64 -w0 파일명.html)
curl -s -X PUT -H "Authorization: token $TOKEN" \
  "https://api.github.com/repos/yeulmaru/yeulmaru-promo/contents/index.html" \
  -d "{\"message\":\"커밋메시지\",\"content\":\"$CONTENT\",\"sha\":\"$SHA\"}"
```

---

## 디자인 시스템

### 색상 팔레트

#### 기본 색상
| 변수 | 값 | 용도 |
|---|---|---|
| `--accent` | `#4A4DE7` | 강조색 (블루-퍼플). 오늘 일자, 선택, 버튼, 네비 pill, 공연 뱃지 |
| `--accent-light` | `#E8E8FD` | 강조색 밝은 버전 |
| `--accent-glow` | `rgba(74,77,231,0.15)` | 포커스 글로우 |
| `--peach` | `#F0C4B8` | 살구색. 전시 ON 표시, 사이드패널 전시 배경 |
| `--peach-light` | `#FBF0EC` | 살구 밝은 버전 |
| `--text` | `#1A1A2E` | 기본 텍스트 |
| `--dim` | `#888` | 보조 텍스트 |
| `--muted` | `#bbb` | 비활성 텍스트 |
| `--past-text` | `#aaa` | 지난 일 텍스트 |
| `--green` | `#1A6B3C` | YEULMARU 로고용 (미사용, 현재 accent로 변경됨) |

#### 배경
| 변수 | 값 | 용도 |
|---|---|---|
| `--bg` | `linear-gradient(135deg, #FDF6F3 0%, #F0EBF5 50%, #EBF0F8 100%)` | 전체 배경 (살구→라벤더→스카이) |
| `--surface` | `rgba(255,255,255,0.72)` | 반투명 표면 |
| `--glass` | `rgba(255,255,255,0.55)` | 글래스모피즘 배경 |
| `--glass-border` | `rgba(255,255,255,0.6)` | 글래스 테두리 |
| `--glass-shadow` | `0 8px 32px rgba(74,77,231,0.08), 0 2px 8px rgba(0,0,0,0.04)` | 글래스 그림자 |
| `--past-bg` | `rgba(0,0,0,0.02)` | 지난 일 셀 배경 |
| `--nm-bg` | `rgba(0,0,0,0.03)` | 비당월 셀 배경 |
| `--today-bg` | `rgba(74,77,231,0.06)` | 오늘 셀 배경 |
| `--border` | `rgba(0,0,0,0.09)` | 셀 구분선 |
| `--border2` | `rgba(0,0,0,0.12)` | 강한 구분선 |

#### 플랫폼 색상
| 플랫폼 | 색상 |
|---|---|
| 카카오/카카오톡 | `#C8900A` |
| 인스타/인스타그램 | `#C02872` |
| 유튜브 | `#B71C1C` |
| 블로그 | `#1B7A34` |
| 기타/B2B | `#2D5F8A` |

#### 전시선 색상
| 전시 | ON 색상 | OFF 색상 |
|---|---|---|
| 7층 (우리 SUM) | `#006B3C` (초록) | `rgba(0,0,0,0.04)` |
| 장도 (섬냥이) | `#E84393` (핑크) | `rgba(0,0,0,0.04)` |

### 모서리 반경
| 변수 | 값 | 용도 |
|---|---|---|
| `--radius` | `16px` | 칩, 카드 |
| `--radius-lg` | `20px` | 중간 요소 |
| `--radius-xl` | `24px` | 캘린더, 로그인 카드, 모달 |

### 폰트
- **기본**: `'Pretendard', -apple-system, sans-serif` (CDN: orioncactus/pretendard)
- **로그인 타이틀**: `'ClassyVogue', serif` (base64 인라인, 33KB TTF)

---

## 로그인 화면

### 레이아웃
- 전체 흰색 배경 (`#fff`)
- 세로 중앙 정렬 (`flex, center`)
- `fadeUp` 애니메이션 (0.5s)

### YEULMARU 타이틀
- 폰트: ClassyVogue, 42px, font-weight:400
- 색상: `var(--accent)` (#4A4DE7)
- letter-spacing: 4px
- margin-bottom: 24px

### PIN 입력
- 4칸, 각 42×48px, border-radius:12px
- 배경: `#F5F4F8`, 테두리: 없음
- 포커스 시: `box-shadow: 0 0 0 3px var(--accent-glow)`, 배경 #fff
- `-webkit-text-security: disc` (마스킹)
- `type="text"`, `inputmode="numeric"`, `autocomplete="off"`
- 자동 이동: input + keyup 이벤트로 다음 칸 포커스
- 4자리 입력 완료 시 자동 로그인
- 에러 시: `.pin.err` border-color:#E24B4A, background:#FFF5F5

### 로딩 메시지
- PIN 인증 후 데이터 로드 중: 타이핑 효과
- 메시지: `데이터를 불러오는 중입니다... 😉`
- 속도: 65ms/글자, 끝나면 30프레임 멈추고 반복
- 데이터 로드 완료 시 자동 중지

---

## 네비게이션 바

### 구조
```
[YEULMARU 홍보 계획표]  [캘린더|플랫폼 현황|홍보 해줘|연간 일정|설정]  [HH:MM:SS KST] [↻]
```

### 스타일
- 높이: 56px, sticky top:0, z-index:20
- 배경: 글래스모피즘 (`backdrop-filter:blur(20px)`)
- 하단 border: 1px solid var(--glass-border)

### 로고
- "YEULMARU": font-size:14px, font-weight:800, color:`var(--accent)`, letter-spacing:2px
- "홍보 계획표": font-size:13px, color:`var(--dim)`

### 슬라이딩 Pill 메뉴
- 버튼: padding:9px 18px, font-size:13px, font-weight:500, border-radius:20px
- 비활성: color:#777
- 활성: color:#fff
- 호버: color:#fff (pill이 따라옴)
- Pill: background:`var(--accent)`, border-radius:20px, box-shadow:0 4px 12px rgba(74,77,231,0.25)
- 애니메이션: `transition:all .35s cubic-bezier(.4,0,.2,1)`
- 초기화: `document.fonts.ready.then(...)` (폰트 로드 후 정확한 위치)
- mouseleave 시 활성 버튼으로 복귀

### 메뉴 항목
1. **캘린더** (cal) — 기본 선택
2. **플랫폼 현황** (platform) — 미구현
3. **홍보 해줘** (promo) — 미구현
4. **연간 일정** (annual) — 새 창으로 `yeulmaru.github.io/yeulmaru-calandar-2026/`
5. **설정** (settings) — 미구현

### KST 시계
- font-size:12px, font-variant-numeric:tabular-nums
- 1초마다 갱신

---

## 캘린더 헤더

### 월 표시
```
‹  5 2026  ›
```
- 월 숫자: font-size:32px, font-weight:800, color:`var(--accent)`
- 연도: font-size:17px, color:`var(--dim)`, margin-left:8px
- 화살표: 38×38px 원형, 글래스 배경, 호버 시 accent-light

### 칩 (우측)
```
● 카카오 2  ● 인스타 3  ● 블로그·맘카페 0  ● B2B 0
```
- 4개 고정 그룹
- 글래스 배경, border-radius:16px, font-size:12px
- 각 플랫폼 색상 dot (8×8px 원형)
- 숫자: DB 레코드 수 집계

---

## 캘린더 본체

### 구조
- **화~일 6일** (월요일 없음 — 예울마루 휴관일)
- 6주 표시 (36셀)
- 날짜 생성: 7일 단위로 건너뛰며 월요일 skip
  ```js
  for(w=0;w<6;w++) for(d=0;d<6;d++) start + w*7 + d
  ```

### 셀 (`.c`)
- **고정 높이**: 110px
- **패딩**: 7px 8px 20px 8px (하단 20px = 전시선 공간)
- **border-right**: 1px solid var(--border)
- **overflow**: hidden (기본) → hover 시 `overflow-y:auto` (`.c-inner`에 적용)
- **호버**: background `rgba(255,255,255,0.6) !important`, box-shadow

### 셀 내부 구조
```html
<div class="c">
  <div class="c-inner">     ← 스크롤 영역 (height: calc(100% - 14px))
    <div class="dn">         ← 날짜 + 공연 태그 (flex, wrap)
      19                     ← 날짜 숫자
      [공연 태그들]           ← inline-flex span
    </div>
    <div class="ev">...</div> ← 홍보 콘텐츠 행들
  </div>
  [전시선]                    ← position:absolute, 스크롤 밖 고정
</div>
```

### 셀 상태별 배경
| 상태 | 배경 | 날짜 색상 |
|---|---|---|
| 일반 (미래) | `rgba(255,255,255,0.3)` | `var(--text)` |
| 오늘 | `var(--today-bg)` | `var(--accent)` + font-weight:700 |
| 지난 일 (당월) | `var(--past-bg)` | `rgba(0,0,0,0.15)` |
| 비당월 | `var(--nm-bg)` + 대각선 빗금 | `rgba(0,0,0,0.1)` |
| 토요일 | 일반 | `#3B7DD8` |
| 일요일 | 일반 | `#D64545` |
| 선택됨 | `rgba(74,77,231,0.04)` | 일반 + inset box-shadow 2px accent |

### past 판정 규칙
- **당월에서만** past 처리 (다른 달은 전부 일반)
- **이번 주 소속** 셀은 past 아님 (오늘이 속한 화~일 주)
- 비당월(nm) 셀: past 대신 nm 처리

### 요일 헤더 (`.dh`)
- padding:14px 8px, font-size:14px, font-weight:700
- 배경: `rgba(255,255,255,0.5)`
- 토: `#3B7DD8`, 일: `#D64545`, 나머지: `#666`

---

## 공연 일정 표시

### PERFS 상수 (25개 공연 + 2개 전시)

#### 공연 (t:'c')
| # | 줄임말 (n) | 풀네임 (f) | 기간 |
|---|---|---|---|
| 1 | 신년음악회 | 신년음악회 | 1.9 |
| 2 | 다웃파이어 | 미세스 다웃파이어 | 1.24~25 |
| 3 | 브런치 Ⅰ | 브런치 콘서트 Ⅰ | 4.9 |
| 4 | 실내악 | 실내악페스티벌 | 4.16~19 |
| 5 | 김영욱 | 김영욱 × 콜레기움 무지쿰 서울 | 5.7 |
| 6 | 백층집 | 100층짜리 집 | 5.14~16 |
| 7 | 편한음악 | 한국페스티발앙상블 | 5.23 |
| 8 | 국심오케 | 국립심포니오케스트라 | 5.30 |
| 9 | 브런치 Ⅱ | 브런치 콘서트 Ⅱ | 6.4 |
| 10 | 노인의 꿈 | 노인의 꿈 | 6.13 |
| 11 | 헬로!오페라 | 헬로!오페라 세비야의 이발사 | 6.19~20 |
| 12 | 브런치 Ⅲ | 브런치 콘서트 Ⅲ | 9.3 |
| 13 | 섬 박람회 | 여수세계섬박람회 기념 음악회 | 9.10 |
| 14 | 조재혁 | 조재혁 리사이틀 | 9.12 |
| 15 | 그날들 | 그날들 | 9.18~20 |
| 16 | 달샤베트 | 달샤베트 | 10.1~3 |
| 17 | 춘자씨 | 이상한 나라의 춘자씨 | 10.9~10 |
| 18 | 트리플 빌 | 국립현대무용단 트리플 빌 | 10.14 |
| 19 | 피아노×2 | 다비드 바뱅 & 아드리앙 몽도 | 10.27 |
| 20 | 그때도 오늘 | 그때도 오늘 | 11.6~7 |
| 21 | 헬로!오페라 | 헬로!오페라 마술피리 | 11.20~21 |
| 22 | 러커스 | 러커스더스쿨 | 11.26~28 |
| 23 | 브런치 Ⅳ | 브런치 콘서트 Ⅳ | 12.3 |
| 24 | 쉬어매드 | 쉬어매드니스 | 12.15~20 |
| 25 | 성탄 발레 | 호두까기인형 | 12.24~25 |

#### 전시 (t:'e')
| 전시명 | 줄임말 | 장소 | 기간 | 선 색상 |
|---|---|---|---|---|
| 어린이미술전 <우리 SUM 타볼래?> | 우리 SUM | 7층 전시실 | 2.27~6.28 | `#006B3C` 초록 |
| 기획전시 '섬냥이 in 장도' | 섬냥이 | 장도 전시실 | 3.27~6.21 | `#E84393` 핑크 |

### 캘린더 셀 내 공연 태그

#### 3가지 상태
**일반 (미래):**
```
14  [accent원형:공]  풀네임(볼드)  D-7
```
- 원형 뱃지: 16×16px, border-radius:50%, background:var(--accent), color:#fff, font-size:8px
- 공연명: font-size:9px, font-weight:700, color:var(--text)
- D-day: font-size:9px, color:var(--dim)

**오늘:**
```
19  [흰원형:공]  풀네임(볼드검정)
```
- 원형 뱃지: background:rgba(255,255,255,0.85), color:#111
- D-Day: 표시 안 함 (dday===0)

**지난 일:**
```
7  [연회색원형:공]  풀네임(연하게)
```
- 원형 뱃지: background:rgba(0,0,0,0.05), color:rgba(0,0,0,0.22)
- D-day: 없음

### 반응형 줄임말 전환
- CSS 미디어 쿼리: `@media(max-width:1200px)`
- 넓은 화면: `.pf` (풀네임) 표시
- 좁은 화면: `.ps` (줄임말) 표시

### D-day 계산
- 오늘 기준 (각 셀 날짜가 아님)
- 공연 시작일까지 남은 일수
- 기간 중 (dday===0): D-day 표시 안 함
- 이미 종료 (종료일 < 오늘): dday=null, D-day 표시 안 함

---

## 전시 인디케이터 (하단 선)

### 위치
- `position:absolute; bottom:8px; left:0; right:0`
- 셀 좌우 벽까지 이어짐
- `.c-inner` 밖에 위치 → 스크롤 시에도 고정

### 선 사양
- 방식: `border-top:2px solid 색상` (height+background 아님 — 서브픽셀 일관성)
- 간격: `gap:3px` (선끼리)
- 위 선: 7층 (초록 `#006B3C`)
- 아래 선: 장도 (핑크 `#E84393`)

### 상태별
| 조건 | 표시 |
|---|---|
| 전시 기간 중 + 오늘 이후 | ON (해당 색상) |
| 전시 기간 중 + 지난 일 (당월) | OFF (`rgba(0,0,0,0.04)`) |
| 전시 기간 밖 | OFF |
| 비당월 셀 | 미표시 (`if(nm) return ''`) |

---

## 홍보 콘텐츠 표시

### 캘린더 셀 내 (`.ev`)
```
09:00 인스타 편한음악 카드뉴스
```
- font-size:10.5px, line-height:1.4
- 시간: font-weight:600
- 플랫폼: font-weight:600, 플랫폼 고유 색상
- 내용: 일반

### 시간 추출
- DB `입력시간(KST)` 필드에서 추출
- 문자열("2026-05-19 14:00"): split(' ')[1]
- 숫자(엑셀 시리얼): `Math.round((ts%1)*1440)` → 시/분 분리

### 당일 색상 규칙
| 조건 | 시간 색상 | 플랫폼 색상 | 내용 색상 |
|---|---|---|---|
| 지난 일 | var(--past-text) | var(--past-text) | var(--past-text) |
| 당일 + 시간 안 지남 | **var(--accent)** | 플랫폼 고유색 | var(--text) |
| 당일 + 시간 지남 | **#999** | 플랫폼 고유색 | var(--text) |
| 미래 | var(--text) | 플랫폼 고유색 | var(--text) |
| 완료 상태 | #bbb | #bbb | #bbb + 취소선 + opacity:0.6 |

### 진행 상태
- **예정**: 기본값. 정상 표시
- **완료**: 취소선(`text-decoration:line-through`) + 색상 #bbb + opacity:0.6

### 스크롤
- `.c-inner`: overflow:hidden (기본)
- `.c:hover .c-inner`: overflow-y:auto
- 스크롤바: 3px 폭, rgba(0,0,0,0.12) thumb, transparent track

---

## 사이드 패널

### 트리거
- 캘린더 셀 클릭 → 해당 날짜의 상세 정보

### 레이아웃
- width:360px, 우측 고정
- 글래스모피즘 배경 (blur:24px)
- 슬라이드 인 애니메이션 (0.25s)

### 구조
```
┌─ 헤더 ─────────────────┐
│ 5월 23일  토요일     ✕  │
├─ 공연/전시 섹션 ────────┤
│ [공] 제목          D-7  │
│      4층 대극장         │
│ [전] 제목        87일차 │
│      7층 전시실         │
├─ 구분자 ────────────────┤
│ 📭 등록된 콘텐츠 없음   │
│ [+ 새 콘텐츠 등록]     │
└─────────────────────────┘
```

### 공연 카드
- 배경: `rgba(74,77,231,0.06)`, border-radius:10px
- 3열 레이아웃: [공 뱃지(고정)] [제목+장소(flex:1)] [D-day(고정)]
- 뱃지: 20×20px 원형, accent 배경, 흰 글씨
- 제목: font-size:13px, font-weight:700
- 장소: "4층 대극장", font-size:10px, color:var(--dim)
- D-day: font-size:11px, font-weight:600, color:var(--accent)

### 전시 카드
- 배경: `rgba(240,196,184,0.15)`, border-radius:10px
- 뱃지: 20×20px 원형, `#F0C4B8` 배경, #333 글씨
- 장소: "7층 전시실" / "장도 전시실"
- N일차: font-size:11px, font-weight:600, color:`#C08070`

### 구분자
- `border-top:1px solid var(--border)`, margin:12px 0

---

## DB 구조 (SharePoint 엑셀)

### 컬럼 (16개)
| # | 컬럼명 | 설명 |
|---|---|---|
| 1 | No | 순번 |
| 2 | 입력시간(KST) | 홍보 예정 시간 (엑셀 시리얼 숫자) |
| 3 | 날짜 | 엑셀 날짜 시리얼 |
| 4 | 연도 | 2026 등 |
| 5 | 월 | 1~12 |
| 6 | 일 | 1~31 |
| 7 | 요일 | "화요일" 등 |
| 8 | 플랫폼 1 | 카카오톡/인스타그램/유튜브/블로그/기타채널 |
| 9 | 플랫폼 2 | 보조 플랫폼 |
| 10 | 콘텐츠 구분 | 공연/전시/교육/기타 |
| 11 | 담당 부서 | |
| 12 | 콘텐츠 제목 | |
| 13 | 콘텐츠 형식 | |
| 14 | 게시 담당자 | |
| 15 | 진행 상태 | 예정/진행중/완료/취소/보류 |
| 16 | 비고 | |

### API 엔드포인트
| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | `/api/auth` | PIN 인증 `{"password":"<<PIN>>"}` |
| GET | `/api/records` | 전체 레코드 조회 (헤더: X-App-Password) |
| POST | `/api/records` | 새 행 추가 `{"values":[...16개]}` |
| DELETE | `/api/records/:rowIndex` | 행 삭제 |

### 데이터 등록 예시 (curl)
```bash
curl -s -X POST "$API/api/records" \
  -H "Content-Type: application/json" \
  -H "X-App-Password: <<PIN>>" \
  -d '{"values":[2,"2026-05-19 14:00",46161,2026,5,19,"화요일","인스타그램","","공연","","편한음악 카드뉴스","","","예정",""]}'
```

---

## 모달 (새 콘텐츠 등록)

### 필드
- 시간 (time input, 기본 10:00)
- 플랫폼 (select: 카카오톡/인스타그램/유튜브/블로그/기타채널)
- 콘텐츠 제목 (text)
- 콘텐츠 구분 (select: 공연/전시/교육/기타)
- 진행 상태 (select: 예정/진행중/완료/취소/보류)
- 비고 (text)

### 스타일
- 배경 오버레이: `rgba(26,26,46,0.4)` + backdrop-filter:blur(4px)
- 카드: 400px, border-radius:24px, box-shadow 큰 값
- 입력 필드: background:#F8F7FC, border:1.5px solid rgba(0,0,0,0.06), border-radius:12px
- 포커스: accent border + accent glow

---

## 글래스모피즘 적용 요소
| 요소 | blur | 배경 |
|---|---|---|
| 네비게이션 | 20px | `var(--glass)` |
| 캘린더 전체 | 16px | `var(--glass)` |
| 사이드 패널 | 24px | `var(--glass)` |
| 칩 | 8px | `var(--glass)` |
| 화살표 버튼 | 8px | `var(--glass)` |

---

## 주의사항 / 알려진 이슈

1. **월요일 없음**: 캘린더가 화~일(6일) 구조. 오늘이 월요일이면 "오늘" 표시 안 됨.
2. **시간 변환**: 엑셀 시리얼에서 시간 추출 시 `Math.round((ts%1)*1440)` 사용 (반올림 문제 방지).
3. **서브픽셀**: 전시선은 `border-top` 방식 사용 (height+background 아닌).
4. **유니코드**: JS 코드에 한글 직접 삽입 (유니코드 이스케이프 \uXXXX 사용 X). 이모지는 서로게이트 쌍(\uD83D\uDE09) 유지.
5. **폰트 로딩**: 네비 pill 초기 위치를 `document.fonts.ready` 후 설정.
6. **GitHub Pages 캐시**: 변경 후 1~2분 소요. Ctrl+Shift+R 권장.
7. **PERFS 배열 닫기**: `];` 누락 시 전체 JS 파싱 실패 → PIN 포함 모든 기능 작동 안 함.
