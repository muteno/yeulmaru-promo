#!/usr/bin/env node
/* 마스터 명세 합성기 — 기능 명세(MISO_전달_통합본.md) + 실측 명세(완전동일_명세.md)를
   하나로 합치고, 단계별 빌드 계획·자가검증 프로토콜·흔한 실수 목록을 덧붙여
   이관본/첨부/마스터명세.md 를 만든다.
   목적 = 수신 LLM이 약한 모델(Sonnet급)이어도 추측 없이 따라오게 하고, 스스로 재검토하게 한다.
   전제: build_single_json.mjs → build_standalone.mjs → build_fidelity_spec.mjs 순서 선실행
   사용: node tools/miso/build_master_spec.mjs
   ⚠️ 기계산출물 — 손편집 금지. 원본 문서를 고치고 재실행. */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FUNC = join(ROOT, '이관본', 'MISO_전달_통합본.md');
const FID = join(ROOT, '이관본', '완전동일_명세.md');
const DB = join(ROOT, '이관본', '첨부', '예울마루_데이터.json');
const DBX = join(ROOT, '이관본', '첨부', '예울마루_데이터_확장.json');
const OUT = join(ROOT, '이관본', '첨부', '마스터명세.md');

for (const p of [FUNC, FID, DB]) if (!existsSync(p)) { console.error(`없음: ${p}`); process.exit(1); }
const func = readFileSync(FUNC, 'utf8');
const fid = readFileSync(FID, 'utf8');
const db = JSON.parse(readFileSync(DB, 'utf8'));
const dbx = existsSync(DBX) ? JSON.parse(readFileSync(DBX, 'utf8')) : null;
const kb = f => existsSync(f) ? (readFileSync(f).length / 1024).toFixed(0) + 'KB' : '없음';
const counts = db.meta.expectedCounts, sd = db.meta.recordsStatusDistribution;
const annual = db.annual || {};
const totInwon = (annual.total || []).find(r => r.key === '인원') || {};

// 기능 명세에서 본문만(헤더 안내·전달방법 줄 제거)
function body(md, fromHeading) {
  const i = md.indexOf(fromHeading);
  return i < 0 ? md : md.slice(i);
}
const funcBody = body(func, '## 0. 작업 방식');
const fidBody = body(fid, '## 1. 화면 골격');

const md = `# 예울마루 대시보드 — 완전판 마스터 명세 (이 문서 하나가 전부)

> 생성: \`tools/miso/build_master_spec.mjs\` (기계산출물 — 손편집 금지)

## 📎 같이 첨부된 파일 (이게 전부다 — 다른 파일은 없다)

| # | 파일 | 크기 | 필수 | 용도 |
|---|---|---|---|---|
| 1 | \`마스터명세.md\` (이 문서) | — | ✅ | 만들 것의 전체 명세 |
| 2 | \`예울마루_데이터.json\` | ${kb(DB)} | ✅ | **P1 핵심 데이터** — 메인화면·모달·캘린더·프로그램 |
| 3 | \`예울마루_데이터_확장.json\` | ${kb(DBX)} | ⬜ | **P2 확장 데이터** — 규정·공연이력·교육기관·알림 등 추가 화면 |

⛔ **두 JSON 모두 읽기 도구로 열지 마라.** 합쳐서 약 60만 토큰이다. 구조는 이 문서에 전부 적혀 있다.
파일은 \`cp\`로 \`src/data/\`에 복사하고 \`import\`로만 쓴다.

## ⚠️ 이 작업은 "한 번에" 끝내야 한다 (재발행에 승인이 필요함)

발행할 때마다 플랫폼 관리자 승인이 필요하다. 그래서 **여러 번 고쳐 발행하는 방식이 불가능**하다.
따라서:

1. **P1을 먼저 완성하고, 아래 D부 검증을 실제로 실행해 스스로 고친 뒤**에 P2로 넘어가라.
2. 중간에 "일단 이 정도만" 하고 멈추지 마라. P1은 반드시 끝까지 완성해라.
3. 컨텍스트·시간이 부족하면 **P2를 버리고 P1을 완성**해라(P1만으로도 발행 가치가 있다).
4. 발행 전에 D부 체크리스트를 **직접 실행**하고, 실패 항목은 **스스로 수정**한 뒤 다시 확인해라.

## 우선순위 (P1이 절대 우선)

| 등급 | 범위 | 데이터 |
|---|---|---|
| **P1 (필수)** | ① 사업 실적(기본 화면) + **거기서 열리는 드릴·모달** ② 홍보 캘린더 ③ 프로그램 | \`예울마루_데이터.json\` |
| P2 (여유 있으면) | ④ 규정 검색 ⑤ 공연 이력 조회 ⑥ 교육기관 목록 ⑦ 알림함 ⑧ 담당자 | \`예울마루_데이터_확장.json\` |

**P1 안에서도 「메인화면 + 메인화면에서 열리는 모달」이 가장 중요하다**(운영자 최우선 지시).
B부 §2-9에 그 모달들의 실측 내용이 있다 — 그대로 재현해라.

---

## 읽는 법 (먼저 이것만)

너는 이 문서를 위에서 아래로 순서대로 따라가면 된다. 구성은 이렇다.

| 부 | 내용 | 성격 |
|---|---|---|
| **A부** | 작업 방식·임무·데이터 계약·팔레트·화면 기능 | **무엇을 만드나** |
| **B부** | 실측 DOM 구조·computed style·원본 CSS verbatim | **정확히 어떻게 보이나** |
| **C부** | 단계별 빌드 순서(7단계) | **어떤 순서로 만드나** |
| **D부** | 자가검증 프로토콜·흔한 실수 | **다 만들고 스스로 확인** |

**핵심 원칙 3개 — 이것만은 절대 어기지 마라**

1. **추측 금지.** 값이 필요하면 이 문서에서 찾아라. 문서에 없으면 만들지 말고 "명세에 없음"이라고 보고해라.
   "더 예쁘게", "요즘 스타일로" 같은 개선을 하지 마라. 원본과 **똑같이** 만드는 것이 목표다.
2. **데이터 창작 금지.** 화면에 나오는 모든 숫자·이름은 첨부 JSON에서 온 것이어야 한다.
   예시 데이터·더미 데이터·placeholder를 넣지 마라.
3. **다 만들면 D부 검증을 실제로 실행하고 결과를 보고해라.** "다 됐습니다"만 말하지 마라.

---

# A부 — 무엇을 만드나 (기능 명세)

${funcBody}

---

# B부 — 정확히 어떻게 보이나 (실측 정본)

> 아래는 원본 앱을 **1920×1080 헤드리스 브라우저로 실제 렌더해서 뽑은 실측값**이다.
> 사람이 눈으로 보고 적은 것이 아니라 기계가 측정한 것이므로, **이 값이 정답**이다.
> DOM 계층·클래스명·수치를 그대로 재현해라.

${fidBody}

---

# C부 — 빌드 순서 (이 순서대로 7단계)

각 단계를 끝낼 때마다 "N단계 완료: (결과)"를 한 줄로 보고하고 다음으로 넘어가라.

### 1단계 — 데이터 배선 (가장 먼저)
1. 업로드된 \`예울마루_데이터.json\`을 \`src/data/yeulmaru.json\`으로 **복사**한다(\`cp\`).
   ⛔ 파일을 읽기 도구로 열지 마라 — 약 25만 토큰이다. 구조는 A부 §2에 다 적혀 있다.
2. \`src/data/index.ts\`를 만들어 \`import raw from './yeulmaru.json'\`으로 불러오고,
   각 배열을 named export한다: \`records, programs, special, opsMaster, opsDaily, exhibMaster, exhibDaily, platforms, contents, applySettings, annual\`.
3. **건수 검증**: 콘솔에 각 배열 길이를 찍어 아래 표와 맞는지 확인한다.
   | 키 | 기대 |
   |---|---|
${Object.entries(counts).map(([k, v]) => `   | \`${k}\` | ${v} |`).join('\n')}
   | \`annual.years\` | ${(annual.years || []).length} (${(annual.years || [])[0]}~${(annual.years || []).slice(-1)[0]}) |
   → 하나라도 다르면 여기서 멈추고 원인을 보고해라. 다음 단계로 넘어가지 마라.

### 2단계 — 팔레트·전역 CSS
1. \`index.css\`에 Tailwind 4 \`@theme\`를 열고 **B부 §5-1·§5-2의 \`:root\` 토큰을 그대로** 등록한다.
2. 페이지 배경(그라데이션), 본문 글꼴(Pretendard → Noto Sans KR), 기본 텍스트 색을 적용한다.
3. 이후 모든 색은 **이 변수만 참조**한다. 새 색상 리터럴을 쓰지 마라.

### 3단계 — PIN 게이트
1. 첫 화면: 배경 그라데이션 위 글래스 카드 1개. "예울마루" 타이틀 + 4칸 PIN 입력.
2. 4자리가 채워지면 검사 → \`0510\`이면 통과, 아니면 카드 흔들림 + 빨강 문구 후 초기화.
3. ⛔ Microsoft/팀즈 로그인, 계정 선택, 아이디·비밀번호, 소셜 로그인을 **만들지 마라**.

### 4단계 — 앱 셸 (내비 + 2단 레이아웃)
1. 상단 내비 1줄: 좌측 로고 자리("예울마루"), 중앙 메뉴, 우측 아이콘 자리.
2. 본문을 **좌우 2단**으로 나눈다(B부 §3의 \`#biz-main\`·\`#sales-rail\` 실측 폭 참조 — 좌우 1:1).
3. 라우팅: 기본 진입 = **사업 실적**. 메뉴 = 사업 실적 · 홍보 캘린더 · 프로그램.

### 5단계 — 사업 실적 화면 (기본 화면 · 가장 중요)
1. **좌측 「연간 실적」**: 헤더(제목 + 우측 "누적 ${(annual.grand || 0).toLocaleString()}명") → KPI 4칸 → 추이 차트 → 전체 실적표.
   KPI 4칸 값은 B부 §1-9 실측 텍스트와 **글자까지 같아야** 한다.
2. **우측 「판매 현황」**: 그룹 머리글(● 공연 N / ● 전시 N) + 표.
   표 열 = B부 §4-2 실측과 동일: \`일자 · 프로그램 · 판매율 · 최근 7일 추이 · 사업 성격 · 장르\`.
3. 판매율·오픈예정 처리 규칙은 A부 §4-③을 따른다.

### 6단계 — 홍보 캘린더 화면
1. 월간 그리드 + 상태색 뱃지 + 특별일정 회색 뱃지 + 뱃지 클릭 상세 모달.
2. 셀에 뱃지가 3개를 넘으면 "+N건 더보기"로 접는다.
3. 첫 진입 월은 데이터가 있는 달(2026년 6월)로 맞춘다.

### 7단계 — 프로그램 화면 + 마무리
1. \`programs\` 카드 목록 + 콘텐츠구분 필터 칩 + 판매중 배지.
2. 전 화면을 1920×1080에서 확인하고, D부 검증을 실행한다.

### 8단계 — P2 확장 (P1 완성·검증 후에만)

\`예울마루_데이터_확장.json\`을 \`src/data/yeulmaru_ext.json\`으로 복사하고 아래 화면을 추가한다.
${dbx ? Object.entries(dbx.meta.expectedCounts).map(([k, v]) => `- \`${k}\` (${v}건) — ${dbx.meta.fieldNotes[k] || ''}`).join('\n') : '(확장 파일 없음)'}

권장 화면: ④ 규정 검색(\`rules\` 키워드 검색 — 901건이라 전체 나열 금지) ⑤ 공연 이력 조회(\`perfHistory\` 2012~2026 표+장르·연도 필터)
⑥ 교육기관 목록(\`eduInstitutions\` 시·구분 필터) ⑦ 알림함(\`messages\` 목록) ⑧ 담당자(\`managers\` 표).
전부 **조회 전용**이다.

---

# D부 — 자가검증 프로토콜 (다 만든 뒤 실제로 실행하고 보고)

## D-1. 숫자 검증 (콘솔 또는 화면에서 실제 값 확인)

| # | 확인 항목 | 기대값 |
|---|---|---|
| 1 | records 건수 | **${counts.records}** |
| 2 | records 상태 분포 | ${Object.entries(sd).map(([k, v]) => `${k} ${v}`).join(' · ')} |
| 3 | programs / special / opsMaster | ${counts.programs} / ${counts.special} / ${counts.opsMaster} |
| 4 | opsDaily / exhibMaster / exhibDaily | ${counts.opsDaily} / ${counts.exhibMaster} / ${counts.exhibDaily} |
| 5 | KPI 「누계 관람·수강」 | **${(totInwon.sum || 0).toLocaleString()}** |
| 6 | 헤더 「누적」 | **${(annual.grand || 0).toLocaleString()}명** |
| 7 | 판매 현황 그룹 | 공연 N건 · 전시 N건 (둘 다 0이면 실패) |

## D-2. 화면 검증 (눈으로 확인 — 하나라도 아니면 고쳐라)

- [ ] 앱을 열면 **PIN 4칸**이 먼저 나온다. 팀즈/MS 로그인 화면이 없다.
- [ ] \`0510\` 입력 → 통과. 다른 값 → 빨강 에러 문구.
- [ ] 통과 직후 화면이 **「사업 실적」**이다(캘린더가 아니다).
- [ ] 좌측에 KPI 4칸·추이 차트·전체 실적표가 **모두** 있다.
- [ ] 우측 판매 현황 표에 실제 공연명이 뜬다(예: 브런치 콘서트·뮤지컬 등).
- [ ] 캘린더 메뉴 → 2026년 6월에 뱃지가 보인다.
- [ ] 색: 인디고(\`#4A4DE7\`)·살몬(\`#D88455\`) 톤. 팔레트 밖 색(초록 버튼·파란 배경 등)이 없다.
- [ ] 등록·수정·삭제·저장 버튼이 **하나도 없다**(조회 전용).
- [ ] 모든 라벨이 한국어다. 버튼 안에 이모지·아이콘이 없다.
- [ ] 브라우저 콘솔에 에러가 없다.

## D-3. 보고 형식 (이 형식으로 답해라)

\`\`\`
[완료 보고]
1단계 데이터: records ○○건 / programs ○○ / special ○○ / opsDaily ○○ / annual ○○년
5단계 KPI: 누계 관람·수강 ○○○ / 누적 ○○○명
판매 현황: 공연 ○건 · 전시 ○건
D-2 체크리스트: ○/10 통과 (미통과 항목: …)
접속 URL: …
남은 문제: … (없으면 "없음")
\`\`\`

---

# 흔한 실수 (실제로 자주 나는 것 — 미리 피해라)

| # | 실수 | 이렇게 해라 |
|---|---|---|
| 1 | 첨부 JSON을 읽기 도구로 통째로 열어 컨텍스트를 태운다 | 열지 말고 \`cp\`로 복사 → \`import\`. 구조는 A부 §2 |
| 2 | 기본 화면을 캘린더로 만든다 | 기본은 **사업 실적** |
| 3 | 판매 현황 목록을 \`opsMaster\`(${counts.opsMaster}건)로 만든다 | \`programs\` 기준으로 만들어라. opsMaster는 구 마스터라 현재 공연이 빠진다 |
| 4 | 연간 실적을 못 찾아 빈 화면으로 둔다 | JSON \`annual\` 키를 써라(years·cats·total·grand) |
| 5 | 엑셀 시리얼 날짜 변환 코드를 넣는다 | 이미 \`"2026-05-23"\`로 변환돼 있다. 그대로 파싱 |
| 6 | 팔레트 밖 색을 쓴다(shadcn 기본 색 등) | \`@theme\` 변수만 참조 |
| 7 | 점유율을 "좌석 점유율"로 표기 | **목표 달성률**(100% 초과 가능) |
| 8 | 데이터가 없는 프로그램을 목록에서 빼버린다 | 빼지 말고 "오픈 예정"으로 표기 |
| 9 | 더미·예시 데이터를 넣는다 | 전부 JSON에서만 |
| 10 | 새 라이브러리를 잔뜩 설치한다 | 이미 있는 React 19 + Tailwind 4 + shadcn/ui로 먼저 시도 |

---

**마지막**: 다 만들었으면 D-3 형식으로 보고해라. 미완성 항목이 있으면 숨기지 말고 그대로 적어라.
`;

writeFileSync(OUT, md, 'utf8');
const outKb = (Buffer.byteLength(md) / 1024).toFixed(0);
console.log(`✅ 이관본/첨부/마스터명세.md — ${outKb}KB (A부 기능 + B부 실측 + C부 7단계 + D부 검증)`);
console.log(`   검증 기준: records ${counts.records} · KPI ${(totInwon.sum || 0).toLocaleString()} · 누적 ${(annual.grand || 0).toLocaleString()}`);
