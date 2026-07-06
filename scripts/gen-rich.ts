// 이미지-우선 워크플로: 리치 자유 프롬프트(자유 3종 톤)로 직접 생성 → 실제 스프라이트 경로 저장.
// 이름/로어는 이미지 보고 나중에. buildArt 템플릿 우회(여기 prompt가 곧 description).
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
const JOBS: Job[] = [
  // ── 무기 (type-led + signature + clean gacha, large) ──
  { key: 'kingdom_winged_coronation_sword', slot: 'weapon', prompt: 'a gorgeous fantasy anime RPG longsword, a gleaming straight blade with an elegant golden winged crossguard a crown-shaped pommel and a single sky-blue gem, a beautiful clean gacha game weapon, a single isolated object on a plain flat empty background, large, pixel art' },
  { key: 'volcano_emberline_katana', slot: 'weapon', prompt: 'a gorgeous fantasy anime RPG katana, a sleek black curved blade with a single molten ember line along the edge a gold tsuba and a flame-wrapped hilt, a beautiful clean gacha game weapon, a single isolated object on a plain flat empty background, large, pixel art' },
  { key: 'temple_frost_odachi', slot: 'weapon', prompt: 'a gorgeous fantasy anime RPG odachi greatsword, a long elegant pale ice-blue blade with frost crystals near the guard and a silver-wrapped hilt with a tassel, a beautiful clean gacha game weapon, a single isolated object on a plain flat empty background, large, pixel art' },
  { key: 'swamp_lotus_trident', slot: 'weapon', prompt: 'a gorgeous fantasy anime RPG trident, an elegant mint-green living-wood polearm with three slender prongs blooming water-lilies and curling vines, a beautiful clean gacha game weapon, a single isolated object on a plain flat empty background, large, pixel art' },

  // ── 방어구 (headless worn outfit) ──
  { key: 'kingdom_moonwaltz_gown', slot: 'armor', prompt: 'a beautiful fantasy anime RPG ballgown, an elegant lilac and silver court dress with a fitted jeweled bodice an airy layered chiffon skirt and pearl trim, a lovely clean gacha game costume shown as the worn outfit on its own with no head and no neck, a slim full-length figure, a single isolated object on a plain flat empty background, pixel art' },
  { key: 'kingdom_academy_uniform', slot: 'armor', prompt: 'a charming fantasy anime RPG school uniform, a smart navy academy outfit with a tailored gold-trimmed coat a school crest a ribbon and a pleated skirt, a lovely clean gacha game costume shown as the worn outfit on its own with no head and no neck, a slim full-length figure, a single isolated object on a plain flat empty background, pixel art' },
  { key: 'volcano_dragonscale_armor', slot: 'armor', prompt: 'a cool fantasy anime RPG armor, slim layered obsidian dragon-scale plate edged in molten gold with a high collar and a long flowing scaled skirt, a beautiful clean gacha game costume shown as the worn armor on its own with no head and no neck, a slim full-length figure, a single isolated object on a plain flat empty background, pixel art' },
  { key: 'swamp_casual_witch', slot: 'armor', prompt: 'a cute fantasy anime RPG casual witch outfit, a short layered teal dress with a soft cream knit shawl mint stockings and a little firefly-gold star-charm belt, a lovely clean gacha game costume shown as the worn outfit on its own with no head and no neck, a slim full-length figure, a single isolated object on a plain flat empty background, pixel art' },

  // ── 장신구 (존재감) ──
  { key: 'kingdom_plumed_hat', slot: 'accessory', prompt: 'a charming fantasy anime RPG hat, a dashing wide-brimmed royal cavalier hat in deep blue with a sweeping cream ostrich plume and a jeweled gold band, a beautiful clean gacha game item, a single isolated object on a plain flat empty background, pixel art' },
  { key: 'volcano_dragonscale_satchel', slot: 'accessory', prompt: 'a cool fantasy anime RPG satchel, a black obsidian dragon-scale leather shoulder bag with molten-gold buckles a polished ruby clasp and a braided strap, a beautiful clean gacha game item, a single isolated object on a plain flat empty background, pixel art' },
  { key: 'angel_star_scepter', slot: 'accessory', prompt: 'a gorgeous fantasy anime RPG scepter, a slender white and gold celestial wand topped with a radiant golden star ornament and small feathered wings, a beautiful clean gacha game item, a single isolated object on a plain flat empty background, pixel art' },
  { key: 'orc_festival_mask', slot: 'accessory', prompt: 'a charming fantasy anime RPG tribal mask, a colorful carved wooden festival mask with a wide cheerful smile teal and amber paint and tall feathers, a beautiful clean gacha game item, a single isolated object on a plain flat empty background, pixel art' },
];

if (!KEY) { console.error('PIXELLAB_API_KEY_2 필요'); process.exit(1); }

async function gen(job: Job): Promise<'ok' | 'fail'> {
  mkdirSync(join(ROOT, 'public', 'sprites', job.slot), { recursive: true });
  const file = join(ROOT, 'public', 'sprites', job.slot, `${job.key}.png`);
  let id = '';
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(`${PIX}/create-1-direction-object`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
      body: JSON.stringify({ description: job.prompt, size: 256, view: 'sidescroller' }),
    });
    if (res.status === 429) { await sleep(2000 * 2 ** attempt); continue; }
    if (!res.ok) { console.error(`${job.key} create HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`); return 'fail'; }
    const j = (await res.json()) as { object_id?: string };
    id = j.object_id ?? '';
    break;
  }
  if (!id) return 'fail';
  for (let i = 0; i < 100; i++) {
    await sleep(3000);
    let g: Response;
    try { g = await fetch(`${PIX}/objects/${id}`, { headers: { authorization: `Bearer ${KEY}` } }); } catch { continue; }
    if (!g.ok) continue;
    const gj = (await g.json()) as { status?: string; rotation_urls?: unknown; frame_urls?: unknown; storage_urls?: unknown };
    if (gj.status === 'completed' || gj.status === 'review') {
      const url = pickUrl(gj.rotation_urls) ?? pickUrl(gj.frame_urls) ?? pickUrl(gj.storage_urls);
      if (!url) { console.error(`${job.key} no url`); return 'fail'; }
      const img = await fetch(url);
      const buf = Buffer.from(await img.arrayBuffer());
      writeFileSync(file, buf);
      console.log(`  · ${job.key} … ok`);
      return 'ok';
    }
    if (gj.status === 'failed') { console.error(`${job.key} failed`); return 'fail'; }
  }
  console.error(`${job.key} timeout`);
  return 'fail';
}

const CONC = Math.max(1, Number(process.env.GEN_CONC ?? 4));
let idx = 0, ok = 0, fail = 0;
const worker = async () => { while (idx < JOBS.length) { const r = await gen(JOBS[idx++]!); if (r === 'ok') ok++; else fail++; } };
await Promise.all(Array.from({ length: Math.min(CONC, JOBS.length) }, worker));
console.log(`[gen-rich] 완료 — ok ${ok} / fail ${fail}`);
