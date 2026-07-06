// 테스트: 외형 묘사 없이 [종류 + 컨셉(역할·무드)] + 품질만 전달 → 외형은 Pixellab에 위임.
// 이미지-우선이라 이름/로어는 나중. 실제 스프라이트 경로 저장.
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
const TAIL = 'a beautiful clean fantasy anime RPG gacha-game weapon, bright and stylish, not gothic, a single isolated object on a plain flat empty background, large, pixel art';
const JOBS: Job[] = [
  { key: 'kingdom_court_twin_sabers', slot: 'weapon', prompt: `a pair of dueling sabers — the matched blades of a kingdom's proud twin royal fencers who never lose, elegant and dazzling, ${TAIL}` },
  { key: 'temple_glacier_lance', slot: 'weapon', prompt: `a cavalry lance — forged from the heart of a thousand-year glacier by the snow temple, sacred frost-blue and unbreakable, ${TAIL}` },
  { key: 'orc_skypiercer_warbow', slot: 'weapon', prompt: `a great warbow — the sky-piercing bow of an orc festival's champion hunter, wild triumphant tribal, ${TAIL}` },
  { key: 'volcano_dragonjaw_halberd', slot: 'weapon', prompt: `a halberd — the dragon-jaw poleaxe of a volcano forge-knight, molten obsidian and gold, fearsome yet splendid, ${TAIL}` },
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
await Promise.all(Array.from({ length: Math.min(4, JOBS.length) }, worker));
console.log(`[gen-concept] 완료 — ok ${ok} / fail ${fail}`);
