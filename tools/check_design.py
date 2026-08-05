#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
디자인 기틀 게이트 — 디자인 드리프트 3층 방어의 공용 검사기 (stdlib only, 260703)

검사 6종 (baseline 래칫 — "지금보다 나빠지지만 마라"):
  ① raw hex 총량: index.html ≤ BASE_HEX_INDEX, signage/*.html 합 ≤ BASE_HEX_SIGNAGE
     (새 색은 반드시 :root 토큰으로. 기존 raw hex 청산은 언제든 환영 → baseline 하향 갱신)
  ② :root 블록 수: index.html == 2, signage == 0 (블록 추가/삭제 = 구조 변경 → 운영자 승인 필요)
  ③ 새 고아 토큰 금지: :root에 정의됐는데 var() 사용 0회인 토큰이 baseline 13개 밖에서 늘면 실패
  ④ 새 이중 정의 금지: 같은 토큰이 두 :root 블록에 중복 정의되면 실패 (--kakao 1건만 기존 허용)
  ⑤ 텍스트 대비(WCAG AA 4.5:1): 같은 {} 블록에 color·background가 **둘 다 리터럴 hex**인 쌍만 채점.
     4.5:1 미달 쌍이 BASE_LOWCONTRAST를 넘으면 실패. (260804 impeccable 8인 평의회 선별이식 ②)
  ⑥ 레이아웃 유발 transition(잰크): transition 값에 width/height/padding/margin이 들어간 선언 수가
     BASE_LAYOUT_TRANS를 넘으면 실패. (같은 평의회 선별이식 ①)

baseline 갱신 규칙: 실측치가 늘어난 정당한 사유(PR·운영자 승인)가 있으면 숫자를 갱신하고
반드시 아래 주석에 사유를 남긴다. 원인 불명 증가는 운영자 보고 후 진행.

사용: python3 tools/check_design.py   (exit 0=통과 / 1=위반)
호출처: .claude/hooks/design_gate.py(편집 직후) · .githooks/pre-commit(커밋 시)
"""
import glob
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ── baseline ──────────────────────────────────────────────────────────────
# index raw hex: 1797 → 1827 = PR#80 로딩 성능(798da91)+배치 위저드 시리즈(febb8d9~3e09e94) +30 (260703 재실측)
# 1827 → 1825 = PR#93 이메일 재설정 -1 + 홍보 현황 지도 대시보드(플랫폼현황 빈상태 #888 제거) -1 (260704 청산)
# 1825 → 1822 = 홍보 지도 v4 — 플랫폼 트리 인라인 #eee·#fafafa 토큰화 -2, 사이니지 관리 버튼 제거(#fff) -1 (260704 청산)
# 1822 → 1823 = PWA 설치 지원(운영자 요청 260704) — <meta name="theme-color"> +1 (HTML 스펙상 리터럴 필수, var() 불가)
# 1823 → 1824 = PR#96(사용자 등록 이메일 후속, 구 baseline 1827 기준 통과분) rebase 이월 — #aaa +1 (260704)
# 1824 → 1758 = 유일 레드 확립(운영자 확정 260704: B=--danger 유일 레드·A=--danger-btn 위험 버튼 전용)
#               — #E24B4A 44→1(-43)·#e5484d 32→9(-23, 토큰정의 2 + 차트 var() 불가 리터럴 8 잔존) 청산
# 1758 → 1745 = 팔레트 통폐합(운영자 확정 260705): :root 토큰 var() 별칭화로 고유 hex 축소(-13).
#               danger→var(danger-btn)·kakao→var(c6)·blog→var(green)·etc→var(c5)·past-text→var(muted)
#               ·surface→var(glass-surface)·glass-border/glass-bd→var(glass)·nm-bg→var(past-bg)·off-bg→var(border2)
#               ("여기서 색 더 안 만듦" = 팔레트 폐쇄 확정. 대표 토큰만 raw 값 보유)
# 1745 → 1661 = 앱 전체 글래스 통일(운영자 확정 "다 앱내에도 통일"): 칩/버튼 resting을 pm-fbtn 글래스 톤
#               (var(--glass-surface)+blur(8px)+var(--glass-bd)+var(--glass-shadow)+var(--text))으로 통일.
#               명명 16종 + ana-xbtn·adm-btn·m-btn.cancel + 인라인(닫기원형·모달푸터·페이지네이션·뷰모드·사이니지) 치환으로
#               raw hex -84(#fff·#ddd·#e0e0e0·#666·#888 등 → 토큰). select류(ana-sel 등)는 non-glass로 통일 유지.
# 1661 → 1658 = 완결성 재검증 반영: 일정 페이지네이션 숫자 버튼(inactive)도 형제 이전/다음과 동일 글래스 톤으로 통일(-3)
# 1658 → 1652 = nav 다크 글래스 전환(운영자 260705 "검정으로 가독성"): nav-btn·hover잔여 #777, nav-sub·msgbox·icon-btn #666, welcome-msg #888 → 흰색 alpha 변주·토큰(-6)
# 1652 → 1649 = 캘린더 헤더 밴드 전경색 제거(운영자 260705): .hdr의 옛 불투명 --bg 그라데이션 리터럴 3개(#FDF6F3·#F0EBF5·#EBF0F8) → transparent(-3)
# 1649 → 1646 = Beta 뱃지 제거(#1a1a1a·#fff) + SNS 칩 상시 나열 → SNS 필터 팝 접기(#fff 상쇄·#999 +1, 그룹 색은 _SNS_GROUPS 단일 정의 공유) 순감 -3 (운영자 260705)
# 1646 → 1642 = 간결화(운영자 260706 "최대한 간결하게"): 날씨 위젯 제거(인라인 #eef2ff·#f7f9ff·#e7eaf6) + 오늘 요일칸 코발트 채움→글자+살몬 언더바(#fff 제거) -4
# 1642 → 1641 = 판매 현황 갈음(운영자 260708): 분석 보드 헤더 "· beta"(#aaa) 문자열 제거 -1
# 1641 → 1640 = 분석 보드 카테고리 탭 폐지 → 공연·전시·교육 스택(운영자 260710): 구 전시 전체화면 로더(#888) 제거 -1
# 1640 → 1635 = 스택 전환 잔여 청산(분신술 260710 감사4): 참조 0 된 .ana-tabs/.ana-tab CSS 제거(#eee·#999·#cdcdd6·#fff·#c9c9d4) -5
# 1635 → 1634 = 콘텐츠 제작 드롭다운 안내 문구 삭제(운영자 260710)로 #c4c4c4 -1
# 1634 → 1631 = 홍보종료일 입력칸 폐지(판매종료일 통합, 운영자 260710) — 제거된 인라인 스타일의 raw hex 3개 청산(#f0f0f0·#888 등) + 판매종료일 라벨 #888→var(--accent) 전환
# 1631 → 1629 = 상단 메뉴 「상품 등록 및 홍보 신청」→「상품 등록·변경」+「홍보 신청·확인」 2개 분리(운영자 260711) — 신규 드롭다운 빌드 함수(_prodregMenuBuild·_promoMenuBuild) 색을 var(--text)/var(--dim) 계승, 구 _scheduleMenuBuild의 #333·#999 raw 2개 청산
# 1629 → 1627 = 영상 편집기 3분류 신설(운영자 260711) — 신규 ve-* 코드는 hex 0(전부 토큰·기존 알파 변주), 콘텐츠 제작 드롭다운 재작성 때 기존 #999·#333 → var(--dim)/var(--text) 청산 -2 (메뉴 분리 -2와 별개 인스턴스, rebase 합산 실측 1627)
# 1627 → 1610 = 죽은코드 청산(운영자 260717 "다 지우셈") — _promptSuperSecret 인증 트리오·nb 코멘트/톤 死클러스터·_nbAssembleDraft 폴백 155줄 삭제, 각 함수 HTML 문자열 내 raw hex 동반 제거 -17(헤드리스 로그인 렌더·회귀 0 실측)
# 1610 → 1607 = 보드 로딩 빔 스윕 통일(운영자 260723 "판매현황 빔 모션 사업현황·이런부분에도") — 판매/분석/연간실적 보드 로딩 문구 color:#888 → var(--accent) 계승 -3(캘린더·판매레일 .sk-sweep 레퍼런스 100% 이식 부수 청산)
# 1607 → 1605 = 전시 집계 골격 상시화(운영자 260729 "1일차도 집계 다 생기게") — 「데이터 부족」(#ccc)·「추이 데이터 부족」(#bbb) 텍스트 폐지 → 속빈 원 골격(토큰만) 대체 -2
# 1605 → 1590 = 예술성/사업성 축 전면 폐지(운영자 260803 "일괄 없애기") — 수익성별 버블 패널·목표차트 좌우 분할·매트릭스·KPI 2장·성격 pill/연필 삭제로 그 HTML 문자열 안 raw hex 15개 동반 청산(#E5484D·#4A4DE7 페어 등 · 신규 반입 0)
# 1590 → 1578 = 캘린더 일괄 완료(운영자 260804) — 완료 결과 입력창을 단건·일괄 공용 `_completeResultPrompt`로
#               뽑으며 그 안 인라인 리터럴을 토큰화 -12(#fff·#888·#555×3·#eee×3·#f5f5f5·#666·rgba 백드롭 → --surface-solid
#               ·--dim·--neutral-text·--border·--backdrop, 버튼 2종은 정본 `.btn` 조합으로 교체). 신규 반입 0.
BASE_HEX_INDEX = 1578
BASE_HEX_SIGNAGE = 2          # signage/index.html: #000·#333
BASE_ROOT_INDEX = 2           # L46(기본 팔레트 34토큰) + L1653(뉴트럴·z·c1~c6 27토큰) — 260803 실측 정정(구 표기 L14/32·L1322/26은 위치·개수 모두 stale)
BASE_ROOT_SIGNAGE = 0
# 고아 토큰(정의만 있고 var() 사용 0회) — 청산은 운영자 판단 대기(지시서 260703 §6-4)
# 260704: --muted 청산(홍보 지도 대시보드 피드 빈상태에서 사용 시작) 13→12
# 260705: --off-bg 고아化 — 캘린더 일요일 회색 톤 제거(운영자 확정 조합)로 유일 사용처 소멸, 재활성 대비 동결 보존 +1
BASE_ORPHANS = {
    '--blog', '--border2', '--c1', '--etc', '--insta', '--kakao',
    '--surface', '--youtube', '--z-confirm', '--z-nav', '--z-sticky', '--z-toast',
    '--off-bg',
}
# 이중 정의 — :root L27 #C8900A vs L1331 #F5B400(CSS는 후자 승). 청산 대기(지시서 §6-1)
BASE_DUP = {'--kakao'}

# ── ⑤ 텍스트 대비(WCAG AA) · ⑥ 잰크 전이 — 260804 「impeccable 적용점」 8인 평의회 선별이식 ─────────
# 왜 = 이 레포 게이트·훅 전체를 grep해도 `contrast|wcag|4.5|luminance`가 **0히트**였다. ①~④는 전부
#   「색이 토큰으로 정의됐나」를 묻고 「그 색을 사람이 읽을 수 있나」는 한 번도 안 묻는다 — 축 자체가 없었다.
#   실측 = 전경 토큰 `--dim #888` 3.32:1(210곳)·`--muted #bbb` 1.80:1(58곳)·`--peach-text #D88455` 2.67:1,
#   유채 채움 위 흰 글자 `#fff on --kakao #F5B400` = 1.84:1. 지금은 게이트가 illegibility를 보증하고 있다.
# 임계값 원천 = WCAG 2.x AA(본문 4.5:1) = 국제 표준 상수 · 디자인 토큰 아님 = 「새 값 창작 금지」 무저촉.
#   판정 알고리즘은 외부 디텍터 pbakaus/impeccable `cli/engine/rules/checks.mjs` `low-contrast` 룰과 같은 축이나
#   **그쪽 설치·훅·스킬·23커맨드는 미도입** — 평의회 실측상 59룰 통째 적용 시 두 레포 경고 690건 중 574건(83.2%)이
#   글래스(`.pm-fbtn` 운영자 260704 확정)·브랜드 인디고(`--accent` = 기틀 §0① 불변) 등 **정본**이라 위양성이고,
#   colorize/bolder/delight/overdrive 커맨드는 디자인 창작 = 지침 [3] 정면 위반이다.
# 위양성 3겹 = ⓐ **같은 {} 블록에 둘 다 리터럴 hex**인 쌍만(공존 확정분만 채점 = 토큰 크로스곱 추정 배제)
#   ⓑ **하드 0 금지 = 래칫** — pre-commit이 staged 무관하게 무조건 도는 구조라 「위반 0」 기준은 docs 커밋까지 막는다
#   ⓒ **signage 제외** — 사이니지는 관객용 대형 디스플레이라 기준이 다르고, 실측상 같은블록 리터럴 쌍이 0이며
#      `.status`(#333 · opacity:.3)는 관객에게 안 보이게 한 **의도적** 디버그 각인이다(운영자 판단 대기 = 대상 밖).
# 청산 방향 = 미달 쌍은 전부 raw hex라 검사 ①(raw hex 총량)이 이미 줄이라고 미는 그 부채다 — 두 검사가 같은 방향.
# 260804 실측 스냅샷 — 줄이면 그만큼 하향 갱신하라(래칫 · 사유 주석 필수는 ①과 동문)
BASE_LOWCONTRAST_INDEX = 49   # index.html 같은블록 리터럴 쌍 95 중 4.5:1 미달 49
                              # 최악 = #ddd on #fff 1.36 · #C08070 on #F0C4B8 2.03 · #9aa3b2 on #eef0f5 2.23 · #fff on #22c55e 2.28
BASE_LAYOUT_TRANS_INDEX = 15  # index.html — FLIP 모프 4 · 아코디언 2 · 게이지 폭 5 · 기타 4(주석 줄 제외)
BASE_LAYOUT_TRANS_SIGNAGE = 0 # signage — 현재 0(잰크는 사이니지도 동일 기준 = 대형 화면일수록 리플로가 비싸다)

# ── ⑦ 정본 컴포넌트 부품 일치 — 260805-14 신설 ────────────────────────────────
# 왜 = ①~⑥은 전부 「색·수치가 토큰인가」 축이다. 「정본 컴포넌트가 정본 부품으로 조립됐나」는
#   아무도 안 물었다. 실제 사고(운영자 260805 지적): 「AI 홍보·점검」 모달의 닫기 X가 앱의 나머지
#   52곳(`✕` U+2715)과 달리 `×`(U+00D7 곱셈기호)로 나갔는데 **①~⑥ 전건 통과**했다 —
#   색(--accent)·배경·자리(우변21/상변29)·대비가 전부 정본이었으니 색 축 게이트엔 걸릴 게 없다.
#   `.modal-x`는 CSS(클래스)만 정본이고 **내용(글자)은 52곳에 문자열로 복붙**돼 SSOT가 없었다 = 구멍.
#   유입 경로도 실측됨: 260805-11 세션이 실측 하네스(`tools/scratch/probe_modalx_canon.mjs`)에서
#   대조군 버튼을 `&times;`로 **다시 타이핑**했고, 그 글자가 그대로 실코드로 새어들었다.
# 판정 = ⓐ 닫기 X 글자 하드 0(정본 1종뿐 · 위반 시 차단) ⓑ aria-label 누락은 래칫(기존 22건 동결).
#   ⓐ가 하드 0인 근거 = 고칠 대상이 「정본 글자로 바꾼다」 하나뿐이라 청산 비용이 0이다(색 부채와 다름).
#   ⚠ 대상 = `class="modal-x"` 버튼 중 **닫기**(title/aria-label에 '닫기')만. 같은 부품을 모양으로
#   재사용하는 ↓(저장)·↗(새 창)·‹(목록으로)는 제외 — 그것들은 뜻이 다른 버튼이다.
#   ⚠ `.bp-x`(예약 프로세스·에니어그램 2곳 `×`)는 **다른 클래스**라 대상 밖 — 자기들끼리는 일치한다.
#      기틀 §2에 없는 부품이라 정본 승격·통합 여부는 운영자 판단(§6 부채 축).
MODALX_CLOSE_GLYPH = '✕'  # ✕ — 기틀 §2 컴포넌트 7 「모달」 정본 글자(앱 실측 만장일치)
BASE_MODALX_NO_ARIA = 22       # aria-label 없는 .modal-x — 래칫(신규 누락만 차단 · 청산은 별건)
MODALX_RE = re.compile(r'<button\b[^>]*\bclass="modal-x[^"]*"[^>]*>(.*?)</button>', re.S)
MODALX_ATTR_RE = re.compile(r'\b(title|aria-label)="([^"]*)"')
TAG_RE = re.compile(r'<[^>]*>')

CONTRAST_MIN = 4.5            # WCAG 2.x AA 본문 기준(국제 표준 상수)
BLOCK_RE = re.compile(r'\{([^{}]*)\}')
FG_RE = re.compile(r'(?<!-)\bcolor\s*:\s*(#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b)')
BG_RE = re.compile(r'\bbackground(?:-color)?\s*:\s*(#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b)')
TRANS_RE = re.compile(r'transition(?:-property)?\s*:\s*([^;{}"\'<>]+)')
TRANS_PROP_RE = re.compile(r'\b(?:max-|min-)?(?:width|height|padding|margin)\b')


def _srgb_lum(hexstr):
    """WCAG 상대휘도 — sRGB 채널을 선형화해 가중합."""
    h = hexstr.lstrip('#')
    if len(h) == 3:
        h = ''.join(c * 2 for c in h)
    ch = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255.0
        ch.append(c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4)
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]


def _contrast(fg, bg):
    a, b = _srgb_lum(fg), _srgb_lum(bg)
    hi, lo = max(a, b), min(a, b)
    return (hi + 0.05) / (lo + 0.05)


def _lowcontrast_pairs(src):
    """같은 {} 블록에 color·background가 둘 다 리터럴 hex인 쌍 중 AA 미달분 → [(비율, fg, bg, 줄)]."""
    out = []
    for m in BLOCK_RE.finditer(src):
        blk = m.group(1)
        fg, bg = FG_RE.search(blk), BG_RE.search(blk)
        if not (fg and bg):
            continue
        ratio = _contrast(fg.group(1), bg.group(1))
        if ratio < CONTRAST_MIN:
            out.append((ratio, fg.group(1), bg.group(1), src.count('\n', 0, m.start()) + 1))
    return out


def _modalx_parts(src):
    """정본 `.modal-x` 조립 실측 → (닫기인데 글자가 정본이 아닌 [(줄, 글자, 코드포인트)], aria-label 누락 수)."""
    bad, no_aria = [], 0
    for m in MODALX_RE.finditer(src):
        head = m.group(0)[:m.group(0).find('>') + 1]
        attrs = dict(MODALX_ATTR_RE.findall(head))
        if 'aria-label' not in attrs:
            no_aria += 1
        label = TAG_RE.sub('', m.group(1)).strip()
        is_close = '닫기' in (attrs.get('title', '') + attrs.get('aria-label', ''))
        if is_close and label != MODALX_CLOSE_GLYPH:
            code = ' '.join('U+%04X' % ord(c) for c in label) or '(빈 라벨)'
            bad.append((src.count('\n', 0, m.start()) + 1, label, code))
    return bad, no_aria


def _layout_transitions(src):
    """레이아웃 유발 transition 선언 줄번호(주석 줄 제외)."""
    lines = src.splitlines()
    out = []
    for m in TRANS_RE.finditer(src):
        if not TRANS_PROP_RE.search(m.group(1)):
            continue
        ln = src.count('\n', 0, m.start()) + 1
        head = lines[ln - 1].lstrip() if ln <= len(lines) else ''
        if head.startswith(('//', '*', '/*')):
            continue
        out.append(ln)
    return out

# raw hex: #3/4/6/8자리, HTML 엔티티(&#...)·단어 연속은 제외. 대소문자 무관(카운트는 normalize)
HEX_RE = re.compile(r'(?<![&\w])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})\b')
ROOT_RE = re.compile(r':root\s*\{[^}]*\}')
TOKEN_DEF_RE = re.compile(r'(--[\w-]+)\s*:')
TOKEN_USE_RE = re.compile(r'var\(\s*(--[\w-]+)')


def _read(path):
    with open(path, encoding='utf-8') as f:
        return f.read()


def main():
    fails = []
    infos = []

    idx_path = os.path.join(ROOT, 'index.html')
    if not os.path.isfile(idx_path):
        print('[check_design] index.html 없음 — repo 루트가 아님?', file=sys.stderr)
        return 1
    idx = _read(idx_path)

    sig_paths = sorted(glob.glob(os.path.join(ROOT, 'signage', '*.html')))
    sig_all = ''.join(_read(p) for p in sig_paths)

    # ① raw hex 총량
    hex_idx = len(HEX_RE.findall(idx))
    hex_sig = len(HEX_RE.findall(sig_all))
    if hex_idx > BASE_HEX_INDEX:
        fails.append('raw hex 증가(index.html): %d → %d (+%d). 새 색은 :root 토큰으로 정의해 var()로 써라.'
                     % (BASE_HEX_INDEX, hex_idx, hex_idx - BASE_HEX_INDEX))
    elif hex_idx < BASE_HEX_INDEX:
        infos.append('raw hex 감소(index.html): %d → %d — 청산 성과. baseline 하향 갱신 권장(사유 주석 필수).'
                     % (BASE_HEX_INDEX, hex_idx))
    if hex_sig > BASE_HEX_SIGNAGE:
        fails.append('raw hex 증가(signage): %d → %d. signage도 동일 규칙.' % (BASE_HEX_SIGNAGE, hex_sig))

    # ② :root 블록 수
    roots_idx = ROOT_RE.findall(idx)
    n_root_sig = len(ROOT_RE.findall(sig_all))
    if len(roots_idx) != BASE_ROOT_INDEX:
        fails.append(':root 블록 수 변경(index.html): %d → %d. 블록 추가/삭제는 운영자 승인 필요.'
                     % (BASE_ROOT_INDEX, len(roots_idx)))
    if n_root_sig != BASE_ROOT_SIGNAGE:
        fails.append(':root 블록 수 변경(signage): %d → %d.' % (BASE_ROOT_SIGNAGE, n_root_sig))

    # ③④ 토큰 정의/사용 분석 (index.html의 :root 기준)
    defs = {}
    for blk in roots_idx:
        for tok in TOKEN_DEF_RE.findall(blk):
            defs[tok] = defs.get(tok, 0) + 1
    used = set(TOKEN_USE_RE.findall(idx))

    orphans = {t for t in defs if t not in used}
    new_orphans = sorted(orphans - BASE_ORPHANS)
    if new_orphans:
        fails.append('새 고아 토큰(정의만 있고 미사용): %s — 토큰을 추가했으면 실제로 var()로 써라.'
                     % ', '.join(new_orphans))

    dups = {t for t, c in defs.items() if c > 1}
    new_dups = sorted(dups - BASE_DUP)
    if new_dups:
        fails.append('새 이중 정의 토큰: %s — 같은 토큰을 두 :root에 정의하면 어느 값이 이길지 모른다.'
                     % ', '.join(new_dups))

    # ⑤ 텍스트 대비(WCAG AA 4.5:1) — index.html만(사이니지 = 기준 상이·대상 밖 · 위 주석 ⓒ)
    lc = _lowcontrast_pairs(idx)
    if len(lc) > BASE_LOWCONTRAST_INDEX:
        worst = ', '.join('%s on %s %.2f:1(L%d)' % (f, b, r, l) for r, f, b, l in sorted(lc)[:4])
        fails.append('대비 AA(4.5:1) 미달 쌍 증가(index.html): %d → %d (+%d). 현행 최악 4건(방금 추가분은 diff로 대조) = %s. '
                     '전경·배경 중 하나를 정본 토큰(--text 15.96:1 · --neutral-text 4.90:1 · --accent 5.60:1)으로 올려라.'
                     % (BASE_LOWCONTRAST_INDEX, len(lc), len(lc) - BASE_LOWCONTRAST_INDEX, worst))
    elif len(lc) < BASE_LOWCONTRAST_INDEX:
        infos.append('대비 AA 미달 쌍 감소: %d → %d — 청산 성과. BASE_LOWCONTRAST_INDEX 하향 갱신 권장(사유 주석 필수).'
                     % (BASE_LOWCONTRAST_INDEX, len(lc)))

    # ⑥ 레이아웃 유발 transition(잰크) — 프레임마다 리플로. transform/opacity는 합성 전용이라 무비용
    lt_idx, lt_sig = _layout_transitions(idx), _layout_transitions(sig_all)
    if len(lt_idx) > BASE_LAYOUT_TRANS_INDEX:
        fails.append('잰크 전이 증가(index.html): %d → %d (+%d). transition은 transform/opacity로 — '
                     'width/height/padding/margin 전이는 프레임마다 리플로를 강제한다. '
                     '현행 전건 줄(이 중 방금 추가분을 diff로 대조): %s'
                     % (BASE_LAYOUT_TRANS_INDEX, len(lt_idx), len(lt_idx) - BASE_LAYOUT_TRANS_INDEX,
                        ','.join(map(str, lt_idx))))
    elif len(lt_idx) < BASE_LAYOUT_TRANS_INDEX:
        infos.append('잰크 전이 감소(index.html): %d → %d — 청산 성과. BASE_LAYOUT_TRANS_INDEX 하향 갱신 권장.'
                     % (BASE_LAYOUT_TRANS_INDEX, len(lt_idx)))
    if len(lt_sig) > BASE_LAYOUT_TRANS_SIGNAGE:
        fails.append('잰크 전이 증가(signage): %d → %d. 사이니지도 동일 기준(대형 화면일수록 리플로가 비싸다).'
                     % (BASE_LAYOUT_TRANS_SIGNAGE, len(lt_sig)))

    # ⑦ 정본 컴포넌트 부품 일치 — 색이 아니라 「부품이 정본인가」(위 주석 참조)
    mx_bad, mx_no_aria = _modalx_parts(idx)
    if mx_bad:
        detail = ', '.join('L%d 「%s」(%s)' % (ln, g, c) for ln, g, c in mx_bad)
        fails.append('모달 닫기 X 글자가 정본이 아님: %s — 정본은 「%s」(U+2715) 하나뿐이다(앱 전건 일치). '
                     '기틀 §2 컴포넌트 7 참조. ⚠ 실측 하네스·시안에서 정본 부품을 손으로 다시 타이핑하지 마라 '
                     '— 이 위반의 유입 경로가 정확히 그것이었다(`&times;` 대조군 → 실코드).'
                     % (detail, MODALX_CLOSE_GLYPH))
    if mx_no_aria > BASE_MODALX_NO_ARIA:
        fails.append('.modal-x aria-label 누락 증가: %d → %d (+%d). 아이콘 전용 버튼은 글자가 스크린리더에 '
                     '안 읽힌다 — `title="닫기" aria-label="닫기"` 한 벌로 붙여라.'
                     % (BASE_MODALX_NO_ARIA, mx_no_aria, mx_no_aria - BASE_MODALX_NO_ARIA))
    elif mx_no_aria < BASE_MODALX_NO_ARIA:
        infos.append('.modal-x aria-label 누락 감소: %d → %d — 청산 성과. BASE_MODALX_NO_ARIA 하향 갱신 권장(사유 주석 필수).'
                     % (BASE_MODALX_NO_ARIA, mx_no_aria))

    # ── 리포트 ────────────────────────────────────────────────────────────
    if fails:
        print('✗ 디자인 기틀 위반 %d건 — docs/디자인기틀.md 참조' % len(fails), file=sys.stderr)
        for f_ in fails:
            print('  - ' + f_, file=sys.stderr)
        print('  (정당한 변경이면: 운영자 승인 → tools/check_design.py baseline 갱신+사유 주석)', file=sys.stderr)
        return 1

    print('✓ 디자인 기틀 통과 — raw hex index=%d/%d signage=%d/%d · :root %d/%d · 고아 %d(기존) · 이중정의 %d(기존) '
          '· 대비 AA미달 %d/%d · 잰크 전이 %d/%d(sig %d/%d) · 모달X 글자 %d위반 · X aria누락 %d/%d'
          % (hex_idx, BASE_HEX_INDEX, hex_sig, BASE_HEX_SIGNAGE,
             len(roots_idx), n_root_sig, len(orphans), len(dups),
             len(lc), BASE_LOWCONTRAST_INDEX,
             len(lt_idx), BASE_LAYOUT_TRANS_INDEX, len(lt_sig), BASE_LAYOUT_TRANS_SIGNAGE,
             len(mx_bad), mx_no_aria, BASE_MODALX_NO_ARIA))
    for i in infos:
        print('  ℹ ' + i)
    return 0


if __name__ == '__main__':
    sys.exit(main())
