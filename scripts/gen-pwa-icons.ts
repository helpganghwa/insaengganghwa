// PWA 아이콘 — Pixellab pixflux → public/icons/icon-{192,512,maskable-512}.png
//   192/512: purpose 'any' (실루엣 그대로 노출)
//   maskable-512: purpose 'maskable' (안드로이드 safe area 80% 안에 핵심 모티프)
//
// 모티프: 모루 위 망치(인생강화 — 시간기반 강화 게임의 시각 상징).
// 배경은 솔리드(투명 X). theme_color #0a0a0a와 어울리는 짙은 톤 그라데이션.
//
// 실행: bun run scripts/gen-pwa-icons.ts
import { config } from 'dotenv';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

config({ path: '.env.local' });
config({ path: '.env', override: false });

const KEY = process.env.PIXELLAB_API_KEY;
if (!KEY) {
  console.error('PIXELLAB_API_KEY 필요 — .env.local');
  process.exit(1);
}
const OUT = join(process.cwd(), 'public', 'icons');
mkdirSync(OUT, { recursive: true });

// 공통 — 솔리드 짙은 배경, 캐릭터 없음, 픽셀아트.
const COMMON =
  'dark fantasy pixel art game icon, centered front view, no characters, no text, ' +
  'no letters, no words, high contrast, fully filled solid dark background, ' +
  'edge-to-edge composition, no transparent areas';

type Spec = {
  file: string;
  prompt: string;
  size: number;
  /** maskable 용 — Pixellab 256→sharp resize 후 padding(safe area) 추가. */
  padding?: number;
};

const SPECS: Spec[] = [
  {
    file: 'icon-192.png',
    size: 192,
    prompt:
      'a large iron anvil at center with an ornate blacksmith hammer resting on top, ' +
      'orange ember sparks rising around, deep red and dark stone forge background ' +
      'filling the entire frame, warm torch glow at edges, ' + COMMON,
  },
  {
    file: 'icon-512.png',
    size: 512,
    prompt:
      'a large iron anvil at center with an ornate blacksmith hammer resting on top, ' +
      'orange ember sparks rising around, deep red and dark stone forge background ' +
      'filling the entire frame, warm torch glow at edges, ' + COMMON,
  },
  {
    file: 'icon-maskable-512.png',
    size: 512,
    padding: 64, // safe area ≈ 87.5% (512−2·32 ≈ 448), 충분히 안쪽으로 모티프 배치.
    prompt:
      'a large iron anvil at center with an ornate blacksmith hammer resting on top, ' +
      'orange ember sparks rising around, motif placed firmly in the inner 70% of the ' +
      'square with safe margin around all sides, deep red and dark stone forge ' +
      'background filling the entire frame to the edges, warm torch glow at edges, ' +
      COMMON,
  },
];

async function fetchPixellab(prompt: string, size: number): Promise<Buffer | null> {
  // Pixellab pixflux max 256 → 큰 사이즈는 sharp로 upscale(nearest neighbor — 픽셀 보존).
  const pxSize = Math.min(256, size);
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch('https://api.pixellab.ai/v1/generate-image-pixflux', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
        body: JSON.stringify({
          description: prompt,
          image_size: { width: pxSize, height: pxSize },
          no_background: false,
        }),
      });
      if (res.status === 429) {
        const wait = 2000 * 2 ** attempt;
        console.error(`  429 → ${wait}ms 후 재시도`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      if (!res.ok) {
        console.error(`  HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
        return null;
      }
      const j = (await res.json()) as { image?: { base64?: string } };
      const b64 = j.image?.base64;
      if (!b64) {
        console.error('  no base64');
        return null;
      }
      const raw = Buffer.from(b64, 'base64');
      if (raw.length < 8 || raw[0] !== 0x89 || raw[1] !== 0x50) {
        console.error('  bad PNG');
        return null;
      }
      return raw;
    } catch (e) {
      console.error(`  예외 ${(e as Error).message} (attempt ${attempt})`);
      await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt));
    }
  }
  return null;
}

async function gen(spec: Spec): Promise<'ok' | 'skip' | 'fail'> {
  const file = join(OUT, spec.file);
  if (existsSync(file)) return 'skip';

  const raw = await fetchPixellab(spec.prompt, spec.size);
  if (!raw) return 'fail';

  // 1) 솔리드 배경 — Pixellab 출력에 alpha 있으면 강제로 짙은 베이스 위에 합성.
  //    Theme 색(#0a0a0a)에 화로 톤 살짝 가미한 짙은 적갈색(#1a0d08).
  const baseFill = { r: 26, g: 13, b: 8, alpha: 1 } as const;

  // 2) 마스커블은 padding 추가 — safe area 안에만 모티프.
  const innerSize = spec.size - (spec.padding ?? 0) * 2;
  const resized = await sharp(raw, { failOn: 'none' })
    .resize(innerSize, innerSize, { kernel: 'nearest' }) // 픽셀아트 보존
    .png()
    .toBuffer();

  const base = await sharp({
    create: { width: spec.size, height: spec.size, channels: 4, background: baseFill },
  })
    .png()
    .toBuffer();

  const composited = await sharp(base)
    .composite([{ input: resized, top: spec.padding ?? 0, left: spec.padding ?? 0 }])
    .png()
    .toBuffer();

  writeFileSync(file, composited);
  console.log(`  ✓ ${file} (${composited.length}B, ${spec.size}px${spec.padding ? ` · pad ${spec.padding}` : ''})`);
  return 'ok';
}

let ok = 0;
let skip = 0;
let fail = 0;
for (const s of SPECS) {
  const r = await gen(s);
  if (r === 'ok') ok++;
  else if (r === 'skip') skip++;
  else fail++;
  await new Promise((r) => setTimeout(r, 800));
}
console.log(`[pwa-icons] ok ${ok} · skip ${skip} · fail ${fail} / ${SPECS.length}`);
process.exit(fail > 0 ? 1 : 0);
