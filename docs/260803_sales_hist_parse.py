#!/usr/bin/env python3
# ============================================================
# 260803 역대 기획공연 판매결과 파서 — 운영대장 원본 엑셀 → 운영_기획공연판매결과 시트 데이터
#
# 소스(운영자 보관 원본 엑셀 4파일 중 3파일·5시트, 2012~2024 기획공연 262건):
#   ① 「예울마루 공연장 운영 관리대장.xlsx」 › 기획공연데이터(~2021)  → 2012~2020 (2021분은 ②와 완전 동일 실측 — 제외)
#   ② 「기획공연_티켓판매결과(2021-2024).xlsx」 › 판매내역(2021)~(2024)  → 2021~2024 정산 정본
#      ⚠ (2025) 탭은 오라벨(내용=2023·24 통합 작업본, 소계행·총매출 기준 혼재) — 반입 제외(검증용으로만 씀)
#   ③ 「2024 예울마루 공연장 운영 관리대장_공유.xlsx」 › 기획공연판매현황 → 2024 보충(정산탭에 없는 13건)
#      ⚠ 이 판의 「판매금액」 = 수수료 공제 후(행마다 배분 전/후 혼재) → 「수입」 열에 넣고 비고 표기
#
# 사용법:
#   python3 docs/260803_sales_hist_parse.py <원본엑셀폴더> [운영대장정리.json]
#   - 두 번째 인자 생략 시 Worker에서 라이브 GET (환경변수 DB_PW, 기본 게이트 비번)
#   - 산출: docs/260803_기획공연판매결과.json (기계산출물 — 손편집 금지, 값 수정 = 이 스크립트/원본 수정 후 재실행)
#
# 정산식(원본 구조 실측): 수입 = 총판매금액 − 공제_수수료 − 공제_기타 · 인터파크지급액 = 수입 − 현금보유분
# 년도 권위 = 소스 결산 연도(시트) · 공연ID/시작일/종료일 = 운영_세부운영관리대장(정리) 동년 에디션 조인
# ============================================================
import json, re, os, sys
import openpyxl

BASE = 'https://yeulmaru-promo-api.yeulmarumaster.workers.dev'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '260803_기획공연판매결과.json')

F_MASTER = '예울마루 공연장 운영 관리대장.xlsx'
F_TICKET = '기획공연_티켓판매결과(2021-2024).xlsx'
F_2024 = '2024 예울마루 공연장 운영 관리대장_공유.xlsx'

HEADERS = ["공연ID","년도","공연명","구분","사업명","장르","장소","시작일","종료일","원본날짜",
           "일수","회차","티켓가","가용석","불용석","유료판매석","유료비율",
           "무료_티켓나눔","무료_프로모션","무료_기타","무료합","단체예매수","총매수","점유율",
           "총판매금액","공제_수수료","공제_기타","현금보유분","인터파크지급액","수입",
           "지출","지출_공동기획배분","순수입","출처","비고"]

def uname(s):
    s = str(s or '')
    s = re.sub(r'\s*[-–—]\s*여수\s*$', '', s)
    s = re.sub(r'[〈〉<>「」『』\[\]（）()]', '', s)
    s = re.sub(r"[_\-–—·.,’'\"“”~!！?？:：/／&＆*※]", '', s)
    s = re.sub(r'\s+', '', s)
    return s.lower()

_PFX = re.compile(r'^((19|20)\d{2}|gs칼텍스|예울마루|4d이머시브|이머시브|매직드로잉|넌버벌|창작|어린이|가족|국민|초특급애니|뮤지컬쇼|뮤지컬|연극|국악|발레|오페라|가족극|퍼포먼스)')
def uname2(s):
    """느슨 정규화 — 접두 연도·주최·장르어를 안정될 때까지 반복 제거(소스 간 표기 편차 흡수)."""
    k = uname(s)
    while True:
        k2 = _PFX.sub('', k)
        if k2 == k or not k2: break
        k = k2
    return k or uname(s)

# 수동 별칭 — 자동 정규화·포함 매칭으로 못 잡는 확정 동일공연(260803 라이브 운영대장 실측 대조로 등록).
# 좌 = 소스 표기 uname2, 우 = 운영대장(정리) 표기 uname2.
ALIAS = {
    '무풍': '연희단팔산대무풍舞風바람의춤',                        # 2024 국악 <무풍> = 연희단팔산대 <무풍(舞風): 바람의 춤>
    '신년음악회임헌정과코리안심포니오케스트라가함께하는': '임헌정과코리안심포니오케스트라가함께하는2017예울마루신년음악회',
    '조성진파이노리사이틀': '조성진피아노리사이틀',                  # 소스 오타(파이노)
    '용재오닐송년음악회': '리처드용재오닐선물2020',
    '국립발레단창작발레호이랑': '국립발레단호이랑',
    '라이어': '라이어ⅰ',                                       # 2019 연극<라이어> = 국민연극 라이어 Ⅰ
    '라이어특별공연': '라이어ⅰ특별공연',
    '조재혁쇼팽앨범발매기념피아노리사이틀': '조재혁쇼팽음반발매기념리사이틀',
    '크리스마스jazznight': '크리스마스재즈나잇christmasjazznight',
    '국립발레단호두까기인형': '국립발레단의호두까기인형',
    '김영철펀펀클래식': '김영철의funfun클래식',
    '김성녀의뮤지컬모노드라마벽속의요정': '김성녀의벽속의요정',
    '피아니스트강현주와함께하는찰리채플린의모던타임즈': '힐링음악회ⅱ피아노영화를만나다찰리채플린의모던타임즈',
    '피아니스트강현주와함께하는피아노여행을만나다': '힐링음악회ⅲ피아노여행을만나다',
    '피아니스트강현주와함께하는피아노meets크리스마스': '힐링음악회ⅳ피아노크리스마스',
    '국립관현악단과함께하는국악콘서트잔치': '국립국악관현악단잔치',
    '서울발레시어터호두까기인형': '서울발레시어터의호두까기인형',
    '피아니스트강현주와함께하는세계음악여행ⅰ프라하의봄': '피아니스트강현주와함께떠나는세계음악여행프라하의봄',
    '피아니스트강현주와함께하는세계음악여행ⅱ지중해의여름': '피아니스트강현주와함께떠나는세계음악여행지중해의여름',
    '피아니스트강현주와함께하는세계음악여행ⅲ파리의가을': '피아니스트강현주와함께떠나는세계음악여행파리의가을',
    '피아니스트강현주와함께하는세계음악여행ⅳ화이트인뉴욕': '피아니스트강현주와함께떠나는세계음악여행화이트인뉴욕',
    '개관2주년기념kbs교향악단연주회': '개관2주년기념공연kbs교향악단연주회',
    '나라사랑친구사랑콘서트': '테너임산과나라사랑친구사랑',
    '세계에서가장다이나믹한현악4중주공연모차르트그룹내한공연': '모차르트그룹최초내한공연',
    '개관3주년기념공연세종솔로이스츠낭만': '세종솔로이스츠의낭만',
    '한국페스티벌앙상블30주년기념연주회해설이있는드보르작의세계': '한국페스티벌앙상블창단30주년기념연주해설이있는드보르작의세계',
    '여수시립국악단과gs칼텍스예울마루가함께하는오월愛': '오월愛',
    '여성영화산책홍콩은언제나내일': '여성영화산책0222홍콩은언제나내일',
    '여성영화산책귀향': '여성영화산책0426귀향',
    '여성영화산책책속의소녀': '여성영화산책0628책속의소녀',
    '여성영화산책미씽사라진여자': '여성영화산책0830미씽사라진여자',
    '여성영화산책소녀레슬러': '여성영화산책1025소녀레슬러',
    '여성영화산책체르노빌의할머니들': '여성영화산책1227',   # 2017 산책 중 유일 미배정 회차(12.27) — 상영일(2017.12.27) 대조 확정
    '피아니스트강현주의브런치콘서트classiconscreeⅱ미드나잇인여수': '강현주의브런치콘서트classiconscreenⅱ',
    '피아니스트강현주의브런치콘서트classiconscreeⅲ상상그이상의상상': '강현주의브런치콘서트classiconscreenⅲ',
    '피아니스트강현주의브런치콘서트classiconscreeⅳ끝은또다른시작': '강현주의브런치콘서트classiconscreenⅳ',
    '피아니스트강현주의브런치콘서트음악가들의뮤즈들ⅲ몽마르트의첫사랑발라동과사티': '피아니스트강현주의브런치콘서트음악가들의뮤즈들ⅲ몸마르트의첫사랑발라동와사티',
    '야외음악회': '2019야외콘서트',
}
def ckey(name):
    k = uname2(name)
    return ALIAS.get(k, k)

def num(v):
    if v is None: return None
    if isinstance(v, (int, float)): return v
    s = str(v).strip().replace(',', '')
    if s in ('', '-') or s.startswith('#'): return None
    try: return float(s)
    except ValueError: return None

def money(v):
    n = num(v)
    return None if n is None else int(round(n))

def pct(v):
    n = num(v)
    if n is None: return None
    return round(n * 100, 1) if n <= 3 else round(n, 1)   # 원본 = 분수(1.02 오버셀까지) — 3 초과면 이미 %로 간주

def txt(v):
    if v is None: return ''
    return re.sub(r'\s*\n\s*', ' / ', str(v)).strip()

def tname(v):
    """공연명 전용 — 개행은 공백으로(조인·표시 안정)."""
    if v is None: return ''
    return re.sub(r'\s+', ' ', str(v)).strip()

def blank_row():
    return {h: '' for h in HEADERS}

def put(row, **kw):
    for k, v in kw.items():
        row[k] = '' if v is None else v

def note(row, msg):
    row['비고'] = (row['비고'] + ' · ' if row['비고'] else '') + msg

# ── 소스 A/B: 기획공연데이터(~2021)·판매내역(2021) — 동일 36열 레이아웃(년도 컬럼 있음)
def parse_a(ws, src, min_row, year_filter=None):
    out = []
    for r in ws.iter_rows(min_row=min_row, values_only=True):
        if r[3] in (None, ''): continue
        y = str(r[1] or '')[:4]
        if not y.isdigit(): continue
        if year_filter and not year_filter(int(y)): continue
        row = blank_row()
        put(row, 년도=int(y), 구분=txt(r[2]), 공연명=tname(r[3]), 원본날짜=txt(r[4]), 장소=txt(r[5]),
            일수=money(r[6]), 회차=money(r[7]), 티켓가=txt(r[8]),
            불용석=money(r[13]), 가용석=money(r[14]), 유료판매석=money(r[15]), 유료비율=pct(r[16]),
            무료_티켓나눔=money(r[17]), 무료_프로모션=money(r[19]), 무료_기타=money(r[21]), 무료합=money(r[22]),
            총매수=money(r[24]), 점유율=pct(r[25]), 총판매금액=money(r[26]),
            공제_수수료=money(r[27]), 공제_기타=money(r[28]), 현금보유분=money(r[29]),
            인터파크지급액=money(r[30]), 수입=money(r[31]), 지출=money(r[32]), 지출_공동기획배분=money(r[33]),
            순수입=money(r[34]), 장르=txt(r[35]), 출처=src)
        out.append(row)
    return out

# ── 소스 C: 판매내역(2022) — 36열, 년도 컬럼 없음
def parse_c(ws, src, year):
    out = []
    for r in ws.iter_rows(min_row=4, values_only=True):
        if r[2] in (None, ''): continue
        row = blank_row()
        put(row, 년도=year, 구분=txt(r[1]), 공연명=tname(r[2]), 원본날짜=txt(r[3]), 장소=txt(r[4]),
            일수=money(r[5]), 회차=money(r[6]), 티켓가=txt(r[7]),
            불용석=money(r[12]), 가용석=money(r[13]), 유료판매석=money(r[14]), 유료비율=pct(r[15]),
            무료_티켓나눔=money(r[16]), 무료_프로모션=money(r[18]), 무료_기타=money(r[20]), 무료합=money(r[21]),
            총매수=money(r[23]), 점유율=pct(r[24]), 총판매금액=money(r[25]),
            공제_수수료=money(r[26]), 공제_기타=money(r[27]), 현금보유분=money(r[28]),
            인터파크지급액=money(r[29]), 수입=money(r[30]), 지출=money(r[31]), 지출_공동기획배분=money(r[32]),
            순수입=money(r[33]), 장르=txt(r[34]), 사업명=txt(r[35]), 출처=src)
        out.append(row)
    return out

# ── 소스 D: 판매내역(2023)/(2024) — 39열(2층·단체예매·사업명 포함)
def parse_d(ws, src, year):
    out = []
    for r in ws.iter_rows(min_row=4, values_only=True):
        if r[2] in (None, ''): continue
        row = blank_row()
        put(row, 년도=year, 구분=txt(r[1]), 공연명=tname(r[2]), 원본날짜=txt(r[3]), 장소=txt(r[4]),
            일수=money(r[5]), 회차=money(r[6]), 티켓가=txt(r[7]),
            불용석=money(r[13]), 가용석=money(r[14]), 유료판매석=money(r[15]), 유료비율=pct(r[16]),
            무료_티켓나눔=money(r[17]), 무료_프로모션=money(r[19]), 무료_기타=money(r[21]), 무료합=money(r[22]),
            단체예매수=money(r[24]), 총매수=money(r[26]), 점유율=pct(r[27]), 총판매금액=money(r[28]),
            공제_수수료=money(r[29]), 공제_기타=money(r[30]), 현금보유분=money(r[31]),
            인터파크지급액=money(r[32]), 수입=money(r[33]), 지출=money(r[34]), 지출_공동기획배분=money(r[35]),
            순수입=money(r[36]), 장르=txt(r[37]), 사업명=txt(r[38]), 출처=src)
        out.append(row)
    return out

# ── 소스 E: 2024공유본 기획공연판매현황 — 대장 26열. 금액 = 수수료 공제 후(배분 전/후 혼재) → 「수입」에만.
#    관객 수치는 발권 기준이라 판매 기준 열과 안 섞는다(운영대장 조인으로 이미 보유) — 금액·기간·가격만 취함.
def parse_e(ws, src):
    out = []
    for r in ws.iter_rows(min_row=2, values_only=True):
        if r[1] in (None, ''): continue
        y = re.sub(r'[^0-9]', '', str(r[2] or ''))[:4]
        if not y.isdigit(): continue
        row = blank_row()
        mm = re.sub(r'[^0-9]', '', str(r[3] or ''))
        put(row, 년도=int(y), 구분=txt(r[9]), 공연명=tname(r[1]), 원본날짜=(mm + '월 ' if mm else '') + txt(r[4]),
            장소=txt(r[8]), 일수=money(r[14]), 회차=money(r[17]), 티켓가=txt(r[6]),
            장르=txt(r[11]), 수입=money(r[25]), 출처=src,
            비고='정산탭 부재 — 금액=판매현황판(수수료 공제 후·배분 전후 혼재 가능), 관객수치는 운영대장 참조')
        if money(r[25]) is None:
            row['비고'] = '무료공연(판매금액 없음) — ' + row['비고']
        out.append(row)
    return out

def load_ops(path):
    if path:
        return json.load(open(path, encoding='utf-8'))['rows']
    import urllib.request
    pw = os.environ.get('DB_PW', '0510')
    req = urllib.request.Request(
        BASE + '/api/ops?sheet=' + urllib.parse.quote('세부운영관리대장(정리)'),
        headers={'X-App-Password': pw})
    with urllib.request.urlopen(req, timeout=60) as f:
        return json.loads(f.read().decode('utf-8'))['rows']

def main():
    if len(sys.argv) < 2:
        print('사용법: python3 docs/260803_sales_hist_parse.py <원본엑셀폴더> [운영대장정리.json]'); sys.exit(1)
    xdir = sys.argv[1]
    ops_json = sys.argv[2] if len(sys.argv) > 2 else None

    wbM = openpyxl.load_workbook(os.path.join(xdir, F_MASTER), read_only=True, data_only=True)
    wbT = openpyxl.load_workbook(os.path.join(xdir, F_TICKET), read_only=True, data_only=True)
    wbS = openpyxl.load_workbook(os.path.join(xdir, F_2024), read_only=True, data_only=True)

    batches = [
        parse_a(wbM['기획공연데이터(~2021)'], '기획공연데이터(~2021)', 3, lambda y: y <= 2020),
        parse_a(wbT['기획공연판매내역(2021)'], '판매내역(2021)', 3),
        parse_c(wbT['기획공연판매내역(2022)'], '판매내역(2022)', 2022),
        parse_d(wbT['기획공연판매내역(2023)'], '판매내역(2023)', 2023),
        parse_d(wbT['기획공연판매내역(2024)'], '판매내역(2024)', 2024),
        parse_e(wbS['기획공연판매현황'], '판매현황판(2024)'),
    ]
    report = {'dup_same_source': [], 'dup_cross_source': [], 'settle_mismatch': [], 'join_miss': [], 'e_delta': []}

    # ── 병합: 키 = (년도, ckey). 소스 순서 = 정본 우선순위(정산탭 → 판매현황판 보충).
    merged = {}
    for batch in batches:
        for row in batch:
            key = (row['년도'], ckey(row['공연명']))
            if key in merged:
                old = merged[key]
                if old['출처'] == row['출처']:
                    d1 = re.sub(r'[^0-9]', '', str(old['원본날짜']))[:8]
                    d2 = re.sub(r'[^0-9]', '', str(row['원본날짜']))[:8]
                    if d1 != d2:   # 날짜가 다르면 같은 제목의 별개 공연(시리즈 2회·회차 블록) — 둘 다 보존
                        merged[(key[0], key[1] + '#2')] = row
                        report['dup_same_source'].append((key, old['공연명'], '별개보존', old['원본날짜'], row['원본날짜']))
                        note(row, '동명 별개 행(날짜 상이) 보존')
                    else:          # 같은 날짜 = 같은 공연의 신·구 스냅샷 — 선행(정리본) 채택
                        report['dup_same_source'].append((key, old['공연명'], '병합', old['총판매금액'], row['총판매금액']))
                        note(old, f"동일소스 중복행 정리(후행값 {row['총판매금액']} 미채택)")
                else:
                    report['dup_cross_source'].append((key, old['출처'], row['출처'], old.get('수입'), row.get('수입')))
                    if row['출처'].startswith('판매현황판') and isinstance(old.get('수입'), (int, float)) and isinstance(row.get('수입'), (int, float)):
                        a, b = old['수입'], row['수입']
                        if a and abs(a - b) / max(a, 1) > 0.02:
                            report['e_delta'].append((old['공연명'], a, b))
                            note(old, f'판매현황판 금액({b:,})과 상이 — 공동기획 배분 등 기준차 추정')
                continue
            merged[key] = row

    # ── 정산식 자가검증: 수입 = 총판매 − 수수료 − 기타공제 (지급액 = 수입 − 현금보유분) ±1000원
    for row in merged.values():
        t, s, g, inc = (row.get(k) for k in ('총판매금액', '공제_수수료', '공제_기타', '수입'))
        if all(isinstance(v, (int, float)) for v in (t, inc)):
            if abs(t - (s or 0) - (g or 0) - inc) > 1000:
                report['settle_mismatch'].append((row['년도'], row['공연명'], t, s, g, inc))
                note(row, '원본 정산식 불일치 의심(총판매−공제≠수입)')

    # ── 운영대장(정리) 조인 → 공연ID·시작일·종료일 (년도는 소스 결산 연도가 정본 — 동년 에디션만)
    ops = load_ops(ops_json)
    eds = {}   # (uname 원키, 년도) → 에디션 객체(단일)
    for r in ops:
        y = str(r.get('년도', '')).strip()[:4]
        if not y.isdigit(): continue
        k0 = uname(r.get('공연명', ''))
        if not k0: continue
        ed = eds.setdefault((k0, int(y)), {'id': '', 'dates': [], 'name': tname(r.get('공연명', ''))})
        rid = str(r.get('공연ID', '')).strip()
        if rid and not ed['id']: ed['id'] = rid
        mo, dy = num(r.get('월')), num(r.get('일'))
        if mo: ed['dates'].append((int(y), int(mo), int(dy or 1)))
    idx = {}   # 정규화키 → {년도: 에디션 객체} — uname·uname2 두 키가 같은 객체 공유
    for (k0, y), ed in eds.items():
        for k in {k0, uname2(ed['name'])}:
            idx.setdefault(k, {}).setdefault(y, ed)

    def find_edition(name, y):
        for k in (uname(name), uname2(name), ckey(name)):
            cand = idx.get(k)
            if cand and y in cand: return cand[y]
        # 포함 매칭(양쪽 길이 4 이상·동년·유일 '에디션' 후보만 — daily_ingest 길이가드 계승)
        k = ckey(name)
        if len(k) >= 4:
            hits = {}
            for ok, cand in idx.items():
                if len(ok) >= 4 and (k in ok or ok in k) and y in cand:
                    hits[id(cand[y])] = cand[y]
            if len(hits) == 1:
                return next(iter(hits.values()))
        return None

    for key, row in merged.items():
        ed = find_edition(row['공연명'], row['년도'])
        if not ed:
            report['join_miss'].append((row['년도'], row['공연명'], row['출처']))
            note(row, '운영대장(정리) 동년 미등재 — 공연ID 없음')
            continue
        row['공연ID'] = ed['id']
        if ed['dates']:
            ds = sorted(ed['dates'])
            row['시작일'] = '%04d%02d%02d' % ds[0]
            row['종료일'] = '%04d%02d%02d' % ds[-1]

    rows = sorted(merged.values(), key=lambda r: (r['년도'], r.get('시작일') or '99999999', uname(r['공연명'])))

    # ── 리포트
    from collections import Counter
    yc = Counter(r['년도'] for r in rows)
    rev = Counter(); paid = Counter()
    for r in rows:
        if isinstance(r.get('총판매금액'), (int, float)): rev[r['년도']] += r['총판매금액']
        if isinstance(r.get('유료판매석'), (int, float)): paid[r['년도']] += r['유료판매석']
    nid = sum(1 for r in rows if r['공연ID'])
    print('연도별 공연 수:', dict(sorted(yc.items())))
    print('연도별 Σ총판매금액(백만):', {y: round(v / 1e6) for y, v in sorted(rev.items())})
    print(f'공연ID 조인: {nid}/{len(rows)}')
    for k, v in report.items():
        print(f'--- {k} ({len(v)})')
        for item in v: print('   ', item)
    by_id = {}
    for o in ops:
        rid = str(o.get('공연ID', '')).strip()
        if rid: by_id.setdefault(rid, []).append(o)
    ops_paid = Counter()
    for r in rows:
        rid = r['공연ID']
        if rid and rid in by_id:
            ops_paid[r['년도']] += sum(num(o.get('발권유료')) or 0 for o in by_id[rid])
    print('연도별 Σ발권유료(운영대장·조인분):', {y: int(v) for y, v in sorted(ops_paid.items())})
    print('연도별 Σ유료판매석(신규시트):     ', {y: int(v) for y, v in sorted(paid.items())})

    meta = {'생성': '260803', '행수': len(rows), '공연ID조인': nid,
            '소스': ['기획공연데이터(~2021)', '판매내역(2021~2024)', '판매현황판(2024)'],
            '제외': '(2025)탭=오라벨 작업본(2023·24 중복·총매출 기준 혼재)'}
    json.dump({'headers': HEADERS, 'rows': rows, 'meta': meta},
              open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('→', OUT, f'({len(rows)}행)')

main()
