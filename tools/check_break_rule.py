#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
축 중략(≈) 판정 게이트 — 「판정 함수가 실제로 발동하는가」 (평의회8 초안 · 260806, stdlib only)

이 게이트가 잡는 축 = 기존 게이트 어느 것도 **한 번도 안 묻는** 축이다.

  · check_design    = 색·토큰·대비·전이·X버튼 부품 (소스 문자열 계량)
  · check_refs      = 문서 백틱 경로 실존
  · check_wiring    = 클립·싱크 블록 리터럴 생존
  · check_modal_head= 모달 머리줄 자리·부품 실존
  · smoke_layout    = 유리박스·흰 도형 하단선 Δ (그려진 **기하**)
  · smoke_modal_head/component_parity = computed style 패리티
  · build_annual_yr = _YR 파생값 산수

  → 전부 「무엇이 어떻게 생겼나」다. **「판정 함수가 어떤 입력에 발동하나」**는 축 자체가 없었다.

실사고(260806 봉합 대상): 260804 da8a03d가 오발동 봉합으로 넣은 `pos[k-1] < B*1.25` 게이트가,
구판의 단일 절단점(순위 20% 한 자리)과 겹치면서 **이 기능을 만든 계기였던 원사례**([486,66,52,…])까지
같이 껐다. 화면엔 ≈가 사라졌을 뿐 에러도 레이아웃 파손도 없다 = 전 게이트 rc=0.
smoke_layout은 그 경로를 지나라고 목데이터까지 심어놨지만(qa_mock_ops.mjs L21-22)
**발동 여부를 단 한 줄도 단언하지 않아** 규칙이 꺼진 채로 통과했다. 운영자 눈이 유일한 검출기였다.

판정 = **정본 함수 재판정**(사전·규칙 사본 0):
  index.html에서 `_bizNiceStep`~`_bizBarBreak` 원문을 그대로 잘라 node로 실행하고,
  고정 케이스(발동해야 하는 것 5 · 발동하면 안 되는 것 6)와 오발동 회귀 400세트를 재판정한다.
  네트워크 0 · LLM 0 · 렌더 0 · 면책표 없이 하드 0.

케이스 값의 출처(창작 0):
  · 원사례          = 260804 커밋 주석의 실측 분포(대형 뮤지컬 1건 486백만 + 나머지)
  · 라이브260806    = 260806 커밋 메시지에 박제된 라이브 분포
  · plotPx 110/99   = 260804 평의회4가 실측한 fit 축소 화면(1280×800)과 하한 100의 양쪽
  · 완만·표본5·음수 = 함수 주석이 「접지 않는다」고 명문화한 3조건
  · null 섞임       = 실제 호출부(_bizDrawSalesBars)가 넘기는 배열 모양(선으로 그리는 항목 = null)

⚠ 남는 한계(실측 · 정직하게 못박는다):
  · **판정에 영향이 없는 줄은 못 잡는다.** 이 게이트를 만들며 실측한 결과 `if(pos[k-1]<B*1.25)continue;`
    한 줄은 지워도 판정이 **한 건도 안 바뀐다**(3계열 랜덤 20만 세트 × plotPx 5높이 = 0건 차이).
    260806에 들어온 갭 술어(`pos[k-1]<pos[k]*2`)가 그 앞에서 같은 축을 더 세게 거르기 때문 —
    즉 1.25 줄은 현재 **행동상 죽은 코드**다(수학적 증명은 아니고 20만 세트 실측. 반례가 이론상
    가능하다: `cnt` 정의상 pos[k-1] > B는 항상 참이고 1.25는 그 위 25% 여유일 뿐).
    → 이 게이트는 그 줄의 삭제를 검출하지 못한다. 검출을 원하면 줄을 지우는 게 맞는 처방이다.
  · 케이스 축이라 **모든** 분포를 덮지 않는다. 새 실사고 분포가 나오면 FIRE/NOFIRE에 1줄 추가한다.

사용: python3 tools/check_break_rule.py            (exit 0=통과 / 1=위반)
      python3 tools/check_break_rule.py --killtest (자기검증: 판정을 망가뜨린 사본 6종에서 rc=1이 나오는지)
호출처(안): .githooks/pre-commit — index.html 스테이징 시.
"""
import json
import os
import re
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# 초안이 tools/ 밖(스크래치패드)에 있을 때만 쓰는 경로 오버라이드 — 정식 편입 시 이 두 줄은 불필요.
if not os.path.isfile(os.path.join(ROOT, 'index.html')):
    ROOT = os.environ.get('BREAK_RULE_ROOT', ROOT)
INDEX = os.path.join(ROOT, 'index.html')
# 진단용 — 특정 리비전 사본을 재판정할 때만(`--index=<경로>`). 미지정 = 작업트리 정본.
for _a in sys.argv[1:]:
    if _a.startswith('--index='):
        INDEX = _a.split('=', 1)[1]

# ── 앵커 — 정본 함수 구간. 선언 형태가 바뀌면 fail-closed(조용한 미검사 금지) ──
HEAD = 'function _bizNiceStep('
TAIL = 'function _bizWavePts('

# ── 고정 케이스 ────────────────────────────────────────────────────────────────
# FIRE: [이름, 값 배열, plotPx, 접혀야 하는 개수 n]
FIRE = [
    ('원사례 대형뮤지컬 1건',        [486, 66, 52, 48, 41, 33, 22, 14, 9, 5], 300, 1),
    ('원사례 · fit 축소 화면(1280×800)', [486, 66, 52, 48, 41, 33, 22, 14, 9, 5], 110, 1),
    ('260806 라이브 분포(이상치 2건)', [3300, 3170, 908, 637, 503, 311, 277, 268, 178], 300, 2),
    ('이상치 3건',                  [900, 850, 800, 40, 35, 30, 25, 20, 15, 10], 300, 3),
    ('호출부 실제 모양(null 섞임)',   [486, None, 66, 52, 48, 41, 33, 22, 14, 9, 5], 300, 1),
    # [260806 2차 운영자 「차이가 심하면 항상 켜라」] 대형 공연이 여러 편인 해 = 이 레포의 흔한 현실 분포.
    #   1차(잘림 상한 1/3 미만)에서는 전건 null이었다(평의회2 실측 = 뭉갠 분포의 36.6% 미발동).
    ('대형 4편 + 소규모(여울마루형)', [486, 470, 452, 431, 66, 52, 40, 28, 12, 5, 3], 400, 4),
    ('이상치 4건 · 극단 뭉갬',        [5000, 4800, 4600, 4400, 20, 15, 10, 8, 5], 400, 4),
]
# NOFIRE: [이름, 값 배열, plotPx]
NOFIRE = [
    ('완만한 선형 분포 10건',  [100, 95, 90, 85, 80, 75, 70, 65, 60, 55], 300),
    ('완만한 선형 분포 6건',   [60, 55, 50, 45, 40, 35], 300),
    ('표본 5건(하한 미만)',    [500, 50, 40, 30, 20], 300),
    ('음수 포함(환불 정산)',   [486, 66, 52, 48, 41, 33, -5, 14, 9, 5], 300),
    ('차트 너무 짧음(99px)',   [486, 66, 52, 48, 41, 33, 22, 14, 9, 5], 99),
    # ⚠ 이 한 줄만 **운영 방침 종속**(잘림 비율 상한 계수) — 나머지 5종은 함수 주석이 명문화한 불변 조건이다.
    #   260806 2차에 병렬 세션이 상한을 k*3(1/3 미만) → k*2(절반 미만)로 개정하면서 이 분포는 6/16 = 37.5%라
    #   「발동이 정상」으로 뜻이 바뀐다. 그 개정이 착지하면 이 줄을 FIRE(n=6)로 옮기고 **사유를 커밋 메시지에 명기**한다
    #   (기대값 개정 = 운영 방침 변경 · nomute `rubric_regress` 관례 동축). 지우지는 않는다 — 상한이 통째로
    #   사라지는 것(K5)은 어느 계수에서도 위반이라 이 자리가 유일한 검출기다.
    ('다수가 압축 구간(16건 중 6건)',
     [90, 88, 86, 84, 82, 80, 30, 28, 26, 24, 22, 20, 18, 16, 14, 12], 300),
    # [260806 2차] 「두 무리로 갈린 분포」 = 배율은 2.5~3.9배지만 본체 최대가 화면에 멀쩡히 남는다(83~126px).
    #   접으면 상위 무리가 압축 구간에 몰려 서로 비교가 안 되는 오독이 된다 → 30% 술어(디자인기틀 §2 #16)가 막는 자리.
    ('두 무리(상위 5 · 하위 5)',   [183, 168, 130, 118, 112, 47, 41, 37, 30, 23], 378),
    ('두 무리(상위 7 · 하위 7)',   [194, 174, 171, 166, 159, 159, 156, 70, 61, 56, 49, 32, 29, 23], 378),
    # [260806 2차 · 평의회1] 레포의 6년 실주문에서 재현되는 형태 — 본체가 낮게·촘촘히 앉아 있지만
    #   최소 막대가 44.7px(차트의 11.8%)라 **아무것도 안 뭉개졌다**. 접으면 관객 2.3배 차이가 높이 14%로 그려진다.
    ('2024 실관객수(본체 촘촘)',   [7437, 7339, 3520, 1509, 1440, 1434, 1183, 1132, 1114, 880], 378),
]
# ── 오발동 회귀(속성 검사) ────────────────────────────────────────────────────
# 계약 원문(index.html 갭 술어 주석) = 「끊는 자리에 **진짜 빈 구간**이 있어야 한다」.
# → 그 대우: 정렬했을 때 **이웃 비가 전부 2배 미만**인 분포(= 어디에도 빈 구간이 없다)는 절대 발동하면 안 된다.
#   규칙을 베끼는 게 아니라 계약을 뒤집어 쓴 **속성**이라, 판정 내부를 어떻게 고치든 이 문장은 그대로 성립한다.
# 표본 = 시드 고정 3계열(균등·로그·완만) × plotPx 5높이(fit 축소 화면 포함 · 평의회4 축).
REGRESS_N = 600
REGRESS_PX = [100, 110, 160, 300, 520]

# ── node 하네스 — 정본 함수를 그대로 실행하고 판정 결과만 JSON으로 뱉는다 ──
HARNESS = r'''
import {readFileSync} from 'node:fs';
const fn = readFileSync(process.argv[2],'utf-8');
const spec = JSON.parse(readFileSync(process.argv[3],'utf-8'));
let mod;
try { mod = new Function(fn + '\nreturn {_bizBarBreak:_bizBarBreak,_bizNiceStep:_bizNiceStep};')(); }
catch(e){ console.log(JSON.stringify({err:'정본 함수 구간이 단독 실행 불가(문법·의존 파손): '+String(e).split('\n')[0]})); process.exit(0); }
const B = mod._bizBarBreak;
if (typeof B !== 'function'){ console.log(JSON.stringify({err:'_bizBarBreak 미정의'})); process.exit(0); }
const out = {fire:[], nofire:[], regress:0, contract:[]};
for (const c of spec.fire){
  let r=null, e=null;
  try { r = B(c[1], c[2]); } catch(x){ e = String(x).split('\n')[0]; }
  const rec = {name:c[0], want:c[3], fired:!!r, err:e};
  if (r){ rec.n=r.n; rec.B=r.B; rec.step=r.step;
    // map 계약 = 「본체는 손 안 댐 · 접힌 건 띠 위로 · 순서 보존」
    const pos = c[1].filter(v=>typeof v==='number' && v>0).sort((a,b)=>b-a);
    let body_ok=true, above_ok=true, mono_ok=true, prev=-Infinity;
    for (const v of pos.slice().reverse()){
      const y = r.map(v);
      if (v<=r.B && Math.abs(y-v)>1e-9) body_ok=false;      // 본체 = 실값 = 실높이
      if (v>r.B && !(y>r.hi)) above_ok=false;               // 접힌 값은 띠 위
      if (!(y>=prev-1e-9)) mono_ok=false; prev=y;           // 순서 뒤집힘 0
    }
    rec.body_ok=body_ok; rec.above_ok=above_ok; rec.mono_ok=mono_ok;
  }
  out.fire.push(rec);
}
for (const c of spec.nofire){
  let r=null, e=null;
  try { r = B(c[1], c[2]); } catch(x){ e = String(x).split('\n')[0]; }
  out.nofire.push({name:c[0], fired:!!r, err:e, n:r?r.n:null, B:r?r.B:null});
}
// 오발동 회귀(속성) — 「어디에도 빈 구간(이웃 2배)이 없는 분포」는 어떤 높이에서도 발동 금지
let s=20260806; const rnd=()=>{ s=(s*1103515245+12345)&0x7fffffff; return s/0x7fffffff; };
const gen=(n,mode)=>{ const a=[]; for(let i=0;i<n;i++) a.push(
  mode===0 ? 10+rnd()*1000 :
  mode===1 ? 10*Math.pow(10,rnd()*2.5) :
             (50+rnd()*500)*(0.35+0.65*rnd()) ); return a; };
const noGapDist=a=>{ const p=a.slice().sort((x,y)=>y-x);
  for(let i=0;i<p.length-1;i++) if(p[i]>=p[i+1]*2) return false; return true; };
const ex=[]; let kept=0;
for (let t=0; kept<spec.regress && t<400000; t++){
  const a = gen(6+Math.floor(rnd()*16), t%3);
  if (!noGapDist(a)) continue;
  kept++;
  for (const px of spec.regress_px){
    let r=null; try{ r=B(a,px); }catch(x){}
    if (r){ out.regress++; if(ex.length<2) ex.push({vals:a.map(v=>+v.toFixed(1)), plotPx:px, B:r.B, n:r.n}); }
  }
}
out.regress_kept = kept;
out.regress_ex = ex;
console.log(JSON.stringify(out));
'''


def _extract(src):
    """index.html에서 정본 함수 구간을 원문 그대로 잘라낸다. 앵커 부재 = fail-closed."""
    i = src.find(HEAD)
    if i < 0:
        return None, '앵커 「%s」 미발견 — 함수 선언이 개서·삭제됐다(조용한 미검사 차단).' % HEAD
    j = src.find(TAIL, i)
    if j < 0:
        return None, '꼬리 앵커 「%s」 미발견 — 구간 경계를 못 잡는다.' % TAIL
    blk = src[i:j]
    if 'function _bizBarBreak(' not in blk:
        return None, '구간 안에 _bizBarBreak 정의가 없다(함수 이동?).'
    return blk, None


def _run(fnsrc, spec):
    """정본 함수 원문 + 케이스 명세를 node로 실행. (결과dict, 오류문자열)"""
    with tempfile.TemporaryDirectory() as td:
        fp = os.path.join(td, 'fn.js')
        sp = os.path.join(td, 'spec.json')
        hp = os.path.join(td, 'h.mjs')
        with open(fp, 'w', encoding='utf-8') as f:
            f.write(fnsrc)
        with open(sp, 'w', encoding='utf-8') as f:
            json.dump(spec, f)
        with open(hp, 'w', encoding='utf-8') as f:
            f.write(HARNESS)
        try:
            p = subprocess.run(['node', hp, fp, sp], capture_output=True, text=True, timeout=60)
        except FileNotFoundError:
            return None, 'SKIP'
        except subprocess.TimeoutExpired:
            return None, '재판정 타임아웃(60s) — 판정 함수가 무한 루프에 빠졌을 수 있다.'
        if p.returncode != 0:
            return None, 'node 실행 실패: ' + (p.stderr or '').strip().split('\n')[0]
        try:
            return json.loads(p.stdout.strip().splitlines()[-1]), None
        except Exception as e:
            return None, '하네스 출력 파싱 실패: %s / %s' % (e, (p.stdout or '')[:200])


def judge(fnsrc):
    """정본 함수 재판정 → (fails, 결과dict|None, skip사유|None)"""
    spec = {
        'fire': [[n, [(v if v is not None else None) for v in vals], px, want] for n, vals, px, want in FIRE],
        'nofire': [[n, vals, px] for n, vals, px in NOFIRE],
        'regress': REGRESS_N,
        'regress_px': REGRESS_PX,
    }
    res, err = _run(fnsrc, spec)
    if err == 'SKIP':
        return [], None, 'node 미탐지 — 재판정 건너뜀(차단 안 함).'
    if err:
        return ['재판정 실행 불가: ' + err], None, None
    if res.get('err'):
        return ['정본 함수 재판정 불가 — ' + res['err']], None, None

    fails = []
    for r in res['fire']:
        if r.get('err'):
            fails.append('발동해야 함 · %s → 예외: %s' % (r['name'], r['err']))
        elif not r['fired']:
            fails.append('발동해야 함 · %s → **null(규칙이 꺼졌다)**' % r['name'])
        else:
            if r['n'] != r['want']:
                fails.append('접는 개수 어긋남 · %s → n=%s (기대 %s · B=%s)' % (r['name'], r['n'], r['want'], r['B']))
            if not r.get('body_ok'):
                fails.append('map 계약 위반 · %s → **본체 값이 접혔다**(B 이하는 실값=실높이여야 한다)' % r['name'])
            if not r.get('above_ok'):
                fails.append('map 계약 위반 · %s → 접힌 값이 ≈띠 위로 안 올라감' % r['name'])
            if not r.get('mono_ok'):
                fails.append('map 계약 위반 · %s → 값 순서가 뒤집힘(큰 값이 아래로)' % r['name'])
    for r in res['nofire']:
        if r.get('err'):
            fails.append('발동하면 안 됨 · %s → 예외: %s' % (r['name'], r['err']))
        elif r['fired']:
            fails.append('발동하면 안 됨 · %s → **오발동**(B=%s · %s건 압축)' % (r['name'], r['B'], r['n']))
    if res['regress']:
        ex = res.get('regress_ex') or []
        fails.append('오발동 회귀 · **빈 구간 없는 분포**(이웃 비 전부 2배 미만) %d세트 × %d높이 중 '
                     '**%d건 발동**(기대 0) 예: %s'
                     % (res.get('regress_kept', REGRESS_N), len(REGRESS_PX), res['regress'],
                        json.dumps(ex[:1], ensure_ascii=False)))
    return fails, res, None


# ── 킬테스트 — 판정을 일부러 망가뜨린 사본에서 rc=1이 나오는지 자기검증 ──
KILLS = [
    ('K1 구판 단일 절단점 부활(260804 실사고 원복)',
     lambda s: s.replace('for(var ci=1;ci<pos.length;ci++){',
                         'for(var ci=Math.floor(pos.length*0.2);ci<=Math.floor(pos.length*0.2);ci++){'), True),
    ('K2 갭 술어(빈 구간 요구) 제거',
     lambda s: re.sub(r'\n\s*if\(pos\[k-1\]<pos\[k\]\*2\)continue;[^\n]*', '', s), True),
    ('K3 규칙 통째 off(첫 줄 return null)',
     lambda s: s.replace('function _bizBarBreak(vals,plotPx){',
                         'function _bizBarBreak(vals,plotPx){ return null;'), True),
    ('K4 본체 값까지 접음(map 계약 파손)',
     lambda s: s.replace('if(!(v>this.B))return v;', 'if(!(v>this.B))return v*0.9;'), True),
    # 계수는 개정될 수 있으므로(260806 2차 k*3→k*2) 리터럴이 아니라 형태로 잡는다 — 킬테스트가 조용히 죽는 걸 막는다.
    ('K5 잘림 비율 상한 제거(다수 압축 허용)',
     lambda s: re.sub(r'\n\s*if\(k\*\d+>pos\.length\)continue;[^\n]*', '', s), True),
    ('K6 위양성 대조 — 무변경(현행 코드)',
     lambda s: s, False),
]


def killtest(fnsrc):
    print('── 킬테스트(자기검증) ──────────────────────────────────────')
    bad = 0
    for name, mut, want_fail in KILLS:
        mutated = mut(fnsrc)
        if want_fail and mutated == fnsrc:
            print('  ⚠ %s → **변이 미적용**(정규식·리터럴이 코드와 안 맞음 = 킬테스트 자체가 죽었다)' % name)
            bad += 1
            continue
        fails, _, skip = judge(mutated)
        if skip:
            print('  · %s → SKIP(%s)' % (name, skip)); continue
        got_fail = bool(fails)
        ok = (got_fail == want_fail)
        print('  %s %s → rc=%d %s' % ('✅' if ok else '❌', name, 1 if got_fail else 0,
                                      ('· ' + fails[0]) if fails else ''))
        if not ok:
            bad += 1
    print('── 킬테스트 결과: %s' % ('전건 통과' if not bad else '%d건 실패' % bad))
    return 1 if bad else 0


def main():
    if not os.path.isfile(INDEX):
        print('❌ check_break_rule — index.html 미실존'); return 1
    src = open(INDEX, encoding='utf-8').read()
    fnsrc, err = _extract(src)
    if err:
        print('❌ check_break_rule 실패 — ' + err)
        print('   (앵커 소실 = fail-closed. 함수를 옮겼으면 이 게이트의 HEAD/TAIL도 같이 고쳐라.)')
        return 1

    if '--killtest' in sys.argv:
        return killtest(fnsrc)

    fails, res, skip = judge(fnsrc)
    if skip:
        print('⏭ check_break_rule SKIP — ' + skip); return 0
    if fails:
        print('❌ check_break_rule 실패 — 축 중략(≈) 판정이 계약과 어긋난다:')
        for f in fails:
            print('  ·', f)
        print('  정본 = index.html `_bizBarBreak` · 계약 = 「이상치가 나머지를 뭉개면 접고, 고른 분포는 안 접는다」.')
        print('  ⚠ 이 게이트는 값이 아니라 **발동 여부**를 본다 — 화면은 멀쩡해 보이므로 눈으로는 안 잡힌다.')
        return 1
    fired = ' · '.join('%s(n=%d,B=%g)' % (r['name'], r['n'], r['B']) for r in res['fire'])
    print('✅ check_break_rule 통과 — 발동 %d종 / 미발동 %d종 / 오발동 회귀 %d세트×%d높이 0건.'
          % (len(FIRE), len(NOFIRE), res.get('regress_kept', REGRESS_N), len(REGRESS_PX)))
    print('   발동 실측: ' + fired)
    return 0


if __name__ == '__main__':
    sys.exit(main())
