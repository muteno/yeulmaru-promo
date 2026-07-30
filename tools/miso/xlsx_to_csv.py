#!/usr/bin/env python3
"""xlsx/xlsm → 시트별 CSV 변환기 (MISO 이식 DB 반입 보조 — requires: pip install openpyxl)

사용: python3 tools/miso/xlsx_to_csv.py <파일.xlsx> [출력폴더=data/db_export]
각 시트를 <출력폴더>/<시트명>.csv (UTF-8 BOM)로 저장한다. 이후 node tools/miso/build_db.mjs 실행.
"""
import csv, sys, os

def main():
    if len(sys.argv) < 2:
        print(__doc__); sys.exit(1)
    try:
        import openpyxl
    except ImportError:
        print("openpyxl 필요: pip install openpyxl"); sys.exit(1)
    src = sys.argv[1]
    out_dir = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'db_export')
    os.makedirs(out_dir, exist_ok=True)
    wb = openpyxl.load_workbook(src, data_only=True, read_only=True)
    # 원본 파일명에 '회원'이 있으면 시트 CSV에도 마커를 전파 — build_db.mjs가
    # 파일명 기준으로 회원 데이터를 차단(구조만 설계 등재)하므로 마커 유실 = PII 반입 사고.
    prefix = '회원_' if '회원' in os.path.basename(src) else ''
    for ws in wb.worksheets:
        path = os.path.join(out_dir, f"{prefix}{ws.title}.csv")
        with open(path, 'w', newline='', encoding='utf-8-sig') as f:
            w = csv.writer(f)
            for row in ws.iter_rows(values_only=True):
                w.writerow(['' if v is None else v for v in row])
        print(f"  → {path}")
    print(f"완료: {len(wb.worksheets)}개 시트. 다음: node tools/miso/build_db.mjs")

if __name__ == '__main__':
    main()
