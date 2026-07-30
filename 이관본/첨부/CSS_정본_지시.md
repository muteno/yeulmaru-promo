# CSS 정본 이식 지시 — 「원문 그대로」 붙여넣어라

> 생성: `tools/miso/build_css_spec.mjs` (기계 추출 · 원문 무변)
> 첨부 파일: **`정본_스타일.css`** (133KB · 690규칙 + @keyframes 28개)

---

## 0. 결론 — 뭘 해야 하나

지금 화면들이 원본과 조금씩 다른 이유는 **CSS를 눈으로 보고 다시 만들었기** 때문이다.
그러면 매번 몇 줄씩 빠진다. 그러지 말고 **첨부 CSS를 통째로 넣어라.**

1. 첨부 `정본_스타일.css` 를 프로젝트에 **파일 그대로** 추가한다 → `src/styles/yeulmaru.css`
2. 엔트리에서 **Tailwind 다음에** 불러온다 (순서가 중요하다 — 뒤에 와야 이긴다)
   ```css
   /* src/index.css */
   @import "tailwindcss";
   @import "./styles/yeulmaru.css";   /* ← 반드시 마지막 */
   ```
3. **컴포넌트에서는 이 CSS의 클래스명만 쓴다.** Tailwind 유틸리티로 다시 칠하지 마라.
   (`className="cal"` ○ / `className="cal rounded-xl border bg-white"` ✕)
4. shadcn 기본 컴포넌트(`Button`·`Input`·`Card`·`Dialog`)를 이 화면들에 쓰지 마라.
   그 컴포넌트들이 자기 테두리·배경·라운드를 들고 와서 원본 형태를 덮는다.
   **평범한 `<div>`·`<button>`·`<table>` + 위 클래스명** 조합이 정답이다.

---

## 1. 무엇이 들어있나 (우선순위별)

| 등급 | 뜻 | 규칙 수 |
|---|---|---|
| **P0** | 전역·토큰·리셋·미디어쿼리 — 무조건 필요 | 43 |
| **P1** | **메인화면(사업 실적)·인트로에 실제로 보이는 것** — 최우선 | 250 |
| **P2** | **메인에서 띄우는 모달** — 다음 우선 | 50 |
| P3 | 캘린더·프로그램 화면 | 138 |
| P4 | DOM엔 있으나 이번 순회에서 안 열린 화면(조건부 모달 등) — 나중 | 209 |
| @keyframes | 위 규칙들이 참조하는 애니메이션만 | 28 |

> 제외한 것: **722건** — 모바일 전용 미디어쿼리, 그리고 이관 대상 화면에 나타나지 않는 규칙
> (콘텐츠 제작 도우미 `.nb-*`·`.ve-*`, 위저드 `.wz-*` 등). 나중에 그 화면을 만들 때 다시 뽑아준다.
> 미사용 @keyframes 30개도 제외했다.

---

## 2. 네임스페이스 = 화면 구성 체크리스트

이 접두어들이 곧 원본의 컴포넌트 목록이다. **각 줄이 화면에 실제로 있는지 확인해라.**
개수는 그 접두어에 걸린 CSS 규칙 수 — 많을수록 형태가 복잡하다(= 대충 만들면 확실히 티가 난다).

| 접두어 | 규칙 | 등급 | 무엇 | 예시 선택자 |
|---|---|---|---|---|
| `.yc` | 158 | P4 | 연간 일정 통합 보드 | `.yc-wrap` `.yc-ex-end-i` `.yc-ev-link` `.yc-mnav` `.yc-hd` |
| `.srail` | 88 | P1 | 우측 판매 레일(캘린더 옆 사업현황) | `.srail-ttlzone` `.srail-ttltext` `.srail-head` `.srail` `.srail-cnt` |
| `.c` | 51 | P1 | 캘린더 날짜 셀 | `.c` `.c-inner` `.c-count` `.c-btn` |
| `.bizm` | 43 | P1 | 사업 실적 좌 보드(KPI 스트립·표·차트) | `.bizm-card` `.bizm-page` `.bizm-pgctl` `.bizm-kpi` `.bizm-hero` |
| `.on` | 39 | P1 | 활성 상태 modifier(선택된 탭·칩·셀) | `.on` |
| `.ry` | 39 | P1 | 연간실적 우측 목록 — 분야 그룹 행(공연/전시/교육) | `.ry-hl` `.ry-grp` `.ry-grp-hd` `.ry-grp-bd` `.ry-venue` |
| `#rail` | 37 | P1 | 연간 실적 틀 우측 이식 슬롯 | `#rail-yrm` `#rail-yrm-list` |
| `.modal` | 31 | P1 | 모달 공통 셸(백드롭·카드·헤더·본문) | `.modal-bg` `.modal` `.modal-x` `.modal-acts` |
| `.nav` | 29 | P1 | 상단 내비게이션 바 | `.nav` `.nav-left` `.nav-logo` `.nav-mnav` `.nav-center` |
| `#app` | 25 | P1 | 앱 셸(인트로 다음 화면 전체) | `#app` |
| `.biz` | 25 | P1 | 사업 실적 모드 플래그(레이아웃 전환) | `.biz-mode` `.biz-fit` |
| `.cb` | 24 | P1 | 챗봇 위젯(우하단 FAB + 창) | `.cb-fab` `.cb-win` `.cb-hdr` `.cb-ava` `.cb-titles` |
| `.ana` | 24 | P1 | 판매·사업현황 분석 보드 | `.ana-seg` `.ana-chip` `.ana-tbl` `.ana-badge` `.ana-kpi` |
| `.pin` | 20 | P1 | PIN 입력 4칸 (동그라미) | `.pin-wrap` `.pin-row` `.pin-slot` `.pin` |
| `.sp` | 18 | P3 | 캘린더 셀 하단 특별일정 트랙 | `.sp-area` `.sp-item` `.sp-track` `.sp-time` `.sp-label` |
| `.done` | 15 | P3 | 완료 상태 modifier(투명도 낮춤) | `.done` |
| `.dh` | 15 | P3 | 캘린더 요일 머리행(월~일 · 토=파랑 · 일=빨강) | `.dh` `.dh-split` |
| `.p` | 14 | P3 | 캘린더 셀 안 홍보 카드 · 플랫폼 미니 배지 | `.p-mon` `.p-sun` `.p-on` `.p-card` `.p-plat-mini` |
| `.dn` | 13 | P2 | 캘린더 셀 안 일정 이름 줄 | `.dn` |
| `.past` | 12 | P2 | 지난 날짜(흐리게) | `.past` |
| `.week` | 12 | P3 |  | `.week` `.week-collapsed` |
| `.prog` | 11 | P3 |  | `.prog-btn` `.prog-count-badge` `.prog-list` `.prog-toggle` `.prog-tab` |
| `.cell` | 11 | P1 |  | `.cell-corner` `.cell` |
| `.val` | 11 | P1 |  | `.val` |
| `.hamburger` | 10 | P4 |  | `.hamburger` `.hamburger-ico` |
| `.ev` | 10 | P3 |  | `.ev` `.ev-time` `.ev-plat` `.ev-title` `.ev-dragging` |
| `.mv` | 10 | P1 | 메인 전환 세그먼트(실적↔캘린더) | `.mv-row` `.mv-content-btn` `.mv-content` `.mv-swipe` `.mv-tbl` |
| `#srail` | 10 | P1 | 판매 레일 슬롯 | `#srail-uha` |
| `.dot` | 9 | P1 | PIN 성공/힌트 링(SVG) | `.dot-ring` `.dot` |
| `.today` | 9 | P2 | 오늘 셀 강조 | `.today` |
| `.show` | 9 | P1 |  | `.show` |
| `.pf` | 9 | P1 |  | `.pf-row` `.pf-c` `.pf-e` `.pf-a` `.pf-r` |
| `.pw` | 9 | P1 |  | `.pw-modal` `.pw-progress` `.pw-progress-bar` `.pw-steplabel` `.pw-acts` |
| `.bp` | 9 | P1 | 예매 프로세스 보드 | `.bp-tbtn` `.bp-tkey` `.bp-fchip` `.bp-seg` `.bp-home` |
| `#sales` | 9 | P1 |  | `#sales-rail` |
| `.login` | 8 | P1 | 인트로 로그인 카드 | `.login-card` `.login-tilt` `.login-welcome` `.login-leave` |
| `.msgbox` | 8 | P1 |  | `.msgbox-btn` `.msgbox-count` `.msgbox-urgent` |
| `.ve` | 8 | P1 |  | `.ve-pos9` `.ve-swatch` `.ve-sec` `.ve-cut` `.ve-mark` |
| `#login` | 7 | P1 | 인트로 화면 컨테이너 | `#login` `#login-msg` `#login-load` |
| `.is` | 7 | P1 |  | `.is-instant` `.is-visible` `.is-open` |
| `.pres` | 7 | P2 |  | `.pres-ava` `.pres-dot` `.pres-pop` |
| `.m` | 7 | P1 |  | `.m` `.m-btn` |
| `.todo` | 6 | P1 |  | `.todo-impbtn` `.todo-cir` `.todo-row` `.todo-title` |
| `.confirm` | 6 | P2 |  | `.confirm-bg` `.confirm` `.confirm-title` `.confirm-msg` `.confirm-acts` |
| `.lab` | 6 | P1 |  | `.lab` |
| `.ct` | 6 | P1 |  | `.ct` `.ct-bul` |

---

## 3. :root 토큰 — 이게 색·모양의 뿌리다

**새 색을 만들지 마라.** 아래가 이 앱의 색 전부다(팔레트 폐쇄형).
`정본_스타일.css` 안에 이미 `:root` 블록으로 들어있으니 따로 옮길 필요는 없다 — 아래는 확인용이다.

| 토큰 | 값 | 쓰임 |
|---|---|---|
| `--accent` | `#4A4DE7` | 강조 인디고 — 주 버튼·활성·채운 PIN 원 |
| `--accent-light` | `#E8E8FD` | 강조 옅은 배경(활성 셀) |
| `--accent-glow` | `rgba(74,77,231,0.15)` | 강조 글로우(히어로·포커스) |
| `--peach` | `#F0C4B8` | 살몬 — 배경 그라디언트·호버 |
| `--peach-light` | `#FBF0EC` | 살몬 옅은 면 |
| `--peach-bg` | `#FDF6F3` | 살몬 배경 베이스 |
| `--peach-text` | `#D88455` | 살몬 글자(계정명·전시) |
| `--bg` | `linear-gradient(135deg,#FDF6F3 0%,#F0EBF5 50%,#EBF0F8 100%)` | 앱 배경 그라디언트 |
| `--surface` | `rgba(255,255,255,.78)` | 카드 면(유리) |
| `--surface-solid` | `#fff` | 카드 면(불투명) |
| `--glass` | `rgba(255,255,255,0.55)` | 유리 흰 알파 |
| `--glass-border` | `rgba(255,255,255,0.55)` | 유리 테두리 |
| `--glass-shadow` | `0 8px 32px rgba(74,77,231,0.08),0 2px 8px rgba(0,0,0,0.04)` | 유리 그림자(2단) |
| `--border` | `rgba(0,0,0,0.09)` | 기본 테두리 |
| `--border2` | `rgba(0,0,0,0.12)` | 진한 테두리 |
| `--text` | `#1A1A2E` | 본문 잉크 |
| `--dim` | `#888` | 흐린 글자 |
| `--muted` | `#bbb` | 가장 흐린 글자·빈 PIN 테두리 |
| `--past-bg` | `rgba(0,0,0,0.02)` |  |
| `--past-text` | `#bbb` |  |
| `--nm-bg` | `rgba(0,0,0,0.02)` |  |
| `--today-bg` | `rgba(230,240,255,0.8)` |  |
| `--off-bg` | `rgba(0,0,0,0.12)` |  |
| `--green` | `#1A6B3C` | 성공 초록 — PIN 성공 링 |
| `--danger` | `#E24B4A` | 경고 빨강 |
| `--danger-btn` | `#E24B4A` | 삭제 버튼 빨강 |
| `--kakao` | `#F5B400` |  |
| `--insta` | `#C02872` |  |
| `--youtube` | `#B71C1C` |  |
| `--blog` | `#1A6B3C` |  |
| `--etc` | `#2D8AB3` |  |
| `--radius` | `16px` | 기본 라운드 16 |
| `--radius-lg` | `20px` | 라운드 20 |
| `--radius-xl` | `24px` | 라운드 24(로그인 카드) |
| `--neutral` | `#EEEDF3` | 중립 면 |
| `--neutral-d` | `#E1DFEC` |  |
| `--neutral-text` | `#6B6B7B` | 중립 글자 |
| `--r-btn` | `10px` | 버튼 라운드 10 |
| `--r-pop` | `16px` | 팝오버 라운드 16 |
| `--r-modal` | `20px` | 모달 라운드 20 |
| `--elev` | `0 20px 56px rgba(74,77,231,.16), 0 6px 18px rgba(26,26,46,.07)` | 모달 그림자 |
| `--backdrop` | `rgba(26,26,46,.42)` | 모달 백드롭 딤 |
| `--glass-surface` | `rgba(255,255,255,.78)` | 유리 면 78% |
| `--glass-menu` | `rgba(255,255,255,.45)` | 유리 메뉴 45% |
| `--glass-bd` | `rgba(255,255,255,0.55)` |  |
| `--z-sticky` | `10` |  |
| `--z-nav` | `90` | z-index 내비 |
| `--z-dropdown` | `1000` |  |
| `--z-modal` | `2000` | z-index 모달 |
| `--z-confirm` | `2100` |  |
| `--z-toast` | `3000` | z-index 토스트 |
| `--c1` | `#4A4DE7` |  |
| `--c2` | `#D88455` |  |
| `--c3` | `#1A6B3C` |  |
| `--c4` | `#C02872` |  |
| `--c5` | `#2D8AB3` |  |
| `--c6` | `#F5B400` |  |
| `--cell-pad-y` | `10px` | 표 셀 세로 패딩 |
| `--cell-pad-x` | `12px` | 표 셀 가로 패딩 |
| `--cell-fs` | `13px` | 표 셀 글자 크기 |

> 색을 조정하고 싶으면 **토큰 값만** 바꿔라. 개별 규칙에 hex를 새로 쓰면 팔레트가 깨진다.

---

## 4. 글꼴 — 이것도 놓치기 쉽다

원본 글꼴은 **Pretendard**(본문 전체)이고, 로고 한 곳만 **ClassyVogue**다.
글꼴이 다르면 글자 폭이 달라져 표·카드 줄바꿈이 전부 어긋난다 — 가장 티가 크게 나는 차이다.

```html
<!-- index.html <head> 에 넣어라 (원본과 동일한 두 줄) -->
<link href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.min.css" rel="stylesheet">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700;900&family=DM+Serif+Display&display=swap" rel="stylesheet">
```

- **사내망에서 위 CDN이 막히면** Pretendard를 npm으로 넣어라 → `npm i pretendard` 후 `import "pretendard/dist/web/static/pretendard.css"`.
- 그것도 안 되면 폰트 없이 가도 된다(레이아웃은 유지된다). 단 `*{font-family:'Pretendard',-apple-system,sans-serif}` 규칙은 **지우지 마라** — 폴백 순서가 원본과 같아야 한다.
- **ClassyVogue(로고용)는 첨부 CSS 안에 data:URI로 이미 박아 넣었다.** 별도 파일이 필요 없다.

### 이미지 자산

**CSS에 이미 박아 넣은 것(추가 작업 없음)**

- `image/classyvogue-latin.woff2` (7KB) → data:URI 인라인 완료
- `image/pets/pet_love.png` (11KB) → data:URI 인라인 완료

**따로 올려야 하는 것** — 프로젝트에 아래 **경로 그대로** 넣어라(경로가 CSS에 박혀 있다).

| 파일 | 크기 | 쓰임 | 없으면 |
|---|---|---|---|
| `image/pets/pet_crab.png` | 111KB | 캘린더 하단 픽셀 펫(크랩) — 배회 연출 | 펫이 안 나옴(기능 영향 0) |
| `image/bg-yeulmaru.webp` | 271KB | 캘린더·판매레일 뒤 여수 예울마루 항공사진(하위 15% crop · opacity 25%) | 유리 카드가 흰 배경 위에 뜬다 — 톤만 밋밋해짐 |

> 이 파일들은 **장식**이다. 못 올려도 화면이 깨지지 않는다 — 데이터·레이아웃부터 맞추고 나중에 채워도 된다.

---

## 5. 흔히 놓치는 CSS 7가지 (지금까지 실제로 빠졌던 것)

| # | 놓치는 것 | 증상 | 정본 |
|---|---|---|---|
| 1 | `backdrop-filter` | 유리 카드가 그냥 흰 박스로 보인다 | `.login-card` `blur(32px) saturate(1.35)` · `.cal`·`.srail` 등 글래스 서피스 전부 |
| 2 | `box-shadow` 2단 겹침 | 카드가 종이처럼 납작하다 | 대부분 `0 8px 32px rgba(74,77,231,.08), 0 2px 8px rgba(0,0,0,.04)` (넓은 인디고 + 좁은 검정) |
| 3 | `::before`/`::after` 가상요소 | 동그라미·블릿·액센트 바가 사라진다 | PIN 동그라미, 카드 제목 블릿, 섹션 소제목 앞 accent 바 |
| 4 | `transition` | 상태가 툭툭 바뀐다 | 셀·칩·버튼 대부분 `.18s`~`.22s ease` |
| 5 | `animation` + `@keyframes` | 등장·펄스·링 draw가 없다 | @keyframes 28개 전부 필요 |
| 6 | `:has()` 상태 선택자 | 입력해도 모양이 안 바뀐다 | `.pin-slot:has(.pin.filled)` 같은 부모-반응 규칙 |
| 7 | CSS 변수 `--i` 인라인 | 순차 애니메이션이 동시에 터진다 | `style="--i:0"`~`3` 을 HTML에 넣어야 `calc(var(--i)*.1s)` 가 작동 |

---

## 6. 넣은 뒤 자기검증 (F12 실측 · 눈대중 금지)

```js
// 콘솔에 붙여넣어라 — 정본 CSS가 실제로 먹었는지 확인한다
(() => {
  const q = s => document.querySelector(s);
  const g = (s, p, pe) => { const e = q(s); return e ? getComputedStyle(e, pe || null)[p] : '없음'; };
  console.table({
    '카드 유리':      g('.login-card','backdropFilter') ,
    '카드 배경':      g('.login-card','backgroundColor'),
    'PIN 원 크기':    g('.pin-slot','width','::before'),
    'PIN 원 라운드':  g('.pin-slot','borderRadius','::before'),
    'PIN 슬롯 테두리':g('.pin-slot','border'),
    '성공링 색':      g('.dot-ring circle','stroke'),
    '토큰 accent':    getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
    '토큰 개수':      [...document.styleSheets].flatMap(s=>{try{return [...s.cssRules]}catch(e){return []}})
                        .filter(r=>r.selectorText===':root').flatMap(r=>[...r.style]).filter(p=>p.startsWith('--')).length,
    '정본 CSS 로드':  [...document.styleSheets].some(s=>{try{return [...s.cssRules].some(r=>r.selectorText&&/\.pin-slot/.test(r.selectorText))}catch(e){return false}}),
  });
})()
```

**기대값**

| 항목 | 기대 |
|---|---|
| 카드 유리 | `blur(32px) saturate(1.35)` |
| 카드 배경 | `rgba(255, 255, 255, 0.22)` |
| PIN 원 크기 / 라운드 | `15px` / `50%` |
| PIN 슬롯 테두리 | `0px none rgb(...)` = **테두리 없음** |
| 성공링 색 | `rgb(26, 107, 60)` |
| 토큰 accent | `#4A4DE7` |
| 토큰 개수 | **60** 이상 |
| 정본 CSS 로드 | `true` |

---

## 7. 보고 형식

```
[정본 CSS 이식]
파일: src/styles/yeulmaru.css (○KB) · import 위치: index.css 마지막 ○
Tailwind 충돌: 없음 / 있음(어디: ○○○ → 어떻게 해결: ○○○)
shadcn 제거: ○개 컴포넌트를 순수 div/button/table로 교체 (목록: ○○○)
자기검증 8항: ○/8 통과 (미통과: ○○○)
남은 차이(눈으로 본 것): ○○○
```
