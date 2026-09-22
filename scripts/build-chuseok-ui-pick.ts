/**
 * 한가위 UI 그림 선택 폼 — 송편 아이콘·배너 배경 후보를 나란히 놓고 하나씩 고른다(아이템 선택 폼과 같은 흐름).
 * 사용: bun run scripts/build-chuseok-ui-pick.ts <출력 html>   후보: public/sprites/chuseok-ui/*.png
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const out = process.argv[2];
if (!out) throw new Error('출력 경로가 필요합니다');
const DIR = 'public/sprites/chuseok-ui';
const uri = async (k: string, w: number) => { const f = `${DIR}/${k}.png`; if (!existsSync(f)) return null; return `data:image/png;base64,${(await sharp(f).resize({ width: w, kernel: 'nearest' }).png().toBuffer()).toString('base64')}`; };

type Opt = { key: string; name: string; note: string; fresh?: boolean };
const ICONS: Opt[] = [
  { key: 'sp_obj_l', name: '흰 송편과 분홍 송편', note: '고르신 아이콘(확정)' },
];
const BANNERS: Opt[] = [
  { key: 'banner_c', name: '한옥 마당과 감나무', note: '지금까지 고르신 배경' },
  { key: 'banner_u', name: '창호에 비친 달토끼', note: '한옥 마당·감나무·구름 위 보름달. 오른쪽 창호지에 절구 찧는 토끼 그림자. 송편 없음', fresh: true },
  { key: 'banner_u2', name: '창호에 비친 달토끼 + 송편', note: '위 장면의 툇마루 난간에 송편 접시(흰·분홍)를 얹은 판', fresh: true },
  { key: 'banner_v2', name: '툇마루의 토끼와 송편', note: '옥색 조끼 입은 흰 토끼가 난간에서 달을 봄, 감 달린 가지와 등롱, 문 앞에 송편 접시', fresh: true },
  { key: 'banner_w2', name: '절구 찧는 토끼와 송편', note: '보름달 앞에서 절구 찧는 흰 토끼, 쌀 그릇, 양쪽 감나무 가지, 마루 오른쪽에 송편 접시', fresh: true },
  { key: 'banner_x2', name: '언덕 위 토끼 둘과 송편', note: '언덕에 앉아 달을 보는 흰 토끼 둘, 감나무와 한옥 지붕, 가운데 상 위에 송편 접시(작게)', fresh: true },
  { key: 'banner_y', name: '마당의 송편상과 달 위 토끼', note: '그림 자체에 송편을 그리게 한 판. 송편이 둥근 떡처럼 나왔고 토끼는 달 위에 앉음(합성 없음)', fresh: true },
];
const PRESET: Record<string, string> = { icon: 'sp_obj_l', banner: 'banner_c' };
const card = (slot: string, o: Opt, src: string | null, wide: boolean) => `<label class="card${wide ? ' wide' : ''}${o.fresh ? ' fresh' : ''}"><input type="radio" name="${slot}" value="${o.key}" id="${slot}_${o.key}">
  <span class="img">${src ? `<img src="${src}" alt="">` : '<em>생성 전</em>'}</span><span class="nm">${o.name}${o.fresh ? '<i>새 그림</i>' : ''}</span><span class="nt">${o.note}</span></label>`;
const slotHtml = async (slot: string, title: string, opts: Opt[], wide: boolean, w: number) => `<section class="slot" data-slot="${slot}" data-title="${title}"><h2>${title}<span class="st" data-st="${slot}">아직 안 골랐습니다</span></h2>
  <div class="grid${wide ? ' wide' : ''}">${(await Promise.all(opts.map(async (o) => card(slot, o, await uri(o.key, w), wide)))).join('')}</div>
  <label class="redo"><input type="checkbox" class="rd" data-slot="${slot}"> 마음에 드는 것이 없습니다. 다시 생성</label><input type="text" class="why" data-slot="${slot}" placeholder="아쉬운 점, 원하는 방향"></section>`;

const html = `<title>한가위 UI 그림 선택</title>
<style>
  :root { --bg:#f3efe6; --panel:#fffdf7; --ink:#1d1a15; --muted:#6a6155; --line:#e2dacb; --accent:#a3341f; --rec:#0f7a4f; color-scheme: light; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg:#11100e; --panel:#1a1815; --ink:#f1ece2; --muted:#a2998b; --line:#2d2924; --accent:#e8806a; --rec:#5fd0a0; color-scheme: dark; } }
  :root[data-theme="dark"] { --bg:#11100e; --panel:#1a1815; --ink:#f1ece2; --muted:#a2998b; --line:#2d2924; --accent:#e8806a; --rec:#5fd0a0; color-scheme: dark; }
  * { box-sizing:border-box; } body { margin:0; background:var(--bg); color:var(--ink); font:14px/1.6 "Pretendard","Apple SD Gothic Neo",system-ui,sans-serif; }
  .wrap { max-width:1100px; margin:0 auto; padding-block:28px 96px; padding-inline:16px; } h1 { font-size:23px; margin:0 0 6px; } .lead { margin:0 0 18px; color:var(--muted); max-width:72ch; }
  .slot { background:var(--panel); border:1px solid var(--line); border-radius:14px; padding:16px; margin-bottom:18px; } h2 { font-size:16px; margin:0 0 10px; display:flex; align-items:baseline; gap:10px; } .st { margin-left:auto; font-size:12px; font-weight:500; color:var(--muted); }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:10px; } .grid.wide { grid-template-columns:repeat(auto-fill,minmax(300px,1fr)); }
  .card { display:flex; flex-direction:column; gap:4px; border:2px solid var(--line); border-radius:12px; padding:8px; cursor:pointer; background:var(--bg); } .card:has(input:checked) { border-color:var(--accent); } .card input { position:absolute; opacity:0; pointer-events:none; }
  .img { display:grid; place-items:center; background:#09090b; border-radius:8px; aspect-ratio:1; overflow:hidden; } .card.wide .img { aspect-ratio:3; } .img img { width:100%; height:100%; object-fit:contain; image-rendering:pixelated; } .card.wide .img img { object-fit:cover; } .img em { color:#71717a; font-size:12px; font-style:normal; }
  .nm { font-weight:700; font-size:13px; } .nm i { font-style:normal; font-size:10.5px; color:var(--rec); margin-left:6px; } .nt { font-size:12px; color:var(--muted); }
  .redo { display:block; margin-top:12px; font-size:13px; } .why { width:100%; margin-top:6px; border:1px solid var(--line); border-radius:8px; padding:8px 10px; font:inherit; font-size:13px; background:var(--bg); color:var(--ink); }
  .foot { position:fixed; left:0; right:0; bottom:0; background:var(--panel); border-top:1px solid var(--line); padding:10px 16px; display:flex; gap:12px; align-items:center; } .foot b { font-size:13px; } .foot span { color:var(--muted); font-size:12.5px; flex:1; }
  button { font:inherit; font-weight:800; font-size:13.5px; border-radius:10px; padding:9px 16px; border:1px solid var(--accent); background:var(--accent); color:#fff; cursor:pointer; } #toast { font-size:12.5px; color:var(--rec); }
  textarea { width:100%; min-height:90px; font:12.5px/1.5 ui-monospace,Menlo,monospace; border:1px solid var(--line); border-radius:8px; padding:8px; background:var(--bg); color:var(--ink); }
</style>
<div class="wrap">
  <h1>한가위 UI 그림 선택</h1>
  <p class="lead">6차입니다. 송편 아이콘은 흰 송편과 분홍 송편으로 확정되어 미리 골라 두었습니다. 배너는 한옥 마당과 감나무의 분위기를 살린 채 달토끼와 송편을 넣은 장면 여섯 장을 새로 만들었고, 지금까지 고르신 한옥 마당도 그대로 두었습니다. 송편은 그림이 계속 틀리게 그려서, 장면은 빈 상만 두고 따로 만든 송편 접시를 얹어 합성한 판이 대부분입니다. 배너는 홈 화면 폭에 맞춰 잘려 들어갑니다. 마음에 드는 것이 없으면 확인란을 누르고 방향을 적어 주시면 그 방향으로 다시 만듭니다. 맨 아래 요약을 복사해 채팅에 붙여 주세요.</p>
  ${await slotHtml('icon', '송편 아이콘', ICONS, false, 192)}
  ${await slotHtml('banner', '홈 배너 배경', BANNERS, true, 768)}
  <section class="slot"><h2>요약</h2><textarea id="out" readonly></textarea></section>
</div>
<div class="foot"><b id="cnt">선택 0 · 미정 2</b><span>두 곳을 모두 정하거나 다시 생성으로 표시해 주세요.</span><button type="button" id="copy">요약 복사</button><span id="toast" role="status"></span></div>
<script>
(function(){
  var KEY='chuseok-ui-pick-v6', NAMES={};
  document.querySelectorAll('.card').forEach(function(c){var i=c.querySelector('input');NAMES[i.value]=c.querySelector('.nm').childNodes[0].textContent;});
  function q(s){return Array.prototype.slice.call(document.querySelectorAll(s));}
  function build(){
    var lines=['[한가위 UI 그림 선택 결과]'],sel=0,undecided=0;
    q('section.slot[data-slot]').forEach(function(sec){
      var slot=sec.getAttribute('data-slot'),title=sec.getAttribute('data-title');
      var c=sec.querySelector('input[type=radio]:checked'),rd=sec.querySelector('.rd').checked,why=sec.querySelector('.why').value.trim(),st=sec.querySelector('.st');
      if(rd){lines.push(title+': 다시 생성 / 사유: '+(why||'(적지 않음)'));st.textContent='다시 생성';undecided++;}
      else if(c){lines.push(title+': '+NAMES[c.value]+' ('+c.value+')'+(why?' / 메모: '+why:''));st.textContent=NAMES[c.value]+' 선택';sel++;}
      else{lines.push(title+': (미정)');st.textContent='아직 안 골랐습니다';undecided++;}
    });
    document.getElementById('out').value=lines.join('\\n');
    document.getElementById('cnt').textContent='선택 '+sel+' · 미정 '+(2-sel);
  }
  function save(){try{var st={c:[],t:{}};q('input:checked').forEach(function(i){st.c.push(i.id||i.getAttribute('data-slot')+'_rd');});q('.why').forEach(function(i){if(i.value)st.t[i.getAttribute('data-slot')]=i.value;});localStorage.setItem(KEY,JSON.stringify(st));}catch(e){}}
  function load(){try{var st=JSON.parse(localStorage.getItem(KEY)||'null');if(!st)return;(st.c||[]).forEach(function(id){var el=document.getElementById(id);if(el)el.checked=true;else{var m=id.match(/^(\\w+)_rd$/);if(m){var r=document.querySelector('.rd[data-slot="'+m[1]+'"]');if(r)r.checked=true;}}});Object.keys(st.t||{}).forEach(function(k){var el=document.querySelector('.why[data-slot="'+k+'"]');if(el)el.value=st.t[k];});}catch(e){}}
  document.addEventListener('change',function(){build();save();});
  document.addEventListener('input',function(e){if(e.target&&e.target.classList&&e.target.classList.contains('why')){build();save();}});
  document.getElementById('copy').addEventListener('click',function(){var t=document.getElementById('out');function done(){document.getElementById('toast').textContent='복사했습니다.';}if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(t.value).then(done,function(){t.select();try{document.execCommand('copy');done();}catch(e){}});}else{t.select();try{document.execCommand('copy');done();}catch(e){}}});
  load();
  var PRESET=__PRESET__;Object.keys(PRESET).forEach(function(slot){var sec=document.querySelector('section.slot[data-slot="'+slot+'"]');if(sec&&!sec.querySelector('input[type=radio]:checked')){var el=document.getElementById(slot+'_'+PRESET[slot]);if(el)el.checked=true;}});
  build();
})();
</script>
`.replace('__PRESET__', JSON.stringify(PRESET));
writeFileSync(out, html);
console.log(`wrote ${out} (${(html.length / 1024).toFixed(0)} KB)`);
