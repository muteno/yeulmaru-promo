import fs from 'fs';
const s=fs.readFileSync('index.html','utf8');
const pick=(n)=>{const i=s.indexOf('function '+n);let d=0;for(let k=s.indexOf('{',i);k<s.length;k++){if(s[k]==='{')d++;else if(s[k]==='}'){d--;if(!d)return s.slice(i,k+1);}}};
const src=['_pcT','_pcDaysTo','_slotRows','_slotKeyOf','_slotSameKey','_promoAdjacentDays','_promoCheckScan'].map(pick).join('\n');
const db=JSON.parse(fs.readFileSync('이관본/miso_db.json','utf8')).datasets.programs.rows;
const iso=(v)=>{ if(v==null||v==='')return ''; const t=String(v).trim();
  if(/^\d{4}-\d{2}-\d{2}/.test(t))return t.slice(0,10);
  const n=Number(t); if(!isNaN(n)&&n>1000){const d=new Date(Date.UTC(1899,11,30)+n*86400000);return d.toISOString().slice(0,10);} return ''; };
const tm={'공연':'c','전시':'e','예술교육':'a','대관':'r'};
const PERFS=db.map(r=>({f:r['풀네임']||'',n:r['줄임말']||'',id:String(r['프로그램ID']||'').trim(),t:tm[r['콘텐츠구분']]||'c',
  ss:iso(r['판매시작일']),se:iso(r['판매종료일']),e:iso(r['종료일']),ps:iso(r['홍보시작일']),pf:String(r['홍보노출']??'').trim()}));
const rec=JSON.parse(fs.readFileSync('이관본/첨부/예울마루_데이터.json','utf8')).records; rec.forEach((r,i)=>r._rowIndex=i+2);
const ctx={PERFS,records:rec,
  getTodayKey:()=>'2026-08-04',
  _promoOn:(p)=>{const f=p.pf||''; return f!==''?/^(true|1|y|yes|o|on|예|t)$/i.test(f.trim()):!!p.ps;},
  _isDraftRec:(r)=>!!(r&&(String(r['임시저장']||'').toUpperCase()==='Y'||String(r['진행 상태']||'').trim()==='임시')),
  getRecDateKey:(r)=>`${r['연도']||''}-${String(r['월']||'').padStart(2,'0')}-${String(r['일']||'').padStart(2,'0')}`,
  platShort:(p)=>{if(!p)return'';if(p.includes('카카오'))return'카카오';if(p.includes('문자'))return'문자';if(p.includes('인스타'))return'인스타';if(p.includes('블로그')||p.includes('맘카페'))return'블로그·맘카페';return p;},
  _findPerfByName:(n)=>PERFS.find(p=>String(p.f||'').trim()===String(n||'').trim()||String(p.n||'').trim()===String(n||'').trim())||null,
  getApplyMonths:()=>['2026-07']};
const N=Object.keys(ctx);
const scan=new Function(...N, src+'; return _promoCheckScan();')(...N.map(k=>ctx[k]));
console.log('A0 홍보불가+판매임박:',scan.a0.length,'건 →',scan.a0.map(x=>`${x.p.f.slice(0,20)}(D-${x.d})`).join(' · '));
console.log('A5 티켓오픈 임박:',scan.a5.length,'· A2 마감임박+계획0:',scan.a2.length,'· 연일:',scan.adj.length);
console.log('위생:',scan.hyg.map(h=>h.k+' — '+h.v.slice(0,60)).join('\n      '));
console.log('통계:',JSON.stringify(scan.stat));
