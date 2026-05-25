// 홈 §1 — 오늘의 보급 카드 전용 픽셀 배경 1장 생성.
// 실행: bun run scripts/gen-hub-daily-supply.ts
// 출력: public/sprites/hub/daily-supply.png (256×256, 솔리드)
//
// 모티프: 갓 도착한 보급 — 무기/방어구/장신구 3종 상자가 놓인 옆에 일출 빛.
// 톤: 따뜻한 황금 색조(아침 햇살) + 어두운 다크 베이스. mail.png(우편)·box-*.png(개별)와
// 시각 차별. "오늘 새로 받은" 정서 강조.

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
const OUT = join(process.cwd(), 'public', 'sprites', 'hub');

const COMMON =
  'dark atmospheric fantasy pixel art, no characters, centered front view, ' +
  'high detail, fully filled solid background, edge-to-edge composition, ' +
  'no transparent areas, no empty space';

const NAME = 'daily-supply';
const PROMPT =
  'medieval supply delivery scene at dawn — three wooden treasure chests of different ' +
  "sizes arranged side by side on a stone tile floor, each chest tagged with a small " +
  'metal emblem suggesting weapon/armor/jewelry contents, ' +
  'warm sunrise light pouring from upper-left casting long soft amber rays, ' +
  'a few scattered gold coins and gems glinting on the floor, ' +
  'distant fantasy market silhouette in the background, ' +
  'palette: deep brown wood, warm amber sunlight, soft golden highlights, ' +
  'rich ochre and umber filling the entire scene, ' +
  COMMON;

async function gen(name: string, prompt: string): Promise<'ok' | 'fail'> {
  const file = join(OUT, `${name}.png`);
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
        console.error(`  ${name} 429 → ${wait}ms 후 재시도`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      if (!res.ok) {
        console.error(`  ${name} HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
        return 'fail';
      }
      const j = (await res.json()) as { image?: { base64?: string } };
      const b64 = j.image?.base64;
      if (!b64) return 'fail';
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
      console.log(`  ✓ ${file} (${buf.length}B)`);
      return 'ok';
    } catch (e) {
      console.error(`  ${name} 예외 ${(e as Error).message} (attempt ${attempt})`);
      await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt));
    }
  }
  return 'fail';
}

const r = await gen(NAME, PROMPT);
console.log(`[hub-daily-supply] ${r}`);
process.exit(r === 'ok' ? 0 : 1);
