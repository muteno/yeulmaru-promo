#!/usr/bin/env python3
"""[260804] 예매 주문 원장 zip → 고유 주문 JSON (stdout)

운영자 제공 `2020~2025 공연 주문 정보.zip` 전용 추출기. `docs/260804_booking_ingest.mjs`가 호출한다.

이 파일이 감당하는 현실 3가지 (전부 260804 실측):
  ① **파일이 두 종류다** — 102개는 OLE2 StrongEncryption(열기암호), 109개는 무암호. 둘 다 받는다.
     확장자는 .xls인데 복호화하면 내용은 xlsx(PK) — 확장자를 믿지 말고 매직으로 판별한다.
  ② **zip 안 이름이 cp437로 깨져 있다** — cp949로 되돌려야 연도·수정본 폴더를 구분할 수 있다.
  ③ **같은 주문이 여러 파일에 겹쳐 있다**(70,221행 → 고유 40,429행). 파일을 고르지 않고
     주문키(대표티켓번호+판매순번)로 합치되, 값이 어긋나면 **12.13수정본을 우선**한다
     (실측: 온전 휴대폰 5,024건 vs 평년도 폴더 1,639건 = 수정본이 더 완전).

신용정보 계열은 **읽지 않는다** — 결제수단·결제상세정보·결제상태·결제일시·판매자ID·아이디·전화번호·
배송방법·배송상태·연동예매번호·No. 반입 대상에서 원천 제외한다(운영자 「필요없는 신용정보 같은건 다 날리고」).

의존: msoffcrypto-tool, openpyxl (레포 기본 의존 아님 — 없으면 안내하고 종료)
실행: XLS_PW=<열기암호> python3 tools/booking_extract.py <zip경로>   → stdout에 JSON 배열
"""
import sys, os, io, json, zipfile, warnings

warnings.filterwarnings('ignore')

try:
    import msoffcrypto, openpyxl
except ImportError as e:
    sys.exit(f'✗ 의존 모듈 없음({e.name}) — pip install msoffcrypto-tool openpyxl 후 다시 실행하세요')

# 시트 열 이름 → 반입 열 이름. 여기 없는 열은 애초에 안 읽는다(신용정보 차단이 곧 이 표다).
KEEP = {
    '대표티켓번호': '대표티켓번호', '판매순번': '판매순번', '주문상태': '주문상태', '판매일': '판매일',
    '상품명': '상품명', '이용(관람)일시': '이용일시', '장소명': '장소명', '총매수': '총매수',
    '최종정상매수': '최종정상매수', '주문자명': '주문자명', '휴대폰번호': '휴대폰번호', '금액': '금액',
    '발권상태': '발권상태', '회원여부': '회원여부', '판매처': '판매처', '주문일시': '주문일시',
}
OLE_MAGIC = b'\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1'


def vintage(name):
    """겹친 주문에서 어느 파일 값을 믿을지. 큰 값이 이긴다."""
    if name.startswith('(12.13_'):
        return 3
    if name.startswith('(11.7_'):
        return 2
    if name.startswith('2021~2025 예매자리스트'):
        return 1
    return 0


def decode_name(n):
    try:
        return n.encode('cp437').decode('cp949')
    except Exception:
        return n


def workbook_bytes(raw, pw):
    """암호분은 풀고, 무암호분은 그대로. 실패하면 None."""
    if raw[:8] != OLE_MAGIC:
        return raw
    try:
        f = msoffcrypto.OfficeFile(io.BytesIO(raw))
        f.load_key(password=pw)
        out = io.BytesIO()
        f.decrypt(out)
        return out.getvalue()
    except Exception as e:
        # "Document is not encrypted" = OLE2지만 평문 — 그대로 넘긴다.
        return raw if 'not encrypted' in str(e) else None


def main():
    if len(sys.argv) < 2:
        sys.exit('사용: XLS_PW=<암호> python3 tools/booking_extract.py <zip경로>')
    zip_path, pw = sys.argv[1], os.environ.get('XLS_PW', '')
    if not pw:
        sys.exit('✗ XLS_PW(엑셀 열기암호) 환경변수가 필요합니다')

    z = zipfile.ZipFile(zip_path)
    store, read_rows, failed = {}, 0, []
    for info in z.infolist():
        if info.is_dir():
            continue
        name = decode_name(info.filename)
        data = workbook_bytes(z.read(info.filename), pw)
        if data is None:
            failed.append(name)
            continue
        vt = vintage(name)
        try:
            wb = openpyxl.load_workbook(io.BytesIO(data), read_only=True, data_only=True)
        except Exception as e:
            failed.append(f'{name} ({e})')
            continue
        it = wb.worksheets[0].iter_rows(values_only=True)
        idx = None
        for row in it:                                    # 헤더 = 값이 4칸 이상 찬 첫 줄
            cells = ['' if c is None else str(c).strip() for c in row]
            if sum(1 for c in cells if c) >= 4:
                idx = {h: i for i, h in enumerate(cells)}
                break
        if not idx:
            failed.append(f'{name} (헤더 없음)')
            wb.close()
            continue
        for row in it:
            if row is None:
                continue
            vals = ['' if c is None else str(c).strip() for c in row]
            if not any(vals):
                continue
            read_rows += 1
            rec = {}
            for src, dst in KEEP.items():
                i = idx.get(src)
                rec[dst] = vals[i] if i is not None and i < len(vals) else ''
            key = (rec['대표티켓번호'], rec['판매순번'])
            if key not in store or vt > store[key][0]:
                store[key] = (vt, rec)
        wb.close()

    print(f'[extract] 읽은 행 {read_rows:,} → 고유 주문 {len(store):,}', file=sys.stderr)
    if failed:
        print(f'[extract] ⚠ 처리 실패 {len(failed)}건: {failed[:5]}', file=sys.stderr)
    json.dump([r for _, r in store.values()], sys.stdout, ensure_ascii=False)


if __name__ == '__main__':
    main()
