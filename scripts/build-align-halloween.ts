// 할로윈 6종 애니 수동 프레임 정렬(평행이동) 아티팩트 — build-align-anim3.ts와 같은 화면·조작(2026-10-27).
//   실행: bun run scripts/build-align-halloween.ts <out.html>
// 스트립은 data URL로 싣는다(아티팩트는 로컬 sprites/를 못 읽는다). 양산은 원본과 보정안(anim3-alt, 우산 고정)을 둘 다 싣는다.
// 내보낸 JSON은 그대로 scripts/apply-align.ts에 넣는다(보정안 키는 '<id>:alt').
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.argv[2];
if (!OUT) throw new Error('출력 경로가 필요합니다');
const ROOT = process.cwd();
const man = JSON.parse(readFileSync(join(ROOT, 'public/sprites/anim3.json'), 'utf8')) as { cell: number; items: Record<string, { frames: number }> };
const LIST: { id: string; name: string; slot: string }[] = [
  { id: 'hw2_smith_hammer', name: '말하는 담금망치', slot: 'weapon' },
  { id: 'hw5_smith_apron', name: '장인의 앞치마', slot: 'armor' },
  { id: 'hw9_smith_kerchief', name: '장인의 두건', slot: 'accessory' },
  { id: 'hw9_vamp_parasol', name: '레이스 박쥐 양산 · 원본', slot: 'weapon' },
  { id: 'hw9_vamp_parasol:alt', name: '레이스 박쥐 양산 · 보정안(우산 고정)', slot: 'weapon' },
  { id: 'hw5_vamp_cape', name: '박쥐 백작 망토', slot: 'armor' },
  { id: 'hw7_vamp_tophat', name: '박쥐 미니 실크햇', slot: 'accessory' },
];
const items = LIST.flatMap((it) => {
  const [id, alt] = it.id.split(':');
  const p = join(ROOT, alt ? 'public/sprites/anim3-alt' : 'public/sprites/anim3', `${id}.webp`);
  const frames = man.items[id!]?.frames ?? 0;
  if (!frames || !existsSync(p)) return [];
  return [{ ...it, frames, src: `data:image/webp;base64,${readFileSync(p).toString('base64')}` }];
});
const CELL = man.cell ?? 256;

const tpl = readFileSync(join(ROOT, 'scripts/build-align-anim3.ts'), 'utf8');
const body = tpl.slice(tpl.indexOf('<style>'), tpl.lastIndexOf('</script>') + '</script>'.length)
  .replace(/\$\{CELL \* 1\.6\}/g, String(CELL * 1.6))
  .replace(/\$\{CELL\}/g, String(CELL))
  .replace('const ITEMS=${JSON.stringify(items)};', `const ITEMS=${JSON.stringify(items).replace(/</g, '\\u003c')};`)
  .replace("const LSK='align3';", "const LSK='align-halloween-v1';")
  .replace("img.src='sprites/anim3/'+it.id+'.webp?ts='+Date.now();", 'img.src=it.src;')
  .replace("o.textContent=(it.slot[0].toUpperCase())+' · '+it.name+' ('+it.id+')';", "o.textContent={weapon:'무기',armor:'방어구',accessory:'장신구'}[it.slot]+' · '+it.name;")
  .replace('$(\'#slot\').textContent=it.slot;', "$('#slot').textContent={weapon:'무기',armor:'방어구',accessory:'장신구'}[it.slot];")
  .replace(':root{color-scheme:dark}', ':root{color-scheme:dark}\nhtml,body{background:#0b0b0e}')
  .replace(/\\`/g, '`').replace(/\\\$/g, '$');
const intro = `<div style="padding:12px 16px 0;max-width:900px;color:#c9c9d2;font-size:13.5px;line-height:1.6">
<b style="font-size:17px;color:#fff">할로윈 6종 애니 프레임 보정</b><br>
추석 때와 같은 수동 정렬 화면입니다. 위 목록에서 아이템을 고르고, 프레임을 눌러 방향키로 1px씩 옮겨 흔들림을 잡아 주세요(<b>0</b> 리셋, <b>스페이스</b> 재생·정지, <b>잔상</b>으로 겹쳐 보기). 끝나면 <b>보정값 내보내기</b>로 나온 JSON을 복사해 채팅에 붙여 주시면 그대로 적용합니다.
양산은 <b>원본</b>과 <b>보정안</b>(박쥐 무늬·손잡이 박쥐 주변만 움직이고 나머지는 원본 그림으로 고정)을 둘 다 넣었습니다. 쓸 쪽만 보정해 주세요.</div>`;
const html = `<title>할로윈 애니 보정</title>\n${body.replace('<header>', `${intro}\n<header>`)}`.replace('</style></head><body>', '</style>');
writeFileSync(OUT, html);
console.log(`[align-halloween] ${items.length}종 → ${OUT} (${Math.round(html.length / 1024)} KB)`);
