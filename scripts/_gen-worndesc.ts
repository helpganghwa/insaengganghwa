// 아이템별 '착용/장착 외형' 사전 묘사(wornDesc) 1회 생성 — 성별중립·간결.
// art(스프라이트 프롬프트)에서 'pixel art'·구도어·성별 의상어 제거 + 착용형으로 정제.
// 출력: scripts/_worndesc.json {key: wornDesc}
import { config } from 'dotenv';
import { readFileSync, writeFileSync } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
config({ path: '.env.local' });
const src = readFileSync('lib/game/equipment/catalog-next.ts', 'utf8');
const arr = JSON.parse(src.match(/export const CATALOG_NEXT[^=]*=\s*(\[[\s\S]*\]);/)![1]) as { key: string; slot: string; nameKo: string; art: string }[];
const items = arr.map((x) => ({ key: x.key, slot: x.slot, art: x.art }));
const a = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
const SYS = `You rewrite pixel-art item prompts into CONCISE worn/wielded appearance phrases for an anime character generator.
Rules per item:
- Max 14 words. English. A noun phrase describing how the item looks WORN (armor/accessory) or WIELDED (weapon) on a character.
- GENDER-NEUTRAL: NEVER use the words gown, dress, bodice, corset, skirt, cleavage. For garments use neutral words: attire, robe, ensemble, garb, regalia, coat, tunic, outfit. Keep it wearable by any gender.
- Keep the key visual identity: colors, material, motif, distinctive features.
- DROP: "pixel art", and composition/pose words like "held diagonally", "crossed diagonally", "full body".
- Output STRICT JSON only: an object mapping each key to its phrase. No prose.`;
const userMsg = `Items (key | slot | art):\n` + items.map((it) => `${it.key} | ${it.slot} | ${it.art}`).join('\n');
const res = await a.messages.create({ model: 'claude-sonnet-4-6', max_tokens: 8000, system: SYS, messages: [{ role: 'user', content: userMsg }] });
const tb = res.content.find((b) => b.type === 'text');
const raw = tb && 'text' in tb ? tb.text : '';
const json = raw.match(/\{[\s\S]*\}/)![0];
const map = JSON.parse(json) as Record<string, string>;
const miss = items.filter((it) => !map[it.key]);
writeFileSync('scripts/_worndesc.json', JSON.stringify(map, null, 0));
console.log('생성:', Object.keys(map).length, '/ 108 | 누락:', miss.length, miss.map((m) => m.key).join(','));
// 샘플
for (const k of ['kingdom_masque_gown','marsh_lily_gown','kingdom_masque_saber','volcano_dancer_daggers','kingdom_masque_mask']) console.log('  '+k+': '+map[k]);
