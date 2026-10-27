/**
 * 할로윈 6종 리뷰 아티팩트 — 이름·로어·해방 애니메이션을 한 화면에서 보고 고친다(2026-10-27, 한가위 리뷰와 같은 틀).
 *   실행: bun run scripts/build-halloween-items-review.ts <out.html>
 * 입력: scripts/gen-halloween-cand.ts(확정 후보 이름·그림), scripts/halloween-lore-candidates.json(로어 3안),
 *       scripts/anim3-prompts.json(애니 프롬프트), public/sprites/anim3/<후보id>.webp + anim3.json(애니)
 * 이름·로어는 그 자리에서 고쳐 쓰고, 애니는 다시 만들지·어떤 방향으로 만들지 적는다. 요약 복사 → 채팅.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import sharp from 'sharp';

import { CANDIDATES } from './gen-halloween-cand';

const OUT = process.argv[2];
if (!OUT) throw new Error('출력 경로가 필요합니다');
const ROOT = process.cwd();
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** 확정 6종(2026-10-27) — 대회 순서(무기·방어구·장신구 × 대장장이·꼬마 뱀파이어)와 같다. */
const FINAL: { cid: string; set: string }[] = [
  { cid: 'hw2_smith_hammer', set: '대장장이' },
  { cid: 'hw5_smith_apron', set: '대장장이' },
  { cid: 'hw9_smith_kerchief', set: '대장장이' },
  { cid: 'hw9_vamp_parasol', set: '꼬마 뱀파이어' },
  { cid: 'hw5_vamp_cape', set: '꼬마 뱀파이어' },
  { cid: 'hw7_vamp_tophat', set: '꼬마 뱀파이어' },
];
const SLOT_KO: Record<string, string> = { weapon: '무기', armor: '방어구', accessory: '장신구' };

const prompts = JSON.parse(readFileSync(join(ROOT, 'scripts/anim3-prompts.json'), 'utf8')) as { items: Record<string, string>; itemsKo?: Record<string, string> };
/** 로어 후보(느낌별 3안, 2026-09-22 리뷰 2차) — A가 처음 값. 라디오로 고르면 칸에 들어가고, 칸에서 더 고칠 수 있다. */
const LORES = JSON.parse(readFileSync(join(ROOT, 'scripts/halloween-lore-candidates.json'), 'utf8')) as Record<string, { feel: string; text: string }[]>;
const manifestP = join(ROOT, 'public/sprites/anim3.json');
const manifest = existsSync(manifestP) ? (JSON.parse(readFileSync(manifestP, 'utf8')) as { cell: number; items: Record<string, { frames: number }> }) : { cell: 256, items: {} };

async function dataUrl(p: string, mime: string): Promise<string | null> {
  if (!existsSync(p)) return null;
  return `data:${mime};base64,${readFileSync(p).toString('base64')}`;
}
async function spriteUrl(code: string): Promise<string | null> {
  const p = join(ROOT, 'public/sprites/halloween-cand', `${code}.png`);
  if (!existsSync(p)) return null;
  const buf = await sharp(p).resize(192, 192, { kernel: 'nearest', fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  return `data:image/png;base64,${buf.toString('base64')}`;
}

const cards: string[] = [];
for (const f of FINAL) {
  const cid = f.cid;
  const c = CANDIDATES.find((x) => x.key === cid)!;
  const it = { key: cid, slot: c.slot, nameKo: c.nameKo, lore: LORES[cid]?.[0]?.text ?? '' };
  const frames = manifest.items[cid]?.frames ?? 0;
  const anim = frames ? await dataUrl(join(ROOT, 'public/sprites/anim3', `${cid}.webp`), 'image/webp') : null;
  // 보정안(있을 때만) — public/sprites/anim3-alt/<cid>.webp. 재생성 원본과 나란히 놓고 고른다(2026-09-23).
  const alt = frames ? await dataUrl(join(ROOT, 'public/sprites/anim3-alt', `${cid}.webp`), 'image/webp') : null;
  const sprite = await spriteUrl(it.key);
  const cell = manifest.cell;
  cards.push(`
<section class="card" data-key="${it.key}" data-name="${esc(it.nameKo)}">
  <header><span class="slot">${SLOT_KO[it.slot]} · ${f.set}</span><code>${it.key}</code></header>
  <div class="media">
    <figure><div class="img">${sprite ? `<img src="${sprite}" alt="">` : '<span class="ph">그림 없음</span>'}</div><figcaption>그림(확정)</figcaption></figure>
    <figure><div class="img">${anim ? `<div class="anim" data-frames="${frames}" data-cell="${cell}" style="background-image:url('${anim}')"></div>` : '<span class="ph">애니 생성 중</span>'}</div><figcaption>${alt ? '재생성 원본(보정 없음)' : '해방 애니메이션'}${frames ? ` · ${frames}프레임` : ''}</figcaption></figure>
    ${alt ? `<figure><div class="img"><div class="anim" data-frames="${frames}" data-cell="${cell}" style="background-image:url('${alt}')"></div></div><figcaption>보정안</figcaption></figure>` : ''}
  </div>
  ${alt ? `<div class="rej"><span class="rl">애니 선택</span><label class="chk"><input type="radio" name="anim_pick" value="원본" checked> 재생성 원본</label><label class="chk"><input type="radio" name="anim_pick" value="보정안"> 보정안</label></div>` : ''}
  <label class="f"><span>이름</span><input type="text" name="name" value="${esc(it.nameKo)}" maxlength="20"></label>
  <div class="f"><span>로어 후보 <small>느낌이 다른 3안 · 고르면 아래 칸에 들어가고 칸에서 더 고칠 수 있어요</small></span>
    <div class="cands">${(LORES[it.key] ?? []).map((c, i) => `<label class="cand"><input type="radio" name="lore_pick" value="${'ABC'[i]}" data-text="${esc(c.text)}"${i === 0 ? ' checked' : ''}><b>${'ABC'[i]}</b><em>${esc(c.feel)}</em><span>${esc(c.text)}</span></label>`).join('')}</div>
  </div>
  <label class="f"><span>로어(적용될 문장) <small>${it.lore.length}자</small></span><textarea name="lore" rows="4">${esc(it.lore)}</textarea></label>
  <details><summary>애니 프롬프트</summary><p class="pr">${esc(prompts.itemsKo?.[cid] ?? '')}</p><p class="pr en">${esc(prompts.items[cid] ?? '')}</p></details>
  <div class="rej">
    <span class="rl">리젝</span>
    <label class="chk"><input type="checkbox" name="rej_name"> 이름</label>
    <label class="chk"><input type="checkbox" name="rej_lore"> 로어</label>
    <label class="chk"><input type="checkbox" name="rej_anim"> 애니메이션</label>
  </div>
  <input type="text" name="why" placeholder="리젝 사유·원하는 방향(예: 이름이 길다, 로어를 더 밝게, 불꽃만 더 크게)">
</section>`);
}

const html = `<title>할로윈 6종 리뷰</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&display=swap">
<style>
:root{--bg:#f4efe9;--paper:#fffcf8;--ink:#1f1a17;--ink2:#5f5650;--line:#e6dbd0;--line2:#d0c2b3;--navy:#4b2a6b;--gold:#c2611b;--dark:#16121a}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#16121a;--paper:#211b26;--ink:#f1ece6;--ink2:#b5aaa1;--line:#3a3042;--line2:#54465e;--navy:#c9a4ff;--gold:#f39a2e}}
:root[data-theme="dark"]{--bg:#16121a;--paper:#211b26;--ink:#f1ece6;--ink2:#b5aaa1;--line:#3a3042;--line2:#54465e;--navy:#c9a4ff;--gold:#f39a2e}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font-family:"Noto Sans KR",system-ui,sans-serif;font-size:14px;line-height:1.6;word-break:keep-all;overflow-wrap:anywhere}
.wrap{max-width:760px;margin:0 auto;padding-inline:16px;padding-block:20px 120px}
h1{font-size:22px;margin:0 0 4px;color:var(--navy)}
.lead{color:var(--ink2);font-size:13px;margin:0 0 14px}
.card{background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:12px 14px;margin:12px 0}
.card header{display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-bottom:8px}
.card header .slot{font-size:12px;font-weight:700;color:var(--gold)}
.card header code{font-size:11px;color:var(--ink2)}
.media{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
figure{margin:0}
.img{background:var(--dark);border-radius:12px;aspect-ratio:1;display:grid;place-items:center;overflow:hidden}
.img img{width:100%;height:100%;object-fit:contain;image-rendering:pixelated}
.anim{width:192px;height:192px;background-repeat:no-repeat;background-size:auto 100%;image-rendering:pixelated}
.ph{color:#a1a1aa;font-size:12px}
figcaption{font-size:11px;color:var(--ink2);text-align:center;margin-top:4px}
.f{display:block;margin-top:10px}
.f span{display:block;font-size:12px;font-weight:700;margin-bottom:3px}
.f small{font-weight:400;color:var(--ink2);margin-left:6px}
input[type=text],textarea{width:100%;border:1px solid var(--line2);border-radius:8px;padding:8px 10px;font:inherit;font-size:13px;background:var(--paper);color:var(--ink)}
textarea{resize:vertical;line-height:1.55}
.cands{display:flex;flex-direction:column;gap:6px;margin-top:4px}
.cand{display:grid;grid-template-columns:auto auto 1fr;gap:6px 8px;align-items:start;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--paper);font-size:12.5px;line-height:1.5;cursor:pointer}
.cand:has(input:checked){border-color:var(--gold);box-shadow:0 0 0 1px var(--gold) inset}
.cand input{margin-top:3px}.cand b{font-size:12px}.cand em{font-style:normal;color:var(--ink2);font-size:11.5px;white-space:nowrap}.cand span{grid-column:1/-1}
details{margin-top:8px;font-size:12px}
details summary{cursor:pointer;color:var(--ink2)}
.pr{margin:4px 0;font-size:12px}
.pr.en{color:var(--ink2);font-size:11.5px}
.rej{display:flex;align-items:center;gap:12px;margin-top:10px;flex-wrap:wrap}
.rej .rl{font-size:12px;font-weight:700;color:var(--gold)}
.chk{display:inline-flex;align-items:center;gap:5px;font-size:13px}
.card input[name=why]{margin-top:6px}
.card.changed{border-color:var(--gold)}
.foot{position:fixed;left:0;right:0;bottom:0;background:var(--paper);border-top:1px solid var(--line);padding:10px 16px;padding-bottom:calc(10px + env(safe-area-inset-bottom,0px));display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap}
.foot .st{font-size:13px;color:var(--ink2)}
.foot .st b{color:var(--ink)}
button.copy{background:var(--navy);color:#fff;border:0;border-radius:9px;padding:9px 16px;font:inherit;font-weight:700;cursor:pointer}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]) button.copy{color:#16121a}}
:root[data-theme="dark"] button.copy{color:#16121a}
button:focus-visible,input:focus-visible,textarea:focus-visible{outline:2px solid var(--gold);outline-offset:2px}
pre.sum{white-space:pre-wrap;background:var(--paper);border:1px solid var(--line);border-radius:10px;padding:10px 12px;font-size:12px;margin:8px 0}
@media (prefers-reduced-motion: reduce){.anim{animation:none}}
</style>
<div class="wrap">
<h1>할로윈 6종 리뷰</h1>
<p class="lead">카드마다 이름·로어·해방 애니메이션을 봅니다. 마음에 안 드는 것은 <b>리젝</b>에서 이름·로어·애니메이션을 골라 사유를 적어 주세요(고른 카드는 테두리가 금색). 로어는 카드마다 느낌이 다른 3안(A·B·C) 중 하나를 고르고, 칸에서 더 고쳐도 됩니다(처음엔 A가 들어가 있어요). 애니메이션은 확정 그림의 Pixellab 객체로 만든 해방 애니(본체 고정·빛과 장식만 움직임)입니다. 맨 아래 요약을 복사해 채팅에 붙이면 그대로 반영합니다.</p>
<form id="f">${cards.join('\n')}</form>
<h2 style="font-size:16px;margin:24px 0 6px">요약</h2>
<pre class="sum" id="sum"></pre>
</div>
<div class="foot"><div class="st">리젝·수정 카드 <b id="cnt">0</b> / 6 · 리젝 <b id="redo">0</b></div><button class="copy" id="copy" type="button">요약 복사</button></div>
<script>
(function(){
  var KEY='halloween-items-review-v2';
  var cards=Array.prototype.slice.call(document.querySelectorAll('.card'));
  function startAnims(){cards.forEach(function(c){var a=c.querySelector('.anim');if(!a)return;var n=parseInt(a.getAttribute('data-frames'),10)||1;var i=0;setInterval(function(){i=(i+1)%n;a.style.backgroundPosition=(i*100/(n-1||1))+'% 0';},110);a.style.backgroundSize=(n*100)+'% 100%';});}
  function pickOf(c){var r=c.querySelector('[name=lore_pick]:checked');return r?r.value:'A'}
  function pickText(c){var r=c.querySelector('[name=lore_pick]:checked');return r?r.getAttribute('data-text'):''}
  function animPick(c){var r=c.querySelector('[name=anim_pick]:checked');return r?r.value:null}
  function state(c){return {key:c.getAttribute('data-key'),name0:c.getAttribute('data-name'),anim:animPick(c),pick:pickOf(c),pickText:pickText(c),name:c.querySelector('[name=name]').value.trim(),lore0:c.querySelector('[name=lore]').defaultValue.trim(),lore:c.querySelector('[name=lore]').value.trim(),rn:c.querySelector('[name=rej_name]').checked,rl:c.querySelector('[name=rej_lore]').checked,ra:c.querySelector('[name=rej_anim]').checked,why:c.querySelector('[name=why]').value.trim()}}
  function build(){var lines=['[할로윈 6종 리뷰]'];var changed=0,rej=0;cards.forEach(function(c){var s=state(c);var parts=[];var rj=[];if(s.rn)rj.push('이름');if(s.rl)rj.push('로어');if(s.ra)rj.push('애니메이션');if(rj.length){rej++;parts.push('리젝: '+rj.join('·')+(s.why?' / 사유: '+s.why:' / 사유: (적지 않음)'));}else if(s.why)parts.push('메모: '+s.why);if(s.name!==s.name0)parts.push('이름 수정: '+s.name0+' → '+s.name);if(s.anim)parts.push('애니: '+s.anim);if(s.pick!=='A')parts.push('로어 '+s.pick+'안 선택');if(s.lore!==s.pickText)parts.push('로어 수정: '+s.lore);var ch=parts.length>0;c.classList.toggle('changed',ch);if(ch){changed++;lines.push(s.key+' ('+s.name0+'): '+parts.join(' · '));}});if(changed===0)lines.push('리젝·수정 없음 — 이름·로어·애니 모두 확정');document.getElementById('cnt').textContent=changed;document.getElementById('redo').textContent=rej;document.getElementById('sum').textContent=lines.join('\\n');return lines.join('\\n');}
  function persist(){try{localStorage.setItem(KEY,JSON.stringify(cards.map(function(c){var s=state(c);return {key:s.key,name:s.name,pick:s.pick,lore:s.lore,rn:s.rn,rl:s.rl,ra:s.ra,why:s.why}})))}catch(e){}}
  function restore(){try{var o=JSON.parse(localStorage.getItem(KEY)||'null');if(!o)return;o.forEach(function(v){var c=cards.filter(function(x){return x.getAttribute('data-key')===v.key})[0];if(!c)return;c.querySelector('[name=name]').value=v.name;var rr=c.querySelector('[name=lore_pick][value="'+(v.pick||'A')+'"]');if(rr)rr.checked=true;c.querySelector('[name=lore]').value=v.lore;c.querySelector('[name=rej_name]').checked=!!v.rn;c.querySelector('[name=rej_lore]').checked=!!v.rl;c.querySelector('[name=rej_anim]').checked=!!v.ra;c.querySelector('[name=why]').value=v.why||''})}catch(e){}}
  document.getElementById('f').addEventListener('input',function(){build();persist()});document.getElementById('f').addEventListener('change',function(e){if(e.target&&e.target.name==='lore_pick'){var c=e.target.closest('.card');c.querySelector('[name=lore]').value=e.target.getAttribute('data-text');}build();persist()});
  document.getElementById('copy').addEventListener('click',function(){var t=build();var b=this;function done(ok){b.textContent=ok?'복사됨':'복사 실패';setTimeout(function(){b.textContent='요약 복사'},1800)}if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(t).then(function(){done(true)},function(){done(false)})}else done(false)});
  restore();build();startAnims();
})();
</script>
`;
writeFileSync(OUT, html);
console.log(`wrote ${OUT} (${Math.round(html.length / 1024)} KB)`);
