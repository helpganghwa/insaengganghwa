// 인접 그래프 수동 편집기(HTML) 생성 — 월드맵 위 노드를 클릭해 길을 잇고/끊고, 간선 목록을 내보냄.
//   DB에서 좌표·현재 간선을 읽어 자체 완결형 HTML을 worldmap.png 옆에 출력(파일 직접 열기 가능).
//   실행: bun --conditions react-server scripts/_gen-adjacency-editor.ts
//   결과: public/sprites/guild/adjacency-editor.html  → 브라우저로 열어 편집 → '내보내기' 복사.
import { writeFileSync } from 'node:fs';
import { config } from 'dotenv';
config({ path: '.env.local' });

const { db } = await import('@/lib/db/client');
const { zones, zoneAdjacency } = await import('@/lib/db/schema/guild');

const zs = await db
  .select({ id: zones.id, region: zones.region, name: zones.name, x: zones.mapX, y: zones.mapY })
  .from(zones);
zs.sort((a, b) => a.id - b.id);
const edges = await db.select({ a: zoneAdjacency.zoneA, b: zoneAdjacency.zoneB }).from(zoneAdjacency);

const ZONES_JSON = JSON.stringify(zs);
const EDGES_JSON = JSON.stringify(edges.map((e) => (e.a < e.b ? [e.a, e.b] : [e.b, e.a])));

const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>구역 인접(길) 편집기</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; background: #0b0e16; color: #e5e7eb; font-family: -apple-system, system-ui, sans-serif; }
  .wrap { max-width: 1100px; margin: 0 auto; padding: 16px; }
  h1 { font-size: 16px; margin: 0 0 4px; }
  .hint { font-size: 12px; color: #9ca3af; line-height: 1.6; margin: 0 0 12px; }
  .bar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 12px; }
  button { background: #1f2937; color: #e5e7eb; border: 1px solid #374151; border-radius: 8px; padding: 7px 12px; font-size: 13px; font-weight: 700; cursor: pointer; }
  button:hover { background: #374151; }
  button.primary { background: #d97706; border-color: #d97706; color: #fff; }
  button.danger { color: #fca5a5; }
  .count { font-size: 13px; color: #cbd5e1; font-weight: 700; }
  .stage { position: relative; width: 100%; aspect-ratio: 1/1; background: #000; border: 1px solid #374151; border-radius: 12px; overflow: hidden; user-select: none; }
  .stage img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; image-rendering: pixelated; }
  svg { position: absolute; inset: 0; width: 100%; height: 100%; }
  svg line.edge { stroke: #fcd34d; stroke-opacity: .85; stroke-width: .5; stroke-linecap: round; cursor: pointer; }
  svg line.edge:hover { stroke: #f87171; stroke-opacity: 1; stroke-width: 1; }
  svg line.halo { stroke: #000; stroke-opacity: .4; stroke-width: 1; stroke-linecap: round; pointer-events: none; }
  .node { position: absolute; transform: translate(-50%, -50%); cursor: pointer; }
  .dot { width: 16px; height: 16px; border-radius: 4px; border: 1.5px solid #fff; box-shadow: 0 0 0 1px #000; }
  .node.sel .dot { box-shadow: 0 0 0 2px #fde047, 0 0 8px #fde047; }
  .lbl { position: absolute; left: 50%; top: 100%; transform: translateX(-50%); margin-top: 2px; white-space: nowrap; font-size: 9px; font-weight: 700; color: #fff; background: rgba(0,0,0,.7); padding: 0 3px; border-radius: 3px; }
  .deg { position: absolute; left: 50%; top: -4px; transform: translate(-50%,-100%); font-size: 9px; font-weight: 800; color: #fde047; text-shadow: 0 1px 2px #000; }
  textarea { width: 100%; height: 120px; margin-top: 12px; background: #111827; color: #e5e7eb; border: 1px solid #374151; border-radius: 8px; padding: 10px; font-family: ui-monospace, monospace; font-size: 12px; }
  .legend { display: flex; flex-wrap: wrap; gap: 10px; font-size: 11px; color: #9ca3af; margin-top: 8px; }
  .legend span { display: inline-flex; align-items: center; gap: 4px; }
  .legend i { width: 10px; height: 10px; border-radius: 3px; display: inline-block; }
</style>
</head>
<body>
<div class="wrap">
  <h1>구역 인접(길) 편집기</h1>
  <p class="hint">
    노드를 클릭해 <b>선택</b>(노랑 테두리) → 다른 노드를 클릭하면 둘 사이 길을 <b>토글</b>(없으면 잇고, 있으면 끊음). 선택 상태가 유지되어 한 노드에서 여러 길을 빠르게 연결할 수 있어요.<br>
    · 길(선)을 직접 클릭하면 그 길만 삭제 · 빈 곳/같은 노드 클릭 또는 Esc = 선택 해제 · 노드 위 숫자 = 현재 연결 수<br>
    · 다 되면 <b>내보내기</b>를 눌러 아래 칸의 내용을 복사해 전달해 주세요.
  </p>
  <div class="bar">
    <span class="count" id="count"></span>
    <button class="primary" id="export">내보내기(복사)</button>
    <button id="reset">현재로 초기화</button>
    <button class="danger" id="clear">전체 지우기</button>
    <button id="toggleLbl">이름 표시 끄기</button>
  </div>
  <div class="stage" id="stage">
    <img src="worldmap.png" alt="월드맵" draggable="false" />
    <svg id="svg" viewBox="0 0 100 100" preserveAspectRatio="none"></svg>
    <div id="nodes"></div>
  </div>
  <div class="legend" id="legend"></div>
  <textarea id="out" readonly placeholder="내보내기를 누르면 여기에 간선 목록(SQL VALUES + 배열)이 나옵니다."></textarea>
</div>
<script>
const ZONES = ${ZONES_JSON};
const INITIAL = ${EDGES_JSON};
const REGION = { volcano:'#ef4444', temple:'#60a5fa', swamp:'#22c55e', orc:'#f97316', kingdom:'#fbbf24', angel:'#c084fc' };
const REGION_KO = { volcano:'드래곤 화산', temple:'잊힌 신전', swamp:'슬라임 늪', orc:'오크 부락', kingdom:'왕국', angel:'타락 천사 부유섬' };
const byId = new Map(ZONES.map(z => [z.id, z]));
const key = (a,b) => a < b ? a+'-'+b : b+'-'+a;
let edgeSet = new Set(INITIAL.map(([a,b]) => key(a,b)));
let sel = null;
let showLbl = true;

const svg = document.getElementById('svg');
const nodesEl = document.getElementById('nodes');
const countEl = document.getElementById('count');
const out = document.getElementById('out');

function edges() {
  return [...edgeSet].map(k => k.split('-').map(Number)).map(([a,b]) => a<b?[a,b]:[b,a]).sort((p,q)=>p[0]-q[0]||p[1]-q[1]);
}
function degree() {
  const d = new Map();
  for (const [a,b] of edges()) { d.set(a,(d.get(a)||0)+1); d.set(b,(d.get(b)||0)+1); }
  return d;
}
function render() {
  const es = edges();
  // edges
  svg.innerHTML = '';
  const NS = 'http://www.w3.org/2000/svg';
  for (const [a,b] of es) {
    const za = byId.get(a), zb = byId.get(b);
    const halo = document.createElementNS(NS,'line');
    halo.setAttribute('class','halo'); halo.setAttribute('x1',za.x); halo.setAttribute('y1',za.y); halo.setAttribute('x2',zb.x); halo.setAttribute('y2',zb.y);
    svg.appendChild(halo);
  }
  for (const [a,b] of es) {
    const za = byId.get(a), zb = byId.get(b);
    const ln = document.createElementNS(NS,'line');
    ln.setAttribute('class','edge'); ln.setAttribute('x1',za.x); ln.setAttribute('y1',za.y); ln.setAttribute('x2',zb.x); ln.setAttribute('y2',zb.y);
    ln.addEventListener('click', (e) => { e.stopPropagation(); edgeSet.delete(key(a,b)); render(); });
    svg.appendChild(ln);
  }
  // nodes
  const d = degree();
  nodesEl.innerHTML = '';
  for (const z of ZONES) {
    const n = document.createElement('div');
    n.className = 'node' + (sel === z.id ? ' sel' : '');
    n.style.left = z.x + '%'; n.style.top = z.y + '%';
    const dot = document.createElement('div'); dot.className = 'dot'; dot.style.background = REGION[z.region] || '#888';
    n.appendChild(dot);
    const deg = document.createElement('div'); deg.className = 'deg'; deg.textContent = d.get(z.id) || 0; n.appendChild(deg);
    if (showLbl) { const l = document.createElement('div'); l.className='lbl'; l.textContent = z.id + ' ' + z.name; n.appendChild(l); }
    n.title = '['+z.id+'] '+REGION_KO[z.region]+' '+z.name;
    n.addEventListener('click', (e) => { e.stopPropagation(); onNode(z.id); });
    nodesEl.appendChild(n);
  }
  countEl.textContent = '간선 ' + es.length + '개';
}
function onNode(id) {
  if (sel === null) { sel = id; render(); return; }
  if (sel === id) { sel = null; render(); return; }
  const k = key(sel, id);
  if (edgeSet.has(k)) edgeSet.delete(k); else edgeSet.add(k);
  render(); // sel 유지 → 연쇄 연결
}
document.getElementById('stage').addEventListener('click', () => { sel = null; render(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { sel = null; render(); } });
document.getElementById('reset').addEventListener('click', () => { edgeSet = new Set(INITIAL.map(([a,b])=>key(a,b))); sel=null; render(); });
document.getElementById('clear').addEventListener('click', () => { if (confirm('모든 길을 지울까요?')) { edgeSet = new Set(); sel=null; render(); } });
document.getElementById('toggleLbl').addEventListener('click', (e) => { showLbl = !showLbl; e.target.textContent = showLbl ? '이름 표시 끄기' : '이름 표시 켜기'; render(); });
document.getElementById('export').addEventListener('click', () => {
  const es = edges();
  const vals = es.map(([a,b]) => '('+a+','+b+')').join(',');
  const sql = 'DELETE FROM zone_adjacency;\\nINSERT INTO zone_adjacency (zone_a, zone_b) VALUES\\n  ' + vals + '\\nON CONFLICT DO NOTHING;';
  const arr = '[' + es.map(([a,b]) => '['+a+','+b+']').join(',') + ']';
  out.value = '간선 ' + es.length + '개\\n\\n=== SQL ===\\n' + sql + '\\n\\n=== 배열 ===\\n' + arr;
  out.select(); try { document.execCommand('copy'); } catch(e){}
});
// legend
document.getElementById('legend').innerHTML = Object.entries(REGION_KO).map(([k,v]) => '<span><i style="background:'+REGION[k]+'"></i>'+v+'</span>').join('');
render();
</script>
</body>
</html>
`;

const path = 'public/sprites/guild/adjacency-editor.html';
writeFileSync(path, html);
console.log('✓ 생성:', path, '— 구역', zs.length, '· 현재 간선', edges.length);
process.exit(0);
