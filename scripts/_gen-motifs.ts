/**
 * 카탈로그 art(형태 포함)에서 모티프(개념+색)만 LLM(Haiku) 배치 추출 → motifs.ts.
 * 생성 핫패스엔 LLM 없음(사전 1회). 형태(검/모자/브로치 등)·tone 형용사 제외.
 * 재실행: 카탈로그 변경 시.
 */
import { config } from 'dotenv';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

config({ path: '.env.local' });

const PROMPT = `You extract CHARACTER DESIGN MOTIFS from pixel-art fantasy item descriptions.

For each item, output ONLY the core motif as 2-4 lowercase keywords:
- the creature / concept / element (e.g. dragon, frog, angel, phoenix, skull, rune, flower)
- the dominant color(s) (e.g. red, green, gold, black, blue)

STRICTLY EXCLUDE:
- the item form/type (sword, dagger, blade, axe, hat, ring, brooch, crown, robe, wand, staff, etc.)
- tone adjectives (humorous, mournful, eerie, grand, etc.)
- generic words (fantasy, item, icon, weapon, armor, accessory, marsh, swamp)

Examples:
- "green folded leaf blade with a small frog" → "frog, green"
- "dragon slayer red sword with scales" → "dragon, red"
- "gold angel brooch with white wings" → "angel, gold, white"
- "human skull mounted on a haft" → "skull, bone"

Output a single JSON object mapping each key to its motif string. JSON only, no prose.`;

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY missing');
  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const { CATALOG_ITEMS } = await import('../lib/game/equipment/catalog');
  const client = new Anthropic({ apiKey });

  const items = CATALOG_ITEMS.map((c) => ({ key: c.key, art: c.art }));
  const chunks: typeof items[] = [];
  for (let i = 0; i < items.length; i += 50) chunks.push(items.slice(i, i + 50));

  const motifs: Record<string, string> = {};
  for (let ci = 0; ci < chunks.length; ci++) {
    const res = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4000,
      messages: [
        { role: 'user', content: `${PROMPT}\n\nItems:\n${JSON.stringify(chunks[ci])}` },
      ],
    });
    const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error(`chunk ${ci}: no JSON in response`);
    Object.assign(motifs, JSON.parse(m[0]) as Record<string, string>);
    console.log(`chunk ${ci + 1}/${chunks.length}: +${Object.keys(JSON.parse(m[0])).length}`);
  }

  const missing = items.filter((it) => !motifs[it.key]);
  if (missing.length) console.warn('누락:', missing.map((m) => m.key).join(', '));

  const out = join(process.cwd(), 'lib', 'game', 'equipment', 'motifs.ts');
  const body =
    '/** 카탈로그 모티프(개념+색) — scripts/_gen-motifs.ts 로 art에서 추출. 형태·tone 제외. */\n' +
    `export const ITEM_MOTIFS: Record<string, string> = ${JSON.stringify(motifs, null, 2)};\n`;
  writeFileSync(out, body);
  console.log(`saved ${Object.keys(motifs).length} motifs → ${out}`);
}

main().catch((e) => {
  console.error('[FATAL]', e);
  process.exit(1);
});
