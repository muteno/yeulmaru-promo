#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
디자인 편집 게이트 훅 (PostToolUse: Edit|Write, 260703, 운영자 승인)

index.html 또는 signage/*.html 편집 직후 tools/check_design.py를 실행.
위반이면 exit 2 + stderr — Claude가 같은 턴에 보고 자가수정하도록 유도.
디자인 무관 파일이면 조용히 통과(exit 0). 훅 자체 오류도 세션을 막지 않는다(exit 0).
"""
import json
import os
import subprocess
import sys


def _root():
    r = os.environ.get('CLAUDE_PROJECT_DIR')
    if r and os.path.isfile(os.path.join(r, 'index.html')):
        return os.path.abspath(r)
    return os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def _is_design_file(path, root):
    try:
        ap = os.path.abspath(path)
        if ap == os.path.join(root, 'index.html'):
            return True
        sig = os.path.join(root, 'signage') + os.sep
        return ap.startswith(sig) and ap.endswith('.html')
    except Exception:
        return False


def main():
    try:
        data = json.load(sys.stdin)
    except Exception:
        return 0
    try:
        root = _root()
        fp = (data.get('tool_input') or {}).get('file_path', '')
        if not fp or not _is_design_file(fp, root):
            return 0
        chk = os.path.join(root, 'tools', 'check_design.py')
        if not os.path.isfile(chk):
            return 0
        res = subprocess.run([sys.executable or 'python3', chk],
                             capture_output=True, text=True, timeout=30)
        if res.returncode != 0:
            # exit 2 = Claude에게 stderr 피드백 → 같은 턴 자가수정
            sys.stderr.write(res.stderr or res.stdout or '디자인 기틀 위반')
            sys.stderr.write('\n→ 방금 편집이 디자인 기틀을 위반했다. docs/디자인기틀.md 기준으로 즉시 수정하라. '
                             '(새 색이 정말 필요하면 운영자 승인 → :root 토큰 + baseline 갱신)\n')
            return 2
        return 0
    except Exception:
        return 0  # 게이트 오류가 편집을 막으면 안 됨 (커밋 게이트가 최종 방어)


if __name__ == '__main__':
    sys.exit(main())
