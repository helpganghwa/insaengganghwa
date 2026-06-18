// 최종 108종 검수 폼 생성기 — 기존 리뷰 HTML에서 아이템 데이터를 추출해 self-contained 폼을 만든다.
import { readFileSync, writeFileSync } from 'fs';
const html = readFileSync('sprites-test-review.html', 'utf8');
function extract(name: string) {
  const m = html.match(new RegExp(`const ${name} = (\\[[\\s\\S]*?\\n\\])\\s*;`));
  if (!m) throw new Error('no ' + name);
  return eval(m[1]);
}
const SETS = extract('SETS');
const SETS2 = extract('SETS2');
const ALL = [...SETS, ...SETS2];
// region|name → item
const map: Record<string, any> = {};
const mapName: Record<string, any> = {};
for (const s of ALL) for (const it of s.items) {
  const rec = { name: it.name, lore: it.lore || '', dir: it.objAnim ? it.objAnim.dir : null, n: it.objAnim ? it.objAnim.n : 15, st: it.staticSrc, slot: it.slot };
  map[`${s.region}|${it.name}`] = rec; mapName[it.name] = rec;
}
// 변경 검토(before/after) 데이터
const keyMap: Record<string, any> = {};
for (const s of ALL) for (const it of s.items) keyMap[it.key] = { name: it.name, lore: it.lore || '', dir: it.objAnim ? it.objAnim.dir : null, n: it.objAnim ? it.objAnim.n : 15 };
let CH: any[] = [];
try {
  const raw = JSON.parse(readFileSync('scripts/_changes.json', 'utf8'));
  CH = raw.map((c: any) => {
    const km = keyMap[c.key] || {};
    const r: any = { region: c.region, set: c.set, name: km.name || c.key, field: c.field, before: c.before };
    if (c.field === '애니') { r.beforeDir = (km.dir || '').replace('anim-obj', 'anim-before'); r.afterDir = km.dir; r.n = km.n; }
    else if (c.field === '이름') { r.after = km.name; }
    else { r.after = km.lore; }
    return r;
  });
} catch (e) { console.log('no _changes.json'); }
const FINAL: [string, string[][]][] = [
  ['왕국', [
    ['무도회의 한 수', '이름 없는 드레스', '이름을 가린 가면'],
    ['행렬의 창', '별을 두른 망토', '별이 박힌 왕관'],
    ['왕을 짊어진 대검', '맹세를 쥔 손', '사자의 증표'],
    ['풀리지 않는 질문', '별을 읽는 외투', '대답하지 않는 나침반'],
    ['동트는 맹세', '여명의 벽', '새벽지기의 표식'],
    ['매발톱 장갑', '매를 받는 토시', '방울 달린 매 두건'],
  ]],
  ['늪지대', [
    ['이슬로 벼린 검', '수련이 피는 드레스', '진주를 엮은 화관'],
    ['안개가 건넨 곡도', '늪이 삼킨 이끼갑옷', '홀리는 등불'],
    ['퉤! 하는 대롱', '개구리 탈 망토', '반딧불 충전기'],
    ['늪이 건넨 삼지창', '늪빛 흉갑', '부르면 모이는 뿔피리'],
    ['한 방 작살', '도롱이', '반딧불 통발'],
    ['길잡이 낫', '안갯속 길손의 외투', '안내인의 증표'],
  ]],
  ['화산', [
    ['춤추는 쌍불꽃', '불길 케이프', '불꽃 부채'],
    ['재에서 당기는 활', '다시 타오른 가슴', '꺼지지 않는 깃'],
    ['재를 다스리는 곡도', '용암으로 짠 드레스', '불씨를 얹은 보관'],
    ['비늘을 깬 부리', '용을 노려본 투구', '베어 낸 송곳니'],
    ['재를 가르는 칼', '식지 않는 흉갑', '재가 흐르는 모래시계'],
    ['불에서 난 언월', '용골 방패', '잠들지 않는 용안'],
  ]],
  ['신전', [
    ['무지개를 문 지팡이', '빛으로 짠 예복', '새벽빛 관'],
    ['비추는 은부채', '되비추는 거울 방패', '거울 너머의 열쇠'],
    ['갈라진 거석의 주먹', '안에서 타오르는 갑옷', '잠들지 않는 심장석'],
    ['봄을 겨눈 석궁', '맑은 서리의 관', '식지 않는 심장'],
    ['묻고 두드리는 장봉', '한쪽 어깨 띠', '흔들리는 향로'],
    ['기적인 척 지팡이', '자칭 훈장 사제복', '철사로 띄운 후광'],
  ]],
  ['타락천사', [
    ['나비 레이피어', '나비 드레스', '나비 떼 브로치'],
    ['노을이 앉는 검', '저무는 해의 날개', '황혼을 담은 호박'],
    ['자비의 가는 검', '장미 날개 갑옷', '지지 않는 장미 후광'],
    ['네가 던진 빛', '부러진 적 있는 날개', '되찾은 후광'],
    ['두근 화살', '구름 갑옷', '구름 두른 금 후광'],
    ['빛바랜 맹세', '사슬과 한쪽 날개', '마지막 빛고리'],
  ]],
  ['오크 부락', [
    ['돌아오는 뼈', '소리 없는 가죽 부츠', '엄니 귀고리'],
    ['묻지 않는 지팡이', '깃털 두른 침묵', '조상의 깃발'],
    ['조상이 쥔 자루', '조상의 얼굴', '손목에 감은 조상'],
    ['산을 쪼갠 날', '한 발도 안 밀린 방패', '엄니에 새긴 무용담'],
    ['두드리는 북채', '북이 된 방패', '한 잔의 보람'],
    ['천둥을 문 도끼', '벼락 맞고도 선 가슴', '폭풍을 가둔 부적'],
  ]],
];
const missing: string[] = [];
const DATA = FINAL.map(([region, sets]) => ({
  region,
  sets: sets.map((names) => names.map((nm) => {
    const rec = map[`${region}|${nm}`] || mapName[nm];
    if (!rec) { missing.push(`${region}/${nm}`); return { name: nm, lore: '(데이터 없음)', dir: null, n: 15, st: '', slot: '' }; }
    return rec;
  })),
}));
if (missing.length) console.log('MISSING:', missing.join(', '));

const page = `<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>최종 108종 검수 폼</title>
<style>
  :root{color-scheme:dark}*{box-sizing:border-box}
  body{margin:0;padding:16px 14px 80px;font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo",sans-serif;background:#0c0d12;color:#e7e7ea;max-width:1100px;margin-inline:auto}
  h1{font-size:19px;margin:0 0 2px}.sub{font-size:12px;color:#9a9aa6;margin:0 0 12px}
  .tool{position:sticky;top:0;z-index:10;background:#0c0d12;padding:8px 0;display:flex;gap:8px;align-items:center;flex-wrap:wrap;border-bottom:1px solid #1c1d24;margin-bottom:10px}
  .tool button{font:inherit;font-size:12px;font-weight:700;border:1px solid #2a2b34;border-radius:8px;padding:6px 10px;background:#14151c;color:#c9cad3;cursor:pointer}
  .tool .ct{font-size:12px;color:#c9a24a;font-weight:700}
  textarea#out{width:100%;height:0;opacity:0;font:11px ui-monospace,monospace;background:#0c0d12;color:#cfeacc;border:0;border-radius:8px;padding:0}
  textarea#out.show{height:200px;opacity:1;padding:8px;border:1px solid #2a2b34;margin-bottom:8px}
  h2{font-size:16px;color:#c9a24a;font-weight:800;margin:20px 0 6px;border-bottom:1px solid #23242c;padding-bottom:5px}
  .set{border:1px solid #23242c;border-radius:12px;background:#0f1017;margin-bottom:10px;overflow:hidden}
  .set .sh{font-size:13px;font-weight:800;color:#e0b94a;background:#14151c;padding:6px 10px}
  .row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;padding:8px}
  @media(max-width:720px){.row{grid-template-columns:1fr}}
  .card{border:1px solid #23242c;border-radius:10px;background:#111219;overflow:hidden;display:flex;flex-direction:column}
  .card.flag{border-color:#a83a48;box-shadow:0 0 0 1px #a83a48}
  .stage{height:118px;display:flex;align-items:center;justify-content:center;position:relative;background-image:linear-gradient(45deg,#23242c 25%,transparent 25%),linear-gradient(-45deg,#23242c 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#23242c 75%),linear-gradient(-45deg,transparent 75%,#23242c 75%);background-size:14px 14px;background-position:0 0,0 7px,7px -7px,-7px 0;background-color:#14151c}
  .stage img{image-rendering:pixelated;width:104px;height:104px;object-fit:contain}
  .stage .tg{position:absolute;top:4px;right:4px;display:flex;gap:2px}
  .stage .tg button{font:inherit;font-size:9px;font-weight:700;border:1px solid #2a2b34;border-radius:5px;padding:1px 5px;background:#14151ccc;color:#c9cad3;cursor:pointer}
  .stage .tg button.on{background:#d4a017;color:#1a1300;border-color:#d4a017}
  .stage .slot{position:absolute;left:4px;top:4px;font-size:9px;font-weight:800;color:#1a1300;background:#d4a017;border-radius:5px;padding:1px 5px}
  .meta{padding:8px;display:flex;flex-direction:column;gap:5px}
  .nm{font-size:13px;font-weight:800;color:#fff}
  .lore{font-size:10px;line-height:1.5;color:#bcbdc7;white-space:pre-line}
  .rej{display:flex;flex-direction:column;gap:3px;margin-top:2px}
  .rej label{font-size:9px;font-weight:700;color:#9a9aa6}
  .rej textarea{font:inherit;font-size:10px;width:100%;box-sizing:border-box;border:1px solid #2a2b34;border-radius:5px;background:#0c0d12;color:#f0c8c8;padding:4px;resize:vertical;min-height:30px}
  .rej textarea:focus{border-color:#a83a48;outline:none}
  .rej .ttl{display:flex;gap:4px;align-items:center}
  .rej .ttl .tag{font-size:8px;font-weight:800;border-radius:4px;padding:1px 4px}
  .tag.nm{background:#23303f;color:#8ab6e0}.tag.st{background:#2a2030;color:#c89ae0}.tag.an{background:#16361f;color:#7ee0a0}
  #cmp{margin-bottom:20px}
  .cmpc{border:1px solid #2a2b34;border-radius:10px;background:#0f1017;padding:8px;margin-bottom:8px}
  .cmpc.roll{border-color:#8a8b97;box-shadow:0 0 0 1px #8a8b97}.cmpc.acc{border-color:#2a6b3a;box-shadow:0 0 0 1px #2a6b3a}.cmpc.rj{border-color:#a83a48;box-shadow:0 0 0 1px #a83a48}
  .cmpc .ch{font-size:12px;color:#c9cad3;margin-bottom:6px}.cmpc .ch .fld{font-size:9px;font-weight:800;background:#23303f;color:#8ab6e0;border-radius:4px;padding:1px 5px;margin-left:4px}
  .ba{display:grid;grid-template-columns:1fr 1fr;gap:8px}
  .ba .col{border:1px solid #1c1d24;border-radius:8px;padding:6px;background:#0c0d12;display:flex;flex-direction:column;align-items:center}
  .ba .lbl{font-size:9px;font-weight:800;color:#e08a8a;margin-bottom:4px;align-self:flex-start}.ba .lbl.aftl{color:#7ee0a0}
  .ba .txt{font-size:11px;line-height:1.55;color:#b9bac4;white-space:pre-line}.ba .txt.aft{color:#e2eae2}
  .ba img.shot{width:104px;height:104px;image-rendering:pixelated;object-fit:contain;background-image:linear-gradient(45deg,#23242c 25%,transparent 25%),linear-gradient(-45deg,#23242c 25%,transparent 25%);background-size:12px 12px}
  .dec{display:flex;gap:6px;margin-top:7px}
  .dec button{flex:1;font:inherit;font-size:11px;font-weight:700;border:1px solid #2a2b34;border-radius:6px;padding:6px 0;background:#14151c;color:#c9cad3;cursor:pointer}
  .dec button.on{background:#d4a017;color:#1a1300;border-color:#d4a017}
  .cmpc .rr{width:100%;box-sizing:border-box;margin-top:0;height:0;opacity:0;overflow:hidden;font:inherit;font-size:10px;border:0;border-radius:5px;background:#0c0d12;color:#f0c8c8;padding:0;resize:vertical}
  .cmpc.rj .rr{height:auto;min-height:36px;opacity:1;margin-top:6px;padding:4px;border:1px solid #a83a48}
</style></head><body>
<h1>최종 108종 검수 폼</h1>
<p class="sub">지역 × 세트별 정렬 · 각 아이템마다 이름/스토리/애니 리젝사유를 적고 [제출용 복사]로 내보내세요. 입력은 자동 저장됩니다.</p>
<div class="tool"><span class="ct" id="ct"></span><button id="cdcopy">🔧 변경 결정 복사</button><button id="copy">📋 신규 리젝 복사</button><button id="clr">전체 초기화</button></div>
<textarea id="out" readonly></textarea>
<h2 id="cmph" style="display:none">🔧 변경 검토 (왕국·늪지대) — 전/후 비교 후 롤백·채택·추가리젝 선택</h2>
<div id="cmp"></div>
<div id="app"></div>
<script>
const DATA = ${JSON.stringify(DATA)};
const CHANGES = ${JSON.stringify(CH)};
const SLOT_KO = {weapon:'무기',armor:'방어구',accessory:'장신구'};
const LS='finalqa-v1'; const RV=JSON.parse(localStorage.getItem(LS)||'{}'); const save=()=>localStorage.setItem(LS,JSON.stringify(RV));
const app=document.getElementById('app'); const anims=[];
// 변경 검토 섹션
const CD_LS='finalqa-decide-v1'; const CD=JSON.parse(localStorage.getItem(CD_LS)||'{}'); const cds=()=>localStorage.setItem(CD_LS,JSON.stringify(CD));
if(CHANGES.length){document.getElementById('cmph').style.display='';}
const cmp=document.getElementById('cmp');
CHANGES.forEach((c,i)=>{
  const cid='c'+i; const d=CD[cid]||(CD[cid]={pick:'',rej:''});
  let bH,aH;
  if(c.field==='애니'){bH='<img class="shot" src="'+c.beforeDir+'/0.png" data-dir="'+c.beforeDir+'" data-n="'+c.n+'">';aH='<img class="shot" src="'+c.afterDir+'/0.png" data-dir="'+c.afterDir+'" data-n="'+c.n+'">';}
  else{bH='<div class="txt">'+c.before+'</div>';aH='<div class="txt aft">'+c.after+'</div>';}
  const card=document.createElement('div'); card.className='cmpc';
  card.innerHTML='<div class="ch">'+c.region+' · 세트'+c.set+' · <b>'+c.name+'</b><span class="fld">'+c.field+'</span></div>'+
    '<div class="ba"><div class="col"><div class="lbl">변경 전</div>'+bH+'</div><div class="col"><div class="lbl aftl">변경 후</div>'+aH+'</div></div>'+
    '<div class="dec"><button data-p="rollback">↩ 롤백</button><button data-p="accept">✓ 채택</button><button data-p="rereject">✗ 추가리젝</button></div>'+
    '<textarea class="rr" placeholder="추가 리젝 사유를 적어 주세요">'+(d.rej||'')+'</textarea>';
  cmp.appendChild(card);
  const refl=()=>{card.querySelectorAll('.dec button').forEach(b=>b.classList.toggle('on',b.dataset.p===d.pick));card.classList.toggle('roll',d.pick==='rollback');card.classList.toggle('acc',d.pick==='accept');card.classList.toggle('rj',d.pick==='rereject');};
  card.querySelectorAll('.dec button').forEach(b=>b.onclick=()=>{d.pick=b.dataset.p;cds();refl();});
  const rr=card.querySelector('.rr'); rr.addEventListener('input',()=>{d.rej=rr.value;cds();});
  refl();
  if(c.field==='애니')[...card.querySelectorAll('img.shot[data-dir]')].forEach(img=>{img._anim=true;anims.push({img,dir:img.dataset.dir,n:+img.dataset.n,i:0});});
});
DATA.forEach((reg,ri)=>{
  const h=document.createElement('h2'); h.textContent=reg.region; app.appendChild(h);
  reg.sets.forEach((items,si)=>{
    const sd=document.createElement('div'); sd.className='set';
    const sh=document.createElement('div'); sh.className='sh'; sh.textContent='세트 '+(si+1); sd.appendChild(sh);
    const row=document.createElement('div'); row.className='row';
    items.forEach((it,ii)=>{
      const id=ri+'#'+si+'#'+ii;
      const rv=RV[id]||(RV[id]={nm:'',st:'',an:''});
      const hasAnim=!!it.dir; const src=hasAnim?it.dir+'/0.png':it.st;
      const c=document.createElement('div'); c.className='card';
      c.innerHTML='<div class="stage"><span class="slot">'+(SLOT_KO[it.slot]||'')+'</span>'+
        '<img class="shot" src="'+src+'" '+(hasAnim?'data-dir="'+it.dir+'" data-n="'+it.n+'"':'')+' data-static="'+it.st+'">'+
        (hasAnim?'<div class="tg"><button class="bA on">애</button><button class="bS">정</button></div>':'')+'</div>'+
        '<div class="meta"><div class="nm">'+it.name+'</div><div class="lore">'+it.lore+'</div>'+
        '<div class="rej">'+
          '<div class="ttl"><span class="tag nm">이름</span></div><textarea data-f="nm" placeholder="이름 리젝사유 (없으면 비움)">'+rv.nm+'</textarea>'+
          '<div class="ttl"><span class="tag st">스토리</span></div><textarea data-f="st" placeholder="스토리 리젝사유">'+rv.st+'</textarea>'+
          '<div class="ttl"><span class="tag an">애니</span></div><textarea data-f="an" placeholder="애니 리젝사유">'+rv.an+'</textarea>'+
        '</div></div>';
      row.appendChild(c);
      const img=c.querySelector('.shot');
      if(hasAnim){img._anim=true;const bA=c.querySelector('.bA'),bS=c.querySelector('.bS');
        bA.onclick=()=>{img._anim=true;bA.classList.add('on');bS.classList.remove('on');};
        bS.onclick=()=>{img._anim=false;img.src=img.dataset.static;bS.classList.add('on');bA.classList.remove('on');};
        anims.push({img,dir:it.dir,n:it.n,i:0});}
      const flag=()=>c.classList.toggle('flag',!!(rv.nm||rv.st||rv.an));
      c.querySelectorAll('textarea').forEach(t=>t.addEventListener('input',()=>{rv[t.dataset.f]=t.value;save();flag();upd();}));
      flag();
    });
    sd.appendChild(row); app.appendChild(sd);
  });
});
let last=0; function tick(t){if(t-last>=110){last=t;for(const o of anims){if(o.img._anim){o.i=(o.i+1)%o.n;o.img.src=o.dir+'/'+o.i+'.png';}}}requestAnimationFrame(tick);} requestAnimationFrame(tick);
function count(){let n=0;for(const k in RV){const r=RV[k];if(r.nm||r.st||r.an)n++;}return n;}
function upd(){document.getElementById('ct').textContent='총 108종 · 리젝 표시 '+count()+'개';}
upd();
document.getElementById('copy').onclick=()=>{
  const L=['[최종 108종 리젝 제출]'];
  DATA.forEach((reg,ri)=>{let rh=false;
    reg.sets.forEach((items,si)=>{let sh=false;
      items.forEach((it,ii)=>{const r=RV[ri+'#'+si+'#'+ii]||{};const parts=[];
        if(r.nm)parts.push('이름: '+r.nm);if(r.st)parts.push('스토리: '+r.st);if(r.an)parts.push('애니: '+r.an);
        if(parts.length){if(!rh){L.push('');L.push('== '+reg.region+' ==');rh=true;}if(!sh){L.push('['+'세트'+(si+1)+']');sh=true;}
          L.push('· '+it.name);parts.forEach(p=>L.push('   - '+p));}
      });});});
  const txt=L.length>1?L.join('\\n'):'(리젝 없음)';
  const o=document.getElementById('out');o.classList.add('show');o.value=txt;o.select();
  if(navigator.clipboard)navigator.clipboard.writeText(txt);
};
document.getElementById('cdcopy').onclick=()=>{
  const L=['[변경 결정 — 왕국·늪지대]'];
  CHANGES.forEach((c,i)=>{const d=CD['c'+i]||{};const p=d.pick==='rollback'?'↩ 롤백':d.pick==='accept'?'✓ 채택':d.pick==='rereject'?'✗ 추가리젝':'(미정)';
    L.push('· '+c.region+' 세트'+c.set+' '+c.name+' ['+c.field+']: '+p+(d.pick==='rereject'&&d.rej?(' — '+d.rej):''));});
  const t=L.join('\\n');const o=document.getElementById('out');o.classList.add('show');o.value=t;o.select();if(navigator.clipboard)navigator.clipboard.writeText(t);
};
document.getElementById('clr').onclick=()=>{if(confirm('입력을 모두 지울까요?')){localStorage.removeItem(LS);localStorage.removeItem('finalqa-decide-v1');location.reload();}};
</script></body></html>`;
writeFileSync('sprites-test-finalqa.html', page);
console.log('built sprites-test-finalqa.html · items=' + DATA.reduce((t, r) => t + r.sets.flat().length, 0) + (missing.length ? ' · MISSING ' + missing.length : ' · all matched'));
