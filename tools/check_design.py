#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
디자인 기틀 게이트 — 디자인 드리프트 3층 방어의 공용 검사기 (stdlib only, 260703)

검사 4종 (baseline 래칫 — "지금보다 나빠지지만 마라"):
  ① raw hex 총량: index.html ≤ BASE_HEX_INDEX, signage/*.html 합 ≤ BASE_HEX_SIGNAGE
     (새 색은 반드시 :root 토큰으로. 기존 raw hex 청산은 언제든 환영 → baseline 하향 갱신)
  ② :root 블록 수: index.html == 2, signage == 0 (블록 추가/삭제 = 구조 변경 → 운영자 승인 필요)
  ③ 새 고아 토큰 금지: :root에 정의됐는데 var() 사용 0회인 토큰이 baseline 13개 밖에서 늘면 실패
  ④ 새 이중 정의 금지: 같은 토큰이 두 :root 블록에 중복 정의되면 실패 (--kakao 1건만 기존 허용)

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
BASE_HEX_INDEX = 1824
BASE_HEX_SIGNAGE = 2          # signage/index.html: #000·#333
BASE_ROOT_INDEX = 2           # L14(기본 팔레트 32토큰) + L1322(뉴트럴·z·c1~c6 26토큰)
BASE_ROOT_SIGNAGE = 0
# 고아 토큰(정의만 있고 var() 사용 0회) — 청산은 운영자 판단 대기(지시서 260703 §6-4)
# 260704: --muted 청산(홍보 지도 대시보드 피드 빈상태에서 사용 시작) 13→12
BASE_ORPHANS = {
    '--blog', '--border2', '--c1', '--etc', '--insta', '--kakao',
    '--surface', '--youtube', '--z-confirm', '--z-nav', '--z-sticky', '--z-toast',
}
# 이중 정의 — :root L27 #C8900A vs L1331 #F5B400(CSS는 후자 승). 청산 대기(지시서 §6-1)
BASE_DUP = {'--kakao'}

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

    # ── 리포트 ────────────────────────────────────────────────────────────
    if fails:
        print('✗ 디자인 기틀 위반 %d건 — docs/디자인기틀.md 참조' % len(fails), file=sys.stderr)
        for f_ in fails:
            print('  - ' + f_, file=sys.stderr)
        print('  (정당한 변경이면: 운영자 승인 → tools/check_design.py baseline 갱신+사유 주석)', file=sys.stderr)
        return 1

    print('✓ 디자인 기틀 통과 — raw hex index=%d/%d signage=%d/%d · :root %d/%d · 고아 %d(기존) · 이중정의 %d(기존)'
          % (hex_idx, BASE_HEX_INDEX, hex_sig, BASE_HEX_SIGNAGE,
             len(roots_idx), n_root_sig, len(orphans), len(dups)))
    for i in infos:
        print('  ℹ ' + i)
    return 0


if __name__ == '__main__':
    sys.exit(main())
