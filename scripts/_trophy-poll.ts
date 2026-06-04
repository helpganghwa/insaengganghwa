/**
 * 우승컵 테스트 캐릭터 폴링 — rotation 완성되면 south.png 다운로드.
 * bun run scripts/_trophy-poll.ts
 */
import { writeFileSync } from 'fs';

import { config } from 'dotenv';
config({ path: '.env.local' });

const PIXELLAB_BASE = 'https://api.pixellab.ai/v2';
const CHAR_ID = '6c5939cb-781c-44b2-8303-a53f86cd0230';
const OUT = '/Users/ryu/Desktop/ai/insaengganghwa/trophy-test-south.png';
const MAX_MIN = 22;

const key = process.env.PIXELLAB_API_KEY!;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const start = Date.now();
  while ((Date.now() - start) / 60000 < MAX_MIN) {
    const res = await fetch(`${PIXELLAB_BASE}/characters/${CHAR_ID}`, {
      headers: { authorization: `Bearer ${key}` },
    });
    const mins = ((Date.now() - start) / 60000).toFixed(1);
    if (!res.ok) {
      console.log(`[${mins}min] poll HTTP ${res.status}`);
      await sleep(30000);
      continue;
    }
    const char = (await res.json()) as { rotation_urls?: Record<string, string | null> };
    const urls = char.rotation_urls ?? {};
    const south = urls.south;
    // URL 존재만으론 부족 — 실제 파일이 404일 수 있어 PNG 매직+크기로 검증.
    let ok = false;
    let size = 0;
    if (typeof south === 'string' && south.length > 0) {
      const img = await fetch(south);
      if (img.ok) {
        const buf = Buffer.from(await img.arrayBuffer());
        size = buf.length;
        ok = buf.length > 1000 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
        if (ok) {
          writeFileSync(OUT, buf);
          console.log(`READY south=${OUT} bytes=${buf.length}`);
          return;
        }
      }
    }
    console.log(`[${mins}min] south not ready yet (size=${size})`);
    await sleep(45000);
  }
  console.log('TIMEOUT still generating');
}
main();
