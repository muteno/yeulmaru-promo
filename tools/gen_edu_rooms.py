#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""교육실 대관 신청 CSV → data/edu_rooms.js 생성기.

원천(정본) = data/교육실대관_2026.csv (대관 신청 시스템 내보내기 원본, 손대지 않는다).
산출물(data/edu_rooms.js)은 기계 산출물 = 손편집 금지. 값이 바뀌면 CSV를 갈아끼우고 이 스크립트를 다시 돌린다.

  python3 tools/gen_edu_rooms.py

· 상태 '승인' 행만 싣는다(취소·대기는 화면에 뜨면 안 된다).
· 장소는 앞의 기관명('예울마루 ')을 떼고 방 이름만 남긴다 — 날짜 패널 3열(장소)이 짧아야 제목이 넓게 선다.
· 날짜는 '2026-07-08(수)' → '2026-07-08'(dk() 키 규격)로 맞춘다.
"""
import csv, io, json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC  = os.path.join(ROOT, 'data', '교육실대관_2026.csv')
OUT  = os.path.join(ROOT, 'data', 'edu_rooms.js')

def main():
    rows = []
    with io.open(SRC, encoding='utf-8-sig', newline='') as f:
        for r in csv.DictReader(f):
            if (r.get('상태') or '').strip() != '승인':
                continue
            m = re.match(r'(\d{4}-\d{2}-\d{2})', (r.get('신청날짜') or '').strip())
            if not m:
                continue
            place = re.sub(r'^예울마루\s*', '', (r.get('장소') or '').strip())
            rows.append({
                's': m.group(1),
                't': (r.get('시간') or '').strip(),
                'l': place,
                'n': (r.get('신청내용') or '').strip(),
                'g': (r.get('단체명') or '').strip(),
            })
    # 같은 날 안에서 시간 → 장소 순 (패널에 뜨는 순서 = 여기서 확정)
    rows.sort(key=lambda x: (x['s'], x['t'], x['l']))

    body = ',\n'.join('  ' + json.dumps(x, ensure_ascii=False, sort_keys=True) for x in rows)
    js = (
        '/* 교육실 대관 일정 — 날짜 패널(사이드바) 전용 표기. 캘린더 셀에는 싣지 않는다(운영자 260731).\n'
        '   ⚙ 기계 산출물 — 손편집 금지. 원천 = data/교육실대관_2026.csv · 생성 = python3 tools/gen_edu_rooms.py\n'
        '   행 = {s:날짜키, t:시간, l:장소, n:신청내용, g:단체명} · 상태 「승인」 %d건 */\n'
        'var EDU_ROOMS=[\n%s\n];\n'
    ) % (len(rows), body)
    with io.open(OUT, 'w', encoding='utf-8') as f:
        f.write(js)
    print('[gen_edu_rooms] %d건 → %s' % (len(rows), os.path.relpath(OUT, ROOT)))

if __name__ == '__main__':
    main()
