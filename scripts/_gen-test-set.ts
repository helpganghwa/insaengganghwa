// 테스트 세트 생성 — 왕국×영웅담 "여명 근위대" 3부위. pixflux 128×128 no_background.
// 출력: public/sprites-test/<slot>/<key>.png. 세트 통일감(공유 문장·팔레트) 강조.
// 사용: bun run scripts/_gen-test-set.ts
import { config } from 'dotenv';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

config({ path: '.env.local' });
const KEY = process.env.PIXELLAB_API_KEY;
if (!KEY) {
  console.error('PIXELLAB_API_KEY 필요');
  process.exit(1);
}

// 세트 공유 앵커 — 모든 부위가 같은 세트로 보이게(팔레트·문장·각인 통일).
const SET = 'matching royal armor set, silver steel with golden trim and royal blue accents, shared royal lion-and-crown heraldry and consistent ornate engraving';
const NEG = 'no character, no scene, single inanimate game loot object on transparent background';

const ITEMS = [
  {
    key: 'kingdom_dawnguard_sword',
    slot: 'weapon',
    art: `heroic valiant triumphant noble royal kingdom fantasy longsword weapon item icon, golden cross-shaped hilt with a small royal blue banner pennant tied at the crossguard, an engraved lion-and-crown on the pommel, bright polished steel blade, ${SET}, ${NEG}`,
  },
  {
    key: 'kingdom_dawnguard_cuirass',
    slot: 'armor',
    art: `heroic valiant triumphant noble royal kingdom fantasy knight breastplate armor item icon, polished silver steel cuirass with an embossed royal lion-and-crown crest and oak-leaf engraving on the chest, small golden winged shoulder guards, ${SET}, ${NEG}`,
  },
  {
    key: 'kingdom_dawnguard_ring',
    slot: 'accessory',
    art: `heroic valiant triumphant noble royal kingdom fantasy signet ring accessory item icon, ornate golden ring set with a bright sapphire gem and an engraved royal lion-and-crown crest with a small star, soft radiant shine, ${SET}, ${NEG}`,
  },
] as const;

const OUT = join(process.cwd(), 'public', 'sprites-test');
for (const s of ['weapon', 'armor', 'accessory']) mkdirSync(join(OUT, s), { recursive: true });

for (const item of ITEMS) {
  const out = join(OUT, item.slot, `${item.key}.png`);
  if (existsSync(out)) {
    console.log(`- skip(존재): ${item.slot}/${item.key}`);
    continue;
  }
  let ok = false;
  for (let attempt = 0; attempt < 5; attempt++) {
    let res: Response;
    try {
      res = await fetch('https://api.pixellab.ai/v1/generate-image-pixflux', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
        body: JSON.stringify({ description: item.art, image_size: { width: 128, height: 128 }, no_background: true }),
      });
    } catch (e) {
      console.error(`[${item.key}] fetch error: ${String(e).slice(0, 200)}`);
      break;
    }
    if (res.status === 429) {
      const wait = 2000 * 2 ** attempt;
      console.error(`  [${item.key}] 429 → ${wait}ms 후 재시도`);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    if (!res.ok) {
      console.error(`[${item.key}] HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      break;
    }
    const b64 = ((await res.json()) as { image?: { base64?: string } }).image?.base64;
    if (!b64) {
      console.error(`[${item.key}] no base64`);
      break;
    }
    const buf = Buffer.from(b64, 'base64');
    if (buf.length < 8 || buf[0] !== 0x89 || buf[1] !== 0x50) {
      console.error(`[${item.key}] bad PNG`);
      break;
    }
    writeFileSync(out, buf);
    console.log(`✓ ${item.slot}/${item.key} (${buf.length}B)`);
    ok = true;
    break;
  }
  if (!ok) console.error(`✗ ${item.key} 실패`);
  await new Promise((r) => setTimeout(r, 800));
}
console.log('done');
