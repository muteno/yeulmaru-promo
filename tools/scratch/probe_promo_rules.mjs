import fs from 'fs';
const s=fs.readFileSync('index.html','utf8');
const pick=(n)=>{const i=s.indexOf('function '+n);let d=0,j=s.indexOf('{',i);for(let k=j;k<s.length;k++){if(s[k]==='{')d++;else if(s[k]==='}'){d--;if(!d)return s.slice(i,k+1);}}};
const src=['_slotRows','_slotKeyOf','_slotSameKey','_promoSlotConflict','_promoAdjacentDays'].map(pick).join('\n');
const rec=JSON.parse(fs.readFileSync('이관본/첨부/예울마루_데이터.json','utf8')).records;
rec.forEach((r,i)=>{r._rowIndex=i+2;});   // 런타임 필드 복원 — 없으면 자기 자신과 충돌로 잡힌다
const ctx={records:rec,
  platShort:(p)=>{if(!p)return'';if(p.includes('카카오'))return'카카오';if(p.includes('인스타'))return'인스타';if(p.includes('블로그')||p.includes('맘카페'))return'블로그·맘카페';if(p.includes('문자'))return'문자';if(p.includes('B2B'))return'B2B';if(p.includes('기타'))return'기타';return p;},
  getRecDateKey:(r)=>`${r['연도']||''}-${String(r['월']||'').padStart(2,'0')}-${String(r['일']||'').padStart(2,'0')}`,
  _isDraftRec:(r)=>!!(r&&(String(r['임시저장']||'').toUpperCase()==='Y'||String(r['진행 상태']||'').trim()==='임시'))};
const names=Object.keys(ctx);
const F=new Function(...names, src+'; return {_slotRows,_promoSlotConflict,_promoAdjacentDays,_slotKeyOf};')(...names.map(n=>ctx[n]));
console.log('모집단: records',rec.length,'→ 슬롯 점유',F._slotRows().length,'(취소·임시·특별일정 제외)');
// 과거 위반 집계 — 각 행을 자기 자신 제외하고 판정
let k=0,sm=0;
for(const r of F._slotRows()){
  const c=F._promoSlotConflict(r['플랫폼 1'],r['플랫폼 2'],ctx.getRecDateKey(r),r._rowIndex);
  if(c){ if(ctx.platShort(r['플랫폼 1'])==='카카오')k++; else sm++; }
}
console.log(`과거 위반 — 카카오톡 ${k/2}쌍 · 문자 ${sm/2}쌍 (수신자군 분리 적용)`);
// 수신자군 미분리였다면?
const naive=new Map(); let n2=0;
for(const r of F._slotRows()){ if(ctx.platShort(r['플랫폼 1'])!=='문자')continue;
  const d=ctx.getRecDateKey(r); naive.set(d,(naive.get(d)||0)+1); }
for(const [d,c] of naive) if(c>1) n2++;
console.log(`  ↳ 수신자군 미분리로 셌다면 문자 위반일 ${n2}일 (= 정상 운영이 위반으로 뜸)`);
// 새로 등록한 22건 중 8/5·8/6 카톡 = 연일 경고 대상인가
const adj=F._promoAdjacentDays('카카오톡','2026-08-06',null);
console.log('8/6 카톡의 인접일 카톡:',adj.map(a=>a.date+' '+(a.rec['콘텐츠 제목']||'')).join(' / ')||'없음');
console.log('8/6 카톡 K1 판정:',F._promoSlotConflict('카카오톡',null,'2026-08-06',null)||'통과(같은 날 카톡 1건뿐)');
