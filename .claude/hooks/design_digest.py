#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
디자인 기틀 다이제스트 주입 훅 (260703, 운영자 승인)

두 모드:
  · SessionStart(startup|resume|compact): 디자인 계약 5줄 + :root 2블록 토큰 라이브 추출을
    컨텍스트에 주입 — 매 세션 새 Claude가 기틀을 모른 채 UI를 만지는 사고 차단.
  · --if-ui-prompt (UserPromptSubmit): 프롬프트에 UI 어휘가 있을 때만 1줄 리마인더 주입.

절대 세션을 막지 않는다 — 어떤 예외든 삼키고 exit 0.
"""
import json
import os
import re
import subprocess
import sys


def _root():
    r = os.environ.get('CLAUDE_PROJECT_DIR')
    if r and os.path.isfile(os.path.join(r, 'index.html')):
        return os.path.abspath(r)
    # 폴백: 이 파일 위치 기준 (.claude/hooks/ → repo 루트)
    return os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


CONTRACT = (
    '🎨 [디자인 기틀 계약 — yeulmaru-promo]\n'
    '0) 제1 절대명령(CLAUDE.md 최상단): 모든 디자인 = 루트 토큰 「계승(var()) or 운영자 승인 갱신」 둘뿐 — 세 번째 없음. '
    '색은 팔레트 폐쇄형: 기틀 §0 브랜드 컬러 확립본의 컬러칩이 전부 — 칩 밖 색 반입·유사색 창작 = 위반'
    '(예외는 같은 토큰 alpha 변주·운영자 승인 리터럴뿐, §0·§3.5).\n'
    '0.5) 규칙2 = 정본 위치 인덱스(절대 준수): docs/절대명령2_정본인덱스.md — 값·규칙·컴포넌트·확립본·게이트의 '
    '위치 SSOT. 새 정본 문서/확립본은 그 표에 등재해야 정본(미등재 = 참고 자료).\n'
    '1) SSOT = docs/디자인기틀.md — UI 작업 전 필독. 기틀에 있는 형태(토큰·정본 컴포넌트 11종)만 구현.\n'
    '2) 새 raw hex 금지(총량 baseline 동결) — 새 색은 :root 토큰으로만. 새 :root 블록·고아 토큰·이중 정의 금지.\n'
    '3) 기틀에 없는 값/형태가 필요하면 작업을 멈추고 운영자에게 질문(필요 이유 + 가장 가까운 기존 후보 제시). 임의 창작 금지.\n'
    '4) 게이트: index.html·signage/*.html 편집 직후와 커밋 시 tools/check_design.py가 자동 검사(위반=차단). 수동: python3 tools/check_design.py\n'
    '5) 운영자 승인분은 즉시 기틀 편입: :root 토큰 추가 → docs/디자인기틀.md 등재 → check_design baseline 갱신+사유 주석.'
)

UI_VOCAB = re.compile(
    r'색|컬러|색상|버튼|디자인|스타일|테마|폰트|아이콘|레이아웃|모달|팝업|칩|토스트|배지|뱃지|'
    r'그라데이션|둥글|라운드|그림자|간격|여백|정렬|반응형|다크모드|호버|애니메이션|UI|UX|'
    r'css|style|color|hex|palette|token|button|modal|chip|toast|badge|font|icon|layout|'
    r'radius|shadow|border|margin|padding|hover|gradient', re.I)


def _extract_tokens(root):
    try:
        with open(os.path.join(root, 'index.html'), encoding='utf-8') as f:
            src = f.read()
        blocks = re.findall(r':root\s*\{[^}]*\}', src)
        out = []
        for i, blk in enumerate(blocks):
            line = src[:src.find(blk)].count('\n') + 1
            toks = re.findall(r'(--[\w-]+)\s*:\s*([^;]+);', blk)
            out.append('· :root 블록%d (index.html L%d, %d토큰)' % (i + 1, line, len(toks)))
            for name, val in toks:
                out.append('  %s: %s' % (name, val.strip()))
        return '\n'.join(out)
    except Exception:
        return '(토큰 추출 실패 — index.html에서 :root 직접 확인)'


def main():
    try:
        root = _root()

        if '--if-ui-prompt' in sys.argv:
            # UserPromptSubmit: UI 어휘 감지 시에만 리마인더
            try:
                data = json.load(sys.stdin)
            except Exception:
                data = {}
            prompt = str(data.get('prompt', ''))
            if UI_VOCAB.search(prompt):
                print('🎨 UI 작업 감지 — 디자인 기틀 준수: docs/디자인기틀.md의 토큰·정본 컴포넌트만 사용, '
                      '새 raw hex/새 :root/새 토큰 금지, 없는 형태는 운영자에게 질문. '
                      '(게이트: tools/check_design.py 자동 검사) '
                      '· 정본 위치 인덱스(규칙2·절대 준수) = docs/절대명령2_정본인덱스.md')
            return 0

        # SessionStart 분기
        # pre-commit 자동 활성화(셋업 제로·멱등) — git이 repo 내 훅을 자동 활성화 안 하므로 여기서 처리(운영자 260703)
        try:
            if os.path.isdir(os.path.join(root, '.githooks')):
                subprocess.run(['git', '-C', root, 'config', 'core.hooksPath', '.githooks'],
                               capture_output=True, timeout=5)
        except Exception:
            pass

        print(CONTRACT)
        print()
        print(_extract_tokens(root))
        return 0
    except Exception:
        return 0  # 다이제스트 실패가 세션을 막으면 안 됨


if __name__ == '__main__':
    sys.exit(main())
