// 컨셉-온리 테스트 2탄: 방어구·장신구. 외형 위임, [종류+컨셉+품질]만.
// 방어구는 '머리/목 없는 입은 옷' 구조 프레이밍 유지(외형 아님).
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
const KEY = process.env.PIXELLAB_API_KEY_2;
const PIX = 'https://api.pixellab.ai/v2';
const ROOT = process.cwd();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function pickUrl(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === 'string') return v.startsWith('http') ? v : null;
  if (Array.isArray(v)) { for (const x of v) { const u = pickUrl(x); if (u) return u; } return null; }
  if (typeof v === 'object') { for (const x of Object.values(v as Record<string, unknown>)) { const u = pickUrl(x); if (u) return u; } }
  return null;
}
type Job = { key: string; slot: 'weapon' | 'armor' | 'accessory'; prompt: string };
const A_TAIL = 'a beautiful clean fantasy anime RPG gacha-game outfit, bright and stylish, not gothic, shown as the worn outfit on its own with no head and no neck, a slim full-length figure, a single isolated object on a plain flat empty background, pixel art';
const C_TAIL = 'a beautiful clean fantasy anime RPG gacha-game item, bright and stylish, not gothic, a single isolated object on a plain flat empty background, pixel art';
const JOBS: Job[] = [
  { key: 'angel_radiant_gown', slot: 'armor', prompt: `a flowing gown — the radiant attire of a celestial temple dancer who weaves morning sunlight, graceful and luminous in white and gold, ${A_TAIL}` },
  { key: 'orc_featherdance_dress', slot: 'armor', prompt: `a feathered dance dress — the festival attire of an orc dawn-feather dancer, vibrant and joyful in teal and amber, ${A_TAIL}` },
  { key: 'temple_snowflake_crown', slot: 'accessory', prompt: `a snowflake crown — the crown of a winter temple's ice maiden, delicate and sacred in silver and frost-blue, ${C_TAIL}` },
  { key: 'volcano_obsidian_warfan', slot: 'accessory', prompt: `an obsidian war-fan — the dueling fan of a proud volcano warrior, fierce and elegant in black and molten gold, ${C_TAIL}` },
];
if (!KEY) { console.error('PIXELLAB_API_KEY_2 필요'); process.exit(1); }
async function gen(job: Job): Promise<'ok' | 'fail'> {
  mkdirSync(join(ROOT, 'public', 'sprites', job.slot), { recursive: true });
  const file = join(ROOT, 'public', 'sprites', job.slot, `${job.key}.png`);
  let id = '';
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(`${PIX}/create-1-direction-object`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
      body: JSON.stringify({ description: job.prompt, size: 256, view: 'sidescroller' }),
    });
    if (res.status === 429) { await sleep(2000 * 2 ** attempt); continue; }
    if (!res.ok) { console.error(`${job.key} HTTP ${res.status}`); return 'fail'; }
    id = ((await res.json()) as { object_id?: string }).object_id ?? ''; break;
  }
  if (!id) return 'fail';
  for (let i = 0; i < 100; i++) {
    await sleep(3000);
    let g: Response; try { g = await fetch(`${PIX}/objects/${id}`, { headers: { authorization: `Bearer ${KEY}` } }); } catch { continue; }
    if (!g.ok) continue;
    const gj = (await g.json()) as { status?: string; rotation_urls?: unknown; frame_urls?: unknown; storage_urls?: unknown };
    if (gj.status === 'completed' || gj.status === 'review') {
      const url = pickUrl(gj.rotation_urls) ?? pickUrl(gj.frame_urls) ?? pickUrl(gj.storage_urls);
      if (!url) return 'fail';
      writeFileSync(file, Buffer.from(await (await fetch(url)).arrayBuffer()));
      console.log(`  · ${job.key} … ok`); return 'ok';
    }
    if (gj.status === 'failed') return 'fail';
  }
  return 'fail';
}
let idx = 0, ok = 0, fail = 0;
const worker = async () => { while (idx < JOBS.length) { if ((await gen(JOBS[idx++]!)) === 'ok') ok++; else fail++; } };
await Promise.all(Array.from({ length: 4 }, worker));
console.log(`[gen-concept2] 완료 — ok ${ok} / fail ${fail}`);
