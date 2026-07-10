# -*- coding: utf-8 -*-
"""회원 DB 주소 표준화 + 휴대폰 인덱싱 정제
- 주소1(시도) / 주소2(시군구) / 주소3(읍면동·도로명) / 주소4(상세) / 우편번호 분해
- 시도 표기 통일: 전남·광주·전라남도·광주광역시 → 전남광주통합특별시
- 깨진 주소는 (우편번호→시군구)·(도로명→시군구) 데이터 사전으로 역추적 복구
- 휴대폰번호 010-XXXX-XXXX 정규화 + 중복 플래그
"""
import sys
import pandas as pd
import re
from collections import Counter, defaultdict

SRC = sys.argv[1] if len(sys.argv) > 1 else "회원DB.xlsx"
OUT = sys.argv[2] if len(sys.argv) > 2 else "회원DB_주소정제본.xlsx"

# ── 시도 표준화 사전 ──────────────────────────────────────────
SIDO_MAP = {
    '전남': '전남광주통합특별시', '전라남도': '전남광주통합특별시',
    '광주': '전남광주통합특별시', '광주광역시': '전남광주통합특별시',
    '전남광주통합특별시': '전남광주통합특별시',
    '서울': '서울특별시', '서울시': '서울특별시', '서울특별시': '서울특별시',
    '부산': '부산광역시', '부산시': '부산광역시', '부산광역시': '부산광역시',
    '대구': '대구광역시', '대구시': '대구광역시', '대구광역시': '대구광역시',
    '인천': '인천광역시', '인천시': '인천광역시', '인천광역시': '인천광역시',
    '대전': '대전광역시', '대전시': '대전광역시', '대전광역시': '대전광역시',
    '울산': '울산광역시', '울산시': '울산광역시', '울산광역시': '울산광역시',
    '세종': '세종특별자치시', '세종시': '세종특별자치시', '세종특별자치시': '세종특별자치시',
    '경기': '경기도', '경기도': '경기도',
    '강원': '강원특별자치도', '강원도': '강원특별자치도', '강원특별자치도': '강원특별자치도',
    '충북': '충청북도', '충청북도': '충청북도',
    '충남': '충청남도', '충청남도': '충청남도',
    '전북': '전북특별자치도', '전라북도': '전북특별자치도', '전북특별자치도': '전북특별자치도',
    '경북': '경상북도', '경상북도': '경상북도',
    '경남': '경상남도', '경상남도': '경상남도',
    '제주': '제주특별자치도', '제주도': '제주특별자치도', '제주특별자치도': '제주특별자치도',
}
# 시군구가 하나뿐인 시도(하위 구 없음)
METRO_ONE = {'세종특별자치시'}
# 광역시류: 주소2 = 구/군
METRO = {'서울특별시','부산광역시','대구광역시','인천광역시','대전광역시','울산광역시'}
# 통합특별시: 주소2 = 시/군/구 혼재 (옛 전남 시·군 + 옛 광주 구)
UNIFIED = '전남광주통합특별시'

RE_EUPMYEON = re.compile(r'^[가-힣]+(읍|면)$')
RE_DONG    = re.compile(r'^[가-힣]+\d*(동|가)$')      # 법정동 (여문1동 포함)
RE_RI      = re.compile(r'^[가-힣]+\d*(리|동)$')
RE_APT_DONG= re.compile(r'^\d+동$')                    # 104동 = 아파트 동
RE_ROAD    = re.compile(r'^[가-힣A-Za-z0-9·\.]*\d*(로|길)(\d+번?[길안]?)?$')
RE_SGG     = re.compile(r'^[가-힣]+(시|군|구)$')
RE_GU      = re.compile(r'^[가-힣]+구$')
RE_ROAD_NUM = re.compile(r'^([가-힣]+\d*(?:로|길))(\d[\d\-]*)$')   # 웅천로262 → 웅천로 + 262
RE_ROAD_BEON = re.compile(r'^([가-힣]+\d*로)\d+번[길안]?$')        # 산내로1257번길 → 산내로

def road_keys(tok):
    """토큰에서 도로명 사전 조회 후보들 (붙은 번지 분리 포함)"""
    keys = []
    m = RE_ROAD_NUM.match(tok)
    if m: keys.append(m.group(1))
    if RE_ROAD.match(tok): keys.append(tok)
    m = RE_ROAD_BEON.match(tok)
    if m: keys.append(m.group(1))
    return keys

def norm_space(s):
    return re.sub(r'\s+', ' ', s).strip()

# ── 1) 우편번호 분리 ─────────────────────────────────────────
def split_zip(addr):
    """returns (zipcode, zipflag, body)  zipflag: '' | '구형우편번호' | '우편번호이상' | '우편번호없음'"""
    a = addr.strip()
    m = re.match(r'^\[(\d{5})\]\s*(.*)$', a)
    if m:
        if m.group(1) == '00000':
            return '', '우편번호없음', m.group(2)
        return m.group(1), '', m.group(2)
    m = re.match(r'^\[(\d{3})-?(\d{3})\]\s*(.*)$', a)
    if m: return m.group(1)+m.group(2), '구형우편번호', m.group(3)
    m = re.match(r'^\[(\d{1,4})\]\s*(.*)$', a)
    if m: return m.group(1), '우편번호이상', m.group(2)
    # 대괄호 안이 주소 텍스트인 경우: 안팎을 합쳐 본문으로 (중복 문구는 뒤에서 정리)
    m = re.match(r'^\[([^\]]*)\]\s*(.*)$', a)
    if m:
        inner, outer = m.group(1).strip(), m.group(2).strip()
        if outer and (norm_space(inner) in norm_space(outer) or norm_space(outer) in norm_space(inner)):
            body = inner if len(inner) >= len(outer) else outer
        else:
            body = (inner + ' ' + outer).strip()
        return '', '우편번호없음', body
    return '', '우편번호없음', a

# ── 2) 본문 파싱 ─────────────────────────────────────────────
def parse_body(body):
    """returns (sido, sgg, a3, a4, flag) — 실패 시 sido/sgg = ''"""
    toks = norm_space(body).split(' ')
    if not toks or toks == ['']:
        return '', '', '', '', '주소빈값'
    # 시도 판정: 첫 토큰이 사전에 있으면
    sido = SIDO_MAP.get(toks[0], '')
    if sido:
        rest = toks[1:]
    else:
        return '', '', '', norm_space(body), '시도불명'
    # 시군구
    if sido in METRO_ONE:                       # 세종: 시군구 계층 없음 → 시도 복제
        return sido, sido, *split_a3a4(rest), ''
    if not rest:
        return sido, '', '', '', '시군구불명'
    t1 = rest[0]
    if sido in METRO or sido == UNIFIED:
        if RE_SGG.match(t1):
            return sido, t1, *split_a3a4(rest[1:]), ''
        return sido, '', *split_a3a4(rest), '시군구불명'
    # 도 지역: 시+일반구 결합 (성남시 분당구 등)
    if RE_SGG.match(t1):
        if t1.endswith('시') and len(rest) >= 2 and RE_GU.match(rest[1]):
            return sido, f'{t1} {rest[1]}', *split_a3a4(rest[2:]), ''
        return sido, t1, *split_a3a4(rest[1:]), ''
    return sido, '', *split_a3a4(rest), '시군구불명'

def split_a3a4(rest):
    """시군구 이후 → (주소3=읍면동·도로명, 주소4=상세)"""
    if not rest:
        return '', ''
    t = rest[0]
    if t.startswith('('):                       # 괄호 참고항목부터 시작 = 전부 상세
        return '', ' '.join(rest)
    if RE_APT_DONG.match(t):                    # 104동 … = 바로 상세
        return '', ' '.join(rest)
    if RE_EUPMYEON.match(t):                    # 읍·면 (+바로 뒤 리/동 결합)
        if len(rest) >= 2 and RE_RI.match(rest[1]) and not RE_APT_DONG.match(rest[1]):
            return f'{t} {rest[1]}', ' '.join(rest[2:])
        return t, ' '.join(rest[1:])
    if RE_DONG.match(t) or RE_ROAD.match(t):    # 법정동 or 도로명
        return t, ' '.join(rest[1:])
    return t, ' '.join(rest[1:])                # 기타: 첫 토큰을 3주소로

# ── 3) 휴대폰 정규화 ─────────────────────────────────────────
def norm_phone(p):
    """returns (formatted, flag)"""
    d = re.sub(r'\D', '', str(p))
    if len(d) == 11 and d.startswith('010'):
        return f'{d[:3]}-{d[3:7]}-{d[7:]}', ''
    if len(d) == 10 and d[:3] in ('011','016','017','018','019'):
        return f'{d[:3]}-{d[3:6]}-{d[6:]}', ''
    return p.strip(), '휴대폰이상'

# ── 메인 ─────────────────────────────────────────────────────
def main():
    df = pd.read_excel(SRC, dtype=str).fillna('')
    n = len(df)

    # 휴대폰
    pn = df['휴대폰번호'].map(norm_phone)
    df['휴대폰정규화'] = pn.map(lambda x: x[0])
    phone_flags = pn.map(lambda x: x[1])
    digits = df['휴대폰정규화'].map(lambda p: re.sub(r'\D','',p))
    dup_mask = digits.duplicated(keep=False) & (digits.str.len() >= 10)
    # 대표 = 등록일 최신 (같으면 첫 행)
    reg = pd.to_datetime(df['등록일'].str.replace('.','-',regex=False), errors='coerce')
    rep_idx = set()
    tmp = pd.DataFrame({'d': digits, 'r': reg})
    for _, g in tmp[dup_mask].groupby('d'):
        rep_idx.add(g.sort_values('r', ascending=False).index[0])

    # 주소 1차
    zips, zipflags, sidos, sggs, a3s, a4s, aflags = [],[],[],[],[],[],[]
    for a in df['주소']:
        z, zf, body = split_zip(a)
        if not z:                                # 본문 중간 (58007) 형태 우편번호 회수
            m = re.search(r'\((\d{5})\)', body)
            if m and m.group(1) != '00000':
                z, zf = m.group(1), ''
                body = norm_space(body.replace(m.group(0), ' '))
        sido, sgg, a3, a4, af = parse_body(body)
        zips.append(z); zipflags.append(zf)
        sidos.append(sido); sggs.append(sgg); a3s.append(a3); a4s.append(a4); aflags.append(af)

    # 복구 사전 구축 (1차 성공행 기준, 최빈값 90%+만 채택)
    zip2loc, road2loc, dong2loc = defaultdict(Counter), defaultdict(Counter), defaultdict(Counter)
    for z, sido, sgg, a3, a4 in zip(zips, sidos, sggs, a3s, a4s):
        if sido and sgg:
            if z and len(z) == 5:
                zip2loc[z][(sido, sgg)] += 1
            if a3:
                head = a3.split(' ')[0]
                for k in road_keys(head):
                    road2loc[k][(sido, sgg)] += 1
                if RE_EUPMYEON.match(head) or RE_DONG.match(head):
                    dong2loc[head][(sido, sgg)] += 1
                    # 읍면·동 뒤에 오는 도로명도 사전 등재 (해룡면 좌야로 179 → 좌야로)
                    nxt = a4.split(' ')[0] if a4 else ''
                    for k in road_keys(nxt):
                        road2loc[k][(sido, sgg)] += 1
    def dominant(counter, min_n=2):
        if not counter: return None
        (loc, c), total = counter.most_common(1)[0], sum(counter.values())
        return loc if c >= min_n and c / total >= 0.9 else None
    zip_dict  = {z: v for z, c in zip2loc.items()  if (v := dominant(c))}
    road_dict = {r: v for r, c in road2loc.items() if (v := dominant(c))}
    dong_dict = {d: v for d, c in dong2loc.items() if (v := dominant(c))}

    # 유효 시군구명 전수 (텍스트 직접 탐색용)
    known_sgg = defaultdict(Counter)
    for sido, sgg in zip(sidos, sggs):
        if sido and sgg: known_sgg[sgg][sido] += 1
    sgg2sido = {sgg: c.most_common(1)[0][0] for sgg, c in known_sgg.items()
                if c.most_common(1)[0][1] / sum(c.values()) >= 0.9 and len(sgg) >= 3}
    # 시도명 텍스트 탐색용 (긴 표기 우선)
    sido_keys = sorted(SIDO_MAP.keys(), key=len, reverse=True)

    # 2차 복구
    recovered = Counter()
    for i in range(n):
        if sidos[i] and sggs[i]:
            continue
        z = zips[i]
        _, _, body = split_zip(df['주소'].iloc[i])
        body = norm_space(re.sub(r'\(\d{5}\)', ' ', body))
        hit = None; how = ''
        # a) 본문에서 알려진 시군구명 직접 탐색 (가장 긴 매칭 우선)
        cands = [s for s in sgg2sido if s in body]
        if cands:
            best = max(cands, key=len)
            hit = (sgg2sido[best], best); how = '시군구복구(텍스트)'
            tail = body.split(best, 1)[1].strip()
            a3, a4 = split_a3a4(tail.split(' ') if tail else [])
            a3s[i], a4s[i] = a3, a4
        # b) 본문 중간의 시도명 탐색 → 그 지점부터 재파싱 (예: '… 대전 동구 산내로 …')
        #    오탐 방지: 토큰 완전일치, 또는 토큰 접두이면서 나머지가 알려진 행정구역명일 때만
        #    (아파트명 '세종캐슬하임' 속 '세종' 같은 부분 매칭 금지)
        if not hit:
            btoks = body.split(' ')
            found = None
            for ti, bt in enumerate(btoks):
                for sk in sido_keys:
                    if bt == sk:
                        found = (ti, sk, ''); break
                    if bt.startswith(sk):
                        rest_tok = bt[len(sk):]
                        ok = (rest_tok in sgg2sido or rest_tok in dong_dict or
                              (len(rest_tok) >= 2 and any(k.startswith(rest_tok) for k in sgg2sido)) or
                              any(rest_tok.startswith(k) for k in dong_dict))
                        if ok: found = (ti, sk, rest_tok); break
                if found: break
            if found:
                ti, sk, rest_tok = found
                tail_toks = ([rest_tok] if rest_tok else []) + btoks[ti+1:]
                s2, g2, a3, a4, f2 = parse_body(sk + ' ' + ' '.join(tail_toks))
                if s2 and g2:
                    hit = (s2, g2); how = '시군구복구(텍스트)'
                    a3s[i], a4s[i] = a3, a4
                elif s2 and not sidos[i]:
                    sidos[i] = s2          # 시도만이라도 확보
        # c) 우편번호 사전
        if not hit and z in zip_dict:
            hit = zip_dict[z]; how = '시군구복구(우편번호)'
        # d) 도로명·법정동 사전 (본문 토큰 순회, 붙은 번지 분리 포함)
        if not hit:
            for t in body.split(' '):
                for k in road_keys(t):
                    if k in road_dict: hit = road_dict[k]; how = '시군구복구(도로명)'; break
                if hit: break
                if (RE_EUPMYEON.match(t) or RE_DONG.match(t)) and t in dong_dict:
                    hit = dong_dict[t]; how = '시군구복구(법정동)'; break
        if hit:
            sidos[i], sggs[i] = hit
            if not a3s[i] and not a4s[i]:
                a4s[i] = body
            aflags[i] = how
            recovered[how] += 1
        else:
            if aflags[i] != '주소빈값':
                aflags[i] = '시군구불명'
            if not a4s[i]: a4s[i] = body

    df['우편번호'] = zips
    df['주소1'], df['주소2'], df['주소3'], df['주소4'] = sidos, sggs, a3s, a4s

    # 주소 플래그 (주소 관련만) + 휴대폰 관련 별도 컬럼
    addr_flags = []
    for i in range(n):
        f = []
        if aflags[i]: f.append(aflags[i])
        if zipflags[i]: f.append(zipflags[i])
        addr_flags.append(', '.join(f))
    df['주소플래그'] = addr_flags
    df['휴대폰상태'] = phone_flags.map(lambda x: x or '')
    dupcol = []
    for i in range(n):
        dupcol.append(('중복(대표)' if i in rep_idx else '중복') if dup_mask.iloc[i] else '')
    df['휴대폰중복'] = dupcol

    # ── 저장: 인덱싱 구조(휴대폰·이름·주소1~4)를 앞세움 ──
    cols = ['휴대폰정규화','이름','주소1','주소2','주소3','주소4','우편번호',
            '휴대폰중복','주소플래그','휴대폰상태',
            '아이디','생년월일','이메일','등록일','휴대폰번호','주소','전화번호']
    out = df[cols].rename(columns={'휴대폰번호':'휴대폰번호(원본)','주소':'주소(원본)'})
    piv = out[out['주소1']!=''].groupby(['주소1','주소2']).size().reset_index(name='회원수') \
            .sort_values(['회원수'], ascending=False)
    need = out[out['주소플래그']!='']
    dups = out[out['휴대폰중복']!=''].sort_values(['휴대폰정규화','등록일'])
    with pd.ExcelWriter(OUT, engine='openpyxl') as w:
        out.to_excel(w, sheet_name='정제본', index=False)
        piv.to_excel(w, sheet_name='지역집계', index=False)
        need.to_excel(w, sheet_name='주소요확인', index=False)
        dups.to_excel(w, sheet_name='중복번호', index=False)

    # ── 리포트 ──
    print(f"총 {n}행")
    print(f"주소1 확정: {sum(1 for s in sidos if s)} / 시군구 확정: {sum(1 for s in sggs if s)}")
    print(f"복구 내역: {dict(recovered)}")
    print(f"시군구불명 잔여: {sum(1 for f in aflags if f=='시군구불명')}")
    print(f"우편번호 있음: {sum(1 for z in zips if z)} (구형 {zipflags.count('구형우편번호')}, 이상 {zipflags.count('우편번호이상')})")
    print(f"휴대폰 이상: {(phone_flags!='').sum()} / 중복 관여: {dup_mask.sum()} (중복번호 {len(rep_idx)}개)")
    print()
    print("주소1 분포:")
    for k,v in Counter(s for s in sidos if s).most_common(20): print(f"  {k}: {v}")
    return df

if __name__ == '__main__':
    main()
