// 프로필 시스템 베이스 캐릭터 PNG 2장(남/여) 생성 — 프로토타입.
// 이후 모든 유저 프로필 생성 시 init_image 베이스로 재사용.
// 실행: bun run scripts/_gen-profile-base.ts
import { config } from 'dotenv';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

config({ path: '.env.local' });
config({ path: '.env', override: false });

const KEY = process.env.PIXELLAB_API_KEY;
if (!KEY) {
  console.error('PIXELLAB_API_KEY 필요 — .env.local');
  process.exit(1);
}
const OUT = join(process.cwd(), 'public', 'sprites', 'profile', 'base');

const COMMON =
  'plain undershirt and simple trousers, no armor, no weapon, no jewelry, ' +
  'short neutral brown hair, neutral relaxed expression, ' +
  'arms hanging naturally at sides, full body visible standing, ' +
  'clean game-ready pixel art base for character customization, ' +
  'clean outline, basic shading';

const NEG =
  'no background, no equipment, no accessories, no exaggerated pose, no weapon, no armor';

const BASES: { name: string; prompt: string }[] = [
  {
    name: 'male',
    prompt:
      'hero motif: neutral fantasy human base character standing, ' +
      'adult human male, front-facing view, ' + COMMON,
  },
  {
    name: 'female',
    prompt:
      'hero motif: neutral fantasy human base character standing, ' +
      'adult human female, front-facing view, ' + COMMON,
  },
];

async function gen(name: string, prompt: string): Promise<'ok' | 'fail'> {
  const file = join(OUT, `${name}.png`);
  for (let attempt = 0; attempt < 4; attempt++) {
    const t0 = Date.now();
    try {
      const res = await fetch('https://api.pixellab.ai/v1/generate-image-pixflux', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
        body: JSON.stringify({
          description: prompt,
          negative_description: NEG,
          image_size: { width: 128, height: 128 },
          no_background: true,
        }),
      });
      if (res.status === 429) {
        const wait = 2000 * 2 ** attempt;
        console.error(`  ${name} 429 → ${wait}ms 후 재시도`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      if (!res.ok) {
        console.error(`  ${name} HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
        return 'fail';
      }
      const j = (await res.json()) as { image?: { base64?: string }; usage?: { usd?: number } };
      const b64 = j.image?.base64;
      if (!b64) {
        console.error(`  ${name} no base64`);
        return 'fail';
      }
      const buf = Buffer.from(b64, 'base64');
      if (buf.length < 8 || buf[0] !== 0x89 || buf[1] !== 0x50) {
        console.error(`  ${name} bad PNG`);
        return 'fail';
      }
      if (existsSync(file)) {
        const bak = file.replace(/\.png$/, '.bak.png');
        writeFileSync(bak, readFileSync(file));
      }
      writeFileSync(file, buf);
      const dt = ((Date.now() - t0) / 1000).toFixed(1);
      const usd = j.usage?.usd ?? 0;
      console.log(`  ✓ ${file} (${buf.length}B · ${dt}s · $${usd})`);
      return 'ok';
    } catch (e) {
      console.error(`  ${name} 예외 ${(e as Error).message} (attempt ${attempt})`);
      await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt));
    }
  }
  return 'fail';
}

let ok = 0;
let fail = 0;
for (const b of BASES) {
  console.log(`[gen] ${b.name}`);
  const r = await gen(b.name, b.prompt);
  if (r === 'ok') ok++;
  else fail++;
  await new Promise((r) => setTimeout(r, 800));
}
console.log(`[profile-base] ok ${ok} · fail ${fail} / ${BASES.length}`);
process.exit(fail > 0 ? 1 : 0);
