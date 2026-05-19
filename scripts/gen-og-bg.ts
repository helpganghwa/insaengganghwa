// OG 배경 아트 8장 생성 — Pixellab pixflux REST → public/og/og-1..8.png
// 실행: bun run scripts/gen-og-bg.ts   (멱등 — 이미 있는 파일은 skip)
// WIREFRAMES §10.1. 어둡고 분위기 있는 와이드 씬, 인물 없음(배경) — OG 카드 스크림 위.
import { config } from 'dotenv';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

config({ path: '.env.local' });
config({ path: '.env', override: false });

const KEY = process.env.PIXELLAB_API_KEY;
if (!KEY) {
  console.error('PIXELLAB_API_KEY 필요 — .env.local');
  process.exit(1);
}
const OUT = join(process.cwd(), 'public', 'og');
mkdirSync(OUT, { recursive: true });

const STYLE =
  'dark atmospheric fantasy pixel art, wide cinematic background scene, no characters, moody dramatic lighting, high detail';
const SCENES = [
  'ancient torch-lit dwarven forge hall with a glowing anvil and floating embers',
  'torch-lit stone dungeon corridor with iron sconces and drifting mist',
  'ruined moonlit castle courtyard, broken marble pillars, pale fog',
  'vast volcanic cavern with rivers of lava and ember sparks',
  'moonlit battlefield aftermath, tattered banners, distant jagged mountains',
  'enchanted deep forest shrine with glowing blue runes and fireflies',
  'frozen citadel hall of ice pillars under cold pale-blue light',
  'golden dawn breaking over a cliffside mountain fortress, dramatic sky',
];

async function gen(n: number, scene: string): Promise<'skip' | 'ok' | 'fail'> {
  const file = join(OUT, `og-${n}.png`);
  if (existsSync(file)) return 'skip';
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch('https://api.pixellab.ai/v1/generate-image-pixflux', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
        body: JSON.stringify({
          description: `${scene}, ${STYLE}`,
          image_size: { width: 200, height: 120 },
          no_background: false,
        }),
      });
      if (res.status === 429) {
        const wait = 2000 * 2 ** attempt;
        console.error(`  og-${n} 429 → ${wait}ms 후 재시도`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      if (!res.ok) {
        console.error(`  og-${n} HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`);
        return 'fail';
      }
      const j = (await res.json()) as { image?: { base64?: string } };
      const b64 = j.image?.base64;
      if (!b64) {
        console.error(`  og-${n} no base64`);
        return 'fail';
      }
      const buf = Buffer.from(b64, 'base64');
      if (buf.length < 8 || buf[0] !== 0x89 || buf[1] !== 0x50) {
        console.error(`  og-${n} bad PNG`);
        return 'fail';
      }
      writeFileSync(file, buf);
      console.log(`  ✓ og-${n}.png (${buf.length}B)`);
      return 'ok';
    } catch (e) {
      console.error(`  og-${n} 예외 ${(e as Error).message} (attempt ${attempt})`);
      await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt));
    }
  }
  return 'fail';
}

// 동시성 2 + 800ms 페이싱.
const CONC = 2;
let i = 0;
let ok = 0;
let skip = 0;
let fail = 0;
async function worker() {
  while (i < SCENES.length) {
    const idx = i++;
    const r = await gen(idx + 1, SCENES[idx]!);
    if (r === 'ok') ok++;
    else if (r === 'skip') skip++;
    else fail++;
    await new Promise((r) => setTimeout(r, 800));
  }
}
await Promise.all(Array.from({ length: CONC }, worker));
console.log(`[og-bg] ok ${ok} · skip ${skip} · fail ${fail} / ${SCENES.length}`);
process.exit(fail > 0 ? 1 : 0);
