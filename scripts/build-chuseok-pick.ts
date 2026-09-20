// 추석 세트 선택 폼(2026-09-20) — 지금까지 만든 한복·달토끼 그림을 부위별로 전부 늘어놓고 부위마다 하나를 고른다.
// 마음에 드는 것이 없는 부위는 '다시 생성'을 고르고 사유를 적는다. 결과는 아티팩트 db(picks/current)에 저장되고, 복사용 요약도 함께 나온다.
// 실행: bun run scripts/build-chuseok-pick.ts <출력 경로>. 유료 호출 없음. 게시할 때 capabilities: { db: {} }.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const out = process.argv.slice(2).find((a) => !a.startsWith('--'));
if (!out) {
  console.error('출력 경로 필요');
  process.exit(1);
}
const uri = (k: string) => {
  const p = join(ROOT, 'public', 'sprites', 'chuseok-cand', `${k}.png`);
  return existsSync(p) ? `data:image/png;base64,${readFileSync(p).toString('base64')}` : null;
};

type Opt = { key: string; name: string; note: string };
type Slot = { id: string; set: '한복' | '달토끼'; slot: '무기' | '방어구' | '장신구'; options: Opt[] };
const SLOTS: Slot[] = [
  {
    id: 'hanbok_weapon',
    set: '한복',
    slot: '무기',
    options: [
      { key: 'chuseok_hanbok_sword_v2', name: '의장검(용 새김)', note: '화려 · 용을 새긴 칼날, 봉황 머리 자루' },
      { key: 'chuseok_hanbok_sword', name: '의장검', note: '화려 · 금 상감 칼날, 연꽃 코등이' },
      { key: 'chuseok_hanbok_bow', name: '금박 각궁', note: '화려 · 진홍 옻칠, 금박 무늬' },
      { key: 'chuseok_hanbok_dagger', name: '은장도', note: '단아 · 은 세공 자루, 연보라 술' },
      { key: 'chuseok_hanbok_fan', name: '합죽선', note: '진홍 부채, 금빛 보름달' },
      { key: 'chuseok_hanbok_lantern', name: '청사초롱', note: '홍청 비단 등, 오색 술' },
    ],
  },
  {
    id: 'hanbok_armor',
    set: '한복',
    slot: '방어구',
    options: [
      { key: 'chuseok_hanbok_hwarot_v2', name: '활옷(황금 치마)', note: '화려 · 금실 봉황, 황금 치마' },
      { key: 'chuseok_hanbok_hwarot', name: '활옷', note: '화려 · 금실 봉황, 남색 속치마' },
      { key: 'chuseok_hanbok_dangui', name: '금박 당의', note: '화려 · 옥색 당의, 금박 두 줄 치마' },
      { key: 'chuseok_hanbok_pastel', name: '매화 한복', note: '단아 · 분홍에서 연보라로 번지는 치마' },
      { key: 'chuseok_hanbok_v3', name: '한복(금박 꽃무늬)', note: '미색 저고리, 진홍 치마' },
      { key: 'chuseok_hanbok_v2', name: '한복(옥색 저고리)', note: '색동 소매, 진홍 치마, 달 무늬' },
      { key: 'chuseok_moonrise_hanbok', name: '달맞이 한복', note: '흰 저고리, 남색 치마, 은빛 달무늬' },
      { key: 'chuseok_holiday_apron', name: '명절 앞치마', note: '노란 저고리, 연두 치마, 흰 앞치마' },
      { key: 'chuseok_hanbok', name: '한가위 한복(바지형)', note: '색동 소매, 옥색 바지' },
    ],
  },
  {
    id: 'hanbok_accessory',
    set: '한복',
    slot: '장신구',
    options: [
      { key: 'chuseok_bok_pouch_v4', name: '복주머니(학 자수)', note: '화려 · 학 한 쌍, 진주 테두리' },
      { key: 'chuseok_bok_pouch_v3', name: '금실 복주머니', note: '화려 · 봉황 자수, 구슬 술' },
      { key: 'chuseok_bok_pouch_v5', name: '매화 복주머니', note: '단아 · 은실 매화, 연보라 술' },
      { key: 'chuseok_bok_pouch_v2', name: '복주머니(모란 자수)', note: '진홍 비단, 금빛 모란' },
      { key: 'chuseok_bok_pouch', name: '한가위 복주머니', note: '진홍 비단, 금빛 달토끼' },
      { key: 'chuseok_fullmoon_norigae', name: '보름달 노리개', note: '옥 원판, 진홍 매듭 술' },
    ],
  },
  {
    id: 'rabbit_weapon',
    set: '달토끼',
    slot: '무기',
    options: [
      { key: 'chuseok_rabbit_pestle_v5', name: '떡 묻은 절굿공이', note: '동화풍 · 끝에 흰 떡, 큰 분홍 리본' },
      { key: 'chuseok_rabbit_pestle_v3', name: '절굿공이(붉은 끈)', note: '심플 · 매끈한 나무' },
      { key: 'chuseok_rabbit_pestle_v4', name: '절굿공이(흰 리본)', note: '심플 · 한쪽이 굵은 모양' },
      { key: 'chuseok_rabbit_pestle_v2', name: '절굿공이(토끼 얼굴)', note: '토끼 얼굴 새김, 방울술' },
      { key: 'chuseok_rabbit_pestle', name: '절굿공이(달 장식)', note: '금테, 붉은 끈, 달 장식' },
      { key: 'chuseok_moonrabbit_mallet', name: '달토끼 떡메', note: '둥근 나무 메, 토끼와 달 새김' },
    ],
  },
  {
    id: 'rabbit_armor',
    set: '달토끼',
    slot: '방어구',
    options: [
      { key: 'chuseok_rabbit_romper', name: '토끼 롬퍼', note: '동화풍 · 크림색 롬퍼, 분홍 리본, 솜꼬리' },
      { key: 'chuseok_moonrabbit_suit_v4', name: '달토끼 옷(심플)', note: '심플 · 흰 점프슈트, 분홍 리본' },
      { key: 'chuseok_moonrabbit_suit_v2', name: '달토끼 옷(연보라 띠)', note: '털 깃, 연보라 띠, 달 장식' },
      { key: 'chuseok_moonrabbit_suit', name: '달토끼 옷(1차)', note: '폭신한 흰 털, 가슴에 달' },
      { key: 'chuseok_moonrabbit_suit_v3', name: '달토끼 옷(분홍 리본)', note: '그림이 작게 나옴' },
      { key: 'chuseok_moonrabbit_suit_v5', name: '달토끼 옷(보송한 결)', note: '잘못 나옴 · 머리 윤곽이 그려짐' },
    ],
  },
  {
    id: 'rabbit_accessory',
    set: '달토끼',
    slot: '장신구',
    options: [
      { key: 'chuseok_rabbit_lop_ears', name: '늘어진 토끼 귀', note: '동화풍 · 늘어진 귀, 분홍 리본' },
      { key: 'chuseok_rabbit_ears_v4', name: '토끼 귀(접힌 귀)', note: '심플 · 한쪽 귀가 접힘' },
      { key: 'chuseok_rabbit_ears_v3', name: '토끼 귀(곧은 귀)', note: '심플 · 흰 머리띠' },
      { key: 'chuseok_rabbit_ears_v2', name: '토끼 귀(분홍 리본)', note: '금 머리띠, 리본과 방울' },
      { key: 'chuseok_rabbit_ears', name: '토끼 귀(달 장식)', note: '금 머리띠, 달 장식' },
      { key: 'chuseok_moonrabbit_headband', name: '달토끼 머리띠', note: '금 머리띠, 달 장식과 붉은 리본' },
    ],
  },
];

let missing = 0;
const data = SLOTS.map((s) => ({
  ...s,
  options: s.options.map((o) => {
    const src = uri(o.key);
    if (!src) missing += 1;
    return { ...o, src: src ?? '' };
  }),
}));

// 페이지 스크립트 — 백틱을 쓰지 않는다(이 파일의 템플릿 문자열 안에 그대로 들어간다).
const SCRIPT = String.raw`
(function () {
  var SLOTS = window.__SLOTS__;
  var LS_KEY = 'chuseok-pick-draft-v1';
  var state = {};
  SLOTS.forEach(function (s) { state[s.id] = { pick: null, redo: false, reason: '' }; });
  try {
    var saved = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
    if (saved) SLOTS.forEach(function (s) { if (saved[s.id]) state[s.id] = Object.assign(state[s.id], saved[s.id]); });
  } catch (e) {}
  function persist() { try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {} }

  var root = document.getElementById('slots');
  var els = {};
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }

  SLOTS.forEach(function (s, si) {
    var sec = el('section', 'slot');
    sec.id = 'slot-' + s.id;
    var head = el('div', 'shead');
    head.appendChild(el('span', 'sname', s.set + ' 세트 · ' + s.slot));
    var st = el('span', 'sstate', '');
    head.appendChild(st);
    sec.appendChild(head);
    var grid = el('div', 'grid');
    var tiles = {};
    s.options.forEach(function (o) {
      var b = el('button', 'tile');
      b.type = 'button';
      b.setAttribute('aria-pressed', 'false');
      var im = el('img'); im.src = o.src; im.alt = o.name; im.loading = 'lazy';
      var box = el('span', 'imgbox'); box.appendChild(im); b.appendChild(box);
      b.appendChild(el('span', 'tname', o.name));
      b.appendChild(el('span', 'tnote', o.note));
      b.addEventListener('click', function () {
        var cur = state[s.id];
        if (cur.pick === o.key) { cur.pick = null; } else { cur.pick = o.key; cur.redo = false; }
        persist(); paint();
      });
      tiles[o.key] = b;
      grid.appendChild(b);
    });
    sec.appendChild(grid);
    var redoRow = el('div', 'redo');
    var cb = el('input'); cb.type = 'checkbox'; cb.id = 'redo-' + s.id;
    var lb = el('label', null, '마음에 드는 것이 없습니다. 이 부위는 다시 생성'); lb.htmlFor = cb.id;
    cb.addEventListener('change', function () {
      state[s.id].redo = cb.checked; if (cb.checked) state[s.id].pick = null; persist(); paint();
    });
    redoRow.appendChild(cb); redoRow.appendChild(lb);
    sec.appendChild(redoRow);
    var ta = el('textarea', 'reason');
    ta.id = 'reason-' + s.id; ta.rows = 3;
    ta.placeholder = '어떤 점이 아쉬운지, 어떤 방향으로 다시 만들면 좋을지 적어 주세요. (예: 색이 너무 어둡다, 더 크고 단순하게, 무기 종류를 도끼로)';
    ta.value = state[s.id].reason || '';
    ta.addEventListener('input', function () { state[s.id].reason = ta.value; persist(); paintBar(); });
    sec.appendChild(ta);
    root.appendChild(sec);
    els[s.id] = { sec: sec, st: st, tiles: tiles, cb: cb, ta: ta };
  });

  var bar = document.getElementById('barText');
  var submitBtn = document.getElementById('submit');
  var statusEl = document.getElementById('status');
  var summaryEl = document.getElementById('summary');
  var summaryWrap = document.getElementById('summaryWrap');

  function nameOf(s, key) { for (var i = 0; i < s.options.length; i++) if (s.options[i].key === key) return s.options[i].name; return key; }
  function counts() {
    var picked = 0, redo = 0;
    SLOTS.forEach(function (s) { if (state[s.id].pick) picked++; else if (state[s.id].redo) redo++; });
    return { picked: picked, redo: redo, left: SLOTS.length - picked - redo };
  }
  function paintBar() {
    var c = counts();
    bar.textContent = '선택 ' + c.picked + ' · 다시 생성 ' + c.redo + ' · 미정 ' + c.left;
    submitBtn.disabled = c.left > 0;
  }
  function paint() {
    SLOTS.forEach(function (s) {
      var e = els[s.id], cur = state[s.id];
      Object.keys(e.tiles).forEach(function (k) {
        var on = cur.pick === k;
        e.tiles[k].classList.toggle('on', on);
        e.tiles[k].setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      e.cb.checked = !!cur.redo;
      e.ta.hidden = !cur.redo;
      e.sec.classList.toggle('done', !!cur.pick);
      e.sec.classList.toggle('redoing', !!cur.redo && !cur.pick);
      e.st.textContent = cur.pick ? '선택: ' + nameOf(s, cur.pick) : cur.redo ? '다시 생성' : '아직 안 골랐습니다';
    });
    paintBar();
  }
  function summaryText() {
    var lines = ['[추석 세트 선택 결과]'];
    SLOTS.forEach(function (s) {
      var cur = state[s.id];
      var head = s.set + ' ' + s.slot + ': ';
      if (cur.pick) lines.push(head + nameOf(s, cur.pick) + ' (' + cur.pick + ')');
      else if (cur.redo) lines.push(head + '다시 생성 / 사유: ' + ((cur.reason || '').trim() || '(적지 않음)'));
      else lines.push(head + '(미정)');
    });
    return lines.join('\n');
  }

  var db = null;
  if (window.claude && typeof window.claude.use === 'function') {
    window.claude.use('db').then(function (ns) {
      db = ns;
      if (!db) return;
      db.doc('picks/current').get().then(function (snap) {
        if (!snap.exists) return;
        var d = snap.data() || {};
        var touched = false;
        try { touched = !!localStorage.getItem(LS_KEY); } catch (e) {}
        if (!touched && d.slots) {
          SLOTS.forEach(function (s) { if (d.slots[s.id]) state[s.id] = Object.assign(state[s.id], d.slots[s.id]); els[s.id].ta.value = state[s.id].reason || ''; });
          paint();
        }
        if (d.submittedAtText) statusEl.textContent = '마지막 제출: ' + d.submittedAtText;
      }).catch(function () {});
    }).catch(function () {});
  }

  submitBtn.addEventListener('click', function () {
    var text = summaryText();
    summaryEl.value = text;
    summaryWrap.hidden = false;
    var now = new Date();
    var body = { slots: JSON.parse(JSON.stringify(state)), summary: text, submittedAt: now.toISOString(), submittedAtText: now.toLocaleString('ko-KR') };
    if (!db) {
      statusEl.textContent = '이 화면에서는 저장 기능을 쓸 수 없습니다. 아래 요약을 복사해 채팅에 붙여 주세요.';
      summaryWrap.scrollIntoView({ block: 'center' });
      return;
    }
    submitBtn.disabled = true;
    statusEl.textContent = '저장하는 중…';
    db.doc('picks/current').set(body).then(function () {
      statusEl.textContent = '저장했습니다. 채팅에 "제출했어"라고 알려 주시면 결과를 읽어 옵니다.';
      submitBtn.disabled = false;
    }).catch(function () {
      statusEl.textContent = '저장하지 못했습니다. 아래 요약을 복사해 채팅에 붙여 주세요.';
      submitBtn.disabled = false;
      summaryWrap.scrollIntoView({ block: 'center' });
    });
  });
  document.getElementById('copy').addEventListener('click', function () {
    summaryEl.select();
    var done = function () { statusEl.textContent = '요약을 복사했습니다.'; };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(summaryEl.value).then(done).catch(function () { try { document.execCommand('copy'); done(); } catch (e) {} });
    else { try { document.execCommand('copy'); done(); } catch (e) {} }
  });
  paint();
})();
`;

const html = `<title>추석 세트 선택</title>
<style>
  :root { --bg:#f4f1ea; --panel:#fffdf8; --ink:#1f1b16; --muted:#6b6358; --line:#e3ddd1; --tile:#18181b; --accent:#9b2c2c; --ok:#0f7a4f; --okbg:#e3f4ec; --warn:#a15c07; --warnbg:#fbf0dc; color-scheme: light; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg:#121110; --panel:#1b1917; --ink:#f2eee7; --muted:#a39a8d; --line:#2e2a26; --tile:#0b0b0c; --accent:#e07b6f; --ok:#5fd0a0; --okbg:#12291f; --warn:#f0b35a; --warnbg:#2b2113; color-scheme: dark; } }
  :root[data-theme="dark"] { --bg:#121110; --panel:#1b1917; --ink:#f2eee7; --muted:#a39a8d; --line:#2e2a26; --tile:#0b0b0c; --accent:#e07b6f; --ok:#5fd0a0; --okbg:#12291f; --warn:#f0b35a; --warnbg:#2b2113; color-scheme: dark; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font:14px/1.55 "Pretendard","Apple SD Gothic Neo",system-ui,sans-serif; }
  .wrap { max-width:1080px; margin:0 auto; padding-block:28px 120px; padding-inline:16px; }
  h1 { font-size:22px; margin:0 0 6px; }
  .lead { margin:0; color:var(--muted); max-width:70ch; }
  .slot { margin-top:22px; background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:12px; }
  .slot.done { border-color:var(--ok); }
  .slot.redoing { border-color:var(--warn); }
  .shead { display:flex; flex-wrap:wrap; justify-content:space-between; align-items:baseline; gap:4px 12px; margin-bottom:10px; }
  .sname { font-size:15px; font-weight:800; color:var(--accent); }
  .sstate { font-size:12px; color:var(--muted); }
  .slot.done .sstate { color:var(--ok); font-weight:700; }
  .slot.redoing .sstate { color:var(--warn); font-weight:700; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(min(46%,150px),1fr)); gap:10px; }
  .tile { appearance:none; border:2px solid var(--line); background:var(--panel); color:inherit; border-radius:10px; padding:0; overflow:hidden; text-align:left; cursor:pointer; font:inherit; display:flex; flex-direction:column; }
  .tile:focus-visible { outline:3px solid var(--accent); outline-offset:2px; }
  .tile.on { border-color:var(--ok); background:var(--okbg); }
  .imgbox { display:block; background:var(--tile); aspect-ratio:1/1; }
  .imgbox img { width:100%; height:100%; object-fit:contain; image-rendering:pixelated; display:block; }
  .tname { padding:6px 9px 0; font-size:12.5px; font-weight:700; }
  .tnote { padding:1px 9px 8px; font-size:11.5px; color:var(--muted); line-height:1.4; }
  .redo { display:flex; align-items:center; gap:8px; margin-top:12px; font-size:13px; }
  .redo input { width:17px; height:17px; accent-color:var(--warn); }
  .reason { width:100%; margin-top:8px; border:1px solid var(--line); border-radius:8px; background:var(--bg); color:var(--ink); padding:9px 10px; font:inherit; resize:vertical; }
  .reason:focus-visible { outline:2px solid var(--warn); }
  .summary { margin-top:22px; background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:12px; }
  .summary textarea { width:100%; border:1px solid var(--line); border-radius:8px; background:var(--bg); color:var(--ink); padding:9px 10px; font:12.5px/1.5 ui-monospace,Menlo,monospace; }
  .bar { position:fixed; left:0; right:0; bottom:0; background:var(--panel); border-top:1px solid var(--line); padding:10px 16px calc(10px + env(safe-area-inset-bottom, 0px)); }
  .barin { max-width:1080px; margin:0 auto; display:flex; flex-wrap:wrap; align-items:center; gap:8px 14px; }
  #barText { font-weight:700; font-size:13px; font-variant-numeric:tabular-nums; }
  #status { flex:1; min-width:180px; font-size:12px; color:var(--muted); }
  button.act { appearance:none; border:0; border-radius:9px; background:var(--accent); color:#fff; font:inherit; font-weight:800; padding:9px 18px; cursor:pointer; }
  button.act:disabled { opacity:.4; cursor:not-allowed; }
  button.sub { appearance:none; border:1px solid var(--line); border-radius:8px; background:transparent; color:var(--ink); font:inherit; font-weight:700; padding:6px 12px; cursor:pointer; margin-top:8px; }
</style>
<div class="wrap">
  <h1>추석 세트 선택</h1>
  <p class="lead">지금까지 만든 한복 세트와 달토끼 세트 그림을 부위별로 모두 모았습니다. 부위마다 하나씩, 모두 여섯 개를 골라 주세요. 마음에 드는 것이 없는 부위는 아래 확인란을 누르고 아쉬운 점을 적어 주시면 그 방향으로 다시 만듭니다. 고른 내용은 이 브라우저에 임시로 남아 있고, [제출]을 눌러야 저장됩니다.</p>
  <div id="slots"></div>
  <div class="summary" id="summaryWrap" hidden>
    <b>제출 요약</b>
    <p class="lead" style="font-size:12.5px;margin:4px 0 8px">저장이 안 되는 경우 이 내용을 복사해 채팅에 붙여 주세요.</p>
    <textarea id="summary" rows="8" readonly></textarea>
    <button type="button" class="sub" id="copy">요약 복사</button>
  </div>
</div>
<div class="bar"><div class="barin">
  <span id="barText">선택 0 · 다시 생성 0 · 미정 6</span>
  <span id="status">부위 여섯 곳을 모두 정하면 제출할 수 있습니다.</span>
  <button type="button" class="act" id="submit" disabled>제출</button>
</div></div>
<script>window.__SLOTS__ = ${JSON.stringify(data)};</script>
<script>${SCRIPT}</script>
`;
writeFileSync(out, html);
console.log(`선택 폼 → ${out} (부위 ${SLOTS.length} · 그림 ${SLOTS.reduce((n, s) => n + s.options.length, 0)}장 · 누락 ${missing})`);
