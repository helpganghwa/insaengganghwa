// 최종 108종 갤러리 — 지역/세트별 묶음, 정적+애니+스토리 한눈에. 반응형(모바일/PC), 인뷰 애니.
// 출력: sprites-test-gallery.html (루트) → public 동기화는 sed로.
import { readFileSync, writeFileSync } from 'fs';
const html = readFileSync('sprites-test-review.html', 'utf8');
function extract(name: string) {
  const m = html.match(new RegExp(`const ${name} = (\\[[\\s\\S]*?\\n\\])\\s*;`));
  if (!m) throw new Error('no ' + name);
  return eval(m[1]);
}
const ALL = [...extract('SETS'), ...extract('SETS2')];
const map: Record<string, any> = {};
const mapName: Record<string, any> = {};
for (const s of ALL) for (const it of s.items) {
  const rec = { name: it.name, lore: it.lore || '', dir: it.objAnim ? it.objAnim.dir : null, n: it.objAnim ? it.objAnim.n : 15, st: it.staticSrc, slot: it.slot };
  map[`${s.region}|${it.name}`] = rec; mapName[it.name] = rec;
}
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
const SLOT = { weapon: '무기', armor: '방어구', accessory: '장신구' };
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
const total = DATA.reduce((t, r) => t + r.sets.flat().length, 0);

const page = `<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>인생강화 — 최종 장비 108종</title>
<style>
  :root{color-scheme:dark}
  *{box-sizing:border-box}
  body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo",sans-serif;background:#0a0b10;color:#e9e9ee;-webkit-text-size-adjust:100%}
  .wrap{max-width:1280px;margin:0 auto;padding:14px 14px 80px}
  header h1{font-size:20px;font-weight:900;margin:4px 0 2px;letter-spacing:-.3px}
  header .sub{font-size:12px;color:#9a9aa6;margin:0 0 8px}
  .nav{position:sticky;top:0;z-index:20;background:rgba(10,11,16,.92);backdrop-filter:blur(8px);display:flex;gap:6px;flex-wrap:wrap;align-items:center;padding:8px 0;border-bottom:1px solid #1b1c24;margin-bottom:6px}
  .nav a{font-size:12px;font-weight:800;text-decoration:none;color:#cdd0db;border:1px solid #2a2b36;border-radius:999px;padding:5px 11px;white-space:nowrap}
  .nav a:active{background:#1a1b24}
  .nav .tg{margin-left:auto;font-size:12px;font-weight:800;color:#c9a24a;border:1px solid #3a3320;background:#16140c;border-radius:999px;padding:5px 11px;cursor:pointer;user-select:none}
  h2.reg{font-size:17px;font-weight:900;color:#e7c25a;margin:22px 0 8px;padding-bottom:6px;border-bottom:1px solid #24252e;scroll-margin-top:54px}
  h2.reg .rc{font-size:11px;color:#7a7b86;font-weight:700;margin-left:6px}
  .set{margin:0 0 14px}
  .set .sh{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:800;color:#a9b0c4;margin:0 0 7px}
  .set .sh::before{content:"";flex:0 0 14px;height:2px;background:#3a3d4d;border-radius:2px}
  .set .sh::after{content:"";flex:1;height:1px;background:#1c1d26}
  .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
  @media(max-width:820px){.grid{grid-template-columns:repeat(3,1fr);gap:7px}}
  @media(max-width:560px){.grid{grid-template-columns:1fr}}
  .card{background:linear-gradient(180deg,#13141c,#0f1016);border:1px solid #23242e;border-radius:14px;overflow:hidden;display:flex;flex-direction:column}
  .stage{position:relative;aspect-ratio:1/1;display:flex;align-items:center;justify-content:center;
    background-image:linear-gradient(45deg,#191a22 25%,transparent 25%),linear-gradient(-45deg,#191a22 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#191a22 75%),linear-gradient(-45deg,transparent 75%,#191a22 75%);
    background-size:16px 16px;background-position:0 0,0 8px,8px -8px,-8px 0}
  .stage img{width:86%;height:86%;object-fit:contain;image-rendering:pixelated}
  .slot{position:absolute;top:7px;left:7px;font-size:10px;font-weight:800;border-radius:6px;padding:2px 7px;background:rgba(8,9,13,.78);color:#cdd0db;border:1px solid #2c2d38}
  .slot.weapon{color:#e6a3a3}.slot.armor{color:#a3c0e6}.slot.accessory{color:#c8a8e8}
  .meta{padding:9px 11px 12px;display:flex;flex-direction:column;gap:6px}
  .nm{font-size:14px;font-weight:800;color:#fff;line-height:1.25}
  .lore{font-size:12px;line-height:1.65;color:#c2c4cf;white-space:pre-line}
  @media(min-width:561px){.card{flex-direction:row;align-items:stretch}.stage{flex:0 0 132px;aspect-ratio:auto;width:132px}.stage img{width:90%;height:90%}.meta{flex:1;justify-content:center}}
  @media(max-width:560px){.card{flex-direction:row}.stage{flex:0 0 122px;width:122px;aspect-ratio:auto}.meta{flex:1;justify-content:center;padding:9px 11px}}
  footer{margin-top:22px;text-align:center;font-size:11px;color:#55576a}
</style></head><body>
<div class="wrap">
<header>
  <h1>인생강화 · 최종 장비 ${total}종</h1>
  <p class="sub">6개 지역 × 6세트 × 무기·방어구·장신구. 정적 이미지·애니메이션·스토리를 한눈에.</p>
</header>
<nav class="nav" id="nav"></nav>
<div id="app"></div>
<footer>insaengganghwa · final equipment showcase</footer>
</div>
<script>
const DATA=${JSON.stringify(DATA)};
const SLOT=${JSON.stringify(SLOT)};
const nav=document.getElementById('nav'); const app=document.getElementById('app');
const sprites=[];
DATA.forEach((reg,ri)=>{
  const id='r'+ri;
  const a=document.createElement('a'); a.href='#'+id; a.textContent=reg.region; nav.appendChild(a);
  const h=document.createElement('h2'); h.className='reg'; h.id=id;
  h.innerHTML=reg.region+'<span class="rc">'+reg.sets.flat().length+'종</span>'; app.appendChild(h);
  reg.sets.forEach((items,si)=>{
    const sd=document.createElement('div'); sd.className='set';
    const sh=document.createElement('div'); sh.className='sh'; sh.textContent='세트 '+(si+1); sd.appendChild(sh);
    const g=document.createElement('div'); g.className='grid';
    items.forEach(it=>{
      const hasAnim=!!it.dir; const src=hasAnim?it.dir+'/0.png':it.st;
      const c=document.createElement('div'); c.className='card';
      c.innerHTML='<div class="stage"><span class="slot '+it.slot+'">'+(SLOT[it.slot]||'')+'</span>'+
        '<img alt="'+it.name+'" src="'+src+'" '+(hasAnim?'data-dir="'+it.dir+'" data-n="'+it.n+'" data-static="'+it.st+'"':'')+'></div>'+
        '<div class="meta"><div class="nm">'+it.name+'</div><div class="lore">'+it.lore+'</div></div>';
      g.appendChild(c);
      const img=c.querySelector('img');
      if(hasAnim){img._dir=it.dir;img._n=it.n;img._i=0;img._play=false;sprites.push(img);}
    });
    sd.appendChild(g); app.appendChild(sd);
  });
});
// 인뷰 애니만 재생(모바일 성능)
let anim=true;
const io=new IntersectionObserver((es)=>{es.forEach(e=>{e.target._play=anim&&e.isIntersecting;});},{rootMargin:'120px'});
sprites.forEach(s=>io.observe(s));
let last=0;
function tick(t){if(t-last>=120){last=t;for(const s of sprites){if(s._play){s._i=(s._i+1)%s._n;s.src=s._dir+'/'+s._i+'.png';}}}requestAnimationFrame(tick);}
requestAnimationFrame(tick);
// 정적/애니 토글
const tg=document.createElement('span'); tg.className='tg'; tg.textContent='⏸ 정적 보기';
nav.appendChild(tg);
tg.onclick=()=>{anim=!anim;tg.textContent=anim?'⏸ 정적 보기':'▶ 애니 재생';
  sprites.forEach(s=>{if(!anim){s.src=s.dataset.static;s._play=false;}else{s._play=true;}});};
</script>
</body></html>`;
writeFileSync('sprites-test-gallery.html', page);
console.log('gallery built · items=' + total + (missing.length ? ' · MISSING ' + missing.length : ' · all matched'));
