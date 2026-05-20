// 보급 상자 배경 3장(슬롯별) — Pixellab pixflux → public/sprites/hub/box-{weapon,armor,accessory}.png
// 실행: bun run scripts/gen-gacha-boxes.ts
import { config } from 'dotenv';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

config({ path: '.env.local' });
config({ path: '.env', override: false });

const KEY = process.env.PIXELLAB_API_KEY;
if (!KEY) {
  console.error('PIXELLAB_API_KEY 필요 — .env.local');
  process.exit(1);
}
const OUT = join(process.cwd(), 'public', 'sprites', 'hub');

// 공통 — 솔리드 배경 보장(투명 영역 X).
const COMMON =
  'dark atmospheric fantasy pixel art, no characters, centered front view, high ' +
  'detail, fully filled solid background, edge-to-edge composition, no transparent ' +
  'areas, no empty space';

// 새 컨셉 — 닫힌 보급 상자 + **옆에 흐트러진 아이템들**. 슬롯마다 분위기 미세 차이.
//   weapon: 거친 대장간 톤(붉은 화로 그림자)
//   armor: 정돈된 차가운 갑주 보관실 톤(푸른 회색)
//   accessory: 우아한 벨벳 보석함 톤(붉은 자주)
// 공통: 상자 그 자체가 화면 중심·닫혀 있음 + 옆 바닥에 해당 슬롯 아이템 4종 이상이 무질서하게 흩어짐.
const BOXES: { slot: string; prompt: string; fill: { r: number; g: number; b: number } }[] = [
  {
    slot: 'weapon',
    fill: { r: 28, g: 20, b: 16 }, // #1c1410 forge shadow
    prompt:
      'a closed iron-bound dark wooden treasure chest sitting on a worn stone floor, ' +
      'around the chest on the floor are FOUR clearly different types of weapons ' +
      'scattered and lying in disarray — a long sword with its blade angled across ' +
      'the ground, a curved battle axe with its head resting flat, a wooden-shafted ' +
      'spear lying diagonally, and a longbow with a loose string curving away — each ' +
      'weapon must be its OWN obvious type, not the same shape recolored; warm orange ' +
      'forge glow from the right edge of the frame casting long shadows, hot embers ' +
      'and sparks faintly in the air, rough soot-stained stone walls of a deep forge ' +
      'chamber filling the background edge to edge with no empty area, gritty rough ' +
      'blacksmith atmosphere, ' + COMMON,
  },
  {
    slot: 'armor',
    fill: { r: 28, g: 32, b: 48 }, // #1c2030 armory cold steel
    prompt:
      'a closed iron-bound dark wooden treasure chest sitting on a cold stone floor, ' +
      'around the chest on the floor are FIVE clearly different types of armor pieces ' +
      'scattered and lying in disarray — (1) a steel breastplate lying flat on its ' +
      'back, (2) a closed iron helmet on its side, (3) a large round metal shield ' +
      'leaning against the chest at an angle, (4) a pair of tall leather boots ' +
      'fallen over on their side, (5) a pair of iron gauntlets opened palm-down — ' +
      'each piece must be its OWN obvious type, not the same shape recolored; cool ' +
      'pale blue moonlight from above with two muted blue torches at the corners, ' +
      'dim stone walls of an old armory chamber filling the entire background edge to ' +
      'edge with no empty area, quiet solemn knightly atmosphere, ' + COMMON,
  },
  {
    slot: 'accessory',
    fill: { r: 42, g: 22, b: 32 }, // #2a1620 velvet red
    prompt:
      'a closed ornate jewelry chest with brass corners and velvet trim sitting on a ' +
      'polished mahogany table top, around the chest on the table are FOUR clearly ' +
      'different types of accessories scattered casually in disarray — (1) a gold ' +
      'chain necklace with a teardrop ruby pendant lying coiled, (2) a thick gold ' +
      'ring with a large red ruby resting on its side, (3) a pair of dangling ' +
      'teardrop earrings fallen apart from each other, (4) an ornate circular ' +
      'medallion brooch with a center jewel face up — each item must be its OWN ' +
      'obvious type, not the same shape recolored; warm glowing candle light from ' +
      'two ornate candelabras at the edges casting soft golden light, deep red velvet ' +
      'wall background filling the entire frame edge to edge with no empty area, ' +
      'elegant boudoir parlor atmosphere, ' + COMMON,
  },
];

async function gen(
  slot: string,
  prompt: string,
  fill: { r: number; g: number; b: number },
): Promise<'ok' | 'skip' | 'fail'> {
  const file = join(OUT, `box-${slot}.png`);
  if (existsSync(file)) return 'skip';
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch('https://api.pixellab.ai/v1/generate-image-pixflux', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
        body: JSON.stringify({
          description: prompt,
          image_size: { width: 256, height: 256 },
          no_background: false,
        }),
      });
      if (res.status === 429) {
        const wait = 2000 * 2 ** attempt;
        console.error(`  ${slot} 429 → ${wait}ms 후 재시도`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      if (!res.ok) {
        console.error(`  ${slot} HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
        return 'fail';
      }
      const j = (await res.json()) as { image?: { base64?: string } };
      const b64 = j.image?.base64;
      if (!b64) {
        console.error(`  ${slot} no base64`);
        return 'fail';
      }
      const raw = Buffer.from(b64, 'base64');
      if (raw.length < 8 || raw[0] !== 0x89 || raw[1] !== 0x50) {
        console.error(`  ${slot} bad PNG`);
        return 'fail';
      }
      // sharp 후처리 — 솔리드 배경(slot tint) 위에 Pixellab 출력 합성. 투명
      // 영역(Pixellab pixflux가 가끔 alpha 출력)을 강제로 배경색으로 채움.
      const meta = await sharp(raw).metadata();
      const w = meta.width ?? 256;
      const h = meta.height ?? 256;
      const base = await sharp({
        create: {
          width: w,
          height: h,
          channels: 4,
          background: { ...fill, alpha: 1 },
        },
      })
        .png()
        .toBuffer();
      const buf = await sharp(base).composite([{ input: raw }]).png().toBuffer();
      writeFileSync(file, buf);
      console.log(`  ✓ ${file} (${buf.length}B) — bg ${fill.r},${fill.g},${fill.b}`);
      return 'ok';
    } catch (e) {
      console.error(`  ${slot} 예외 ${(e as Error).message} (attempt ${attempt})`);
      await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt));
    }
  }
  return 'fail';
}

let ok = 0;
let skip = 0;
let fail = 0;
for (const b of BOXES) {
  const r = await gen(b.slot, b.prompt, b.fill);
  if (r === 'ok') ok++;
  else if (r === 'skip') skip++;
  else fail++;
  await new Promise((r) => setTimeout(r, 800));
}
console.log(`[gacha-boxes] ok ${ok} · skip ${skip} · fail ${fail} / ${BOXES.length}`);
process.exit(fail > 0 ? 1 : 0);
