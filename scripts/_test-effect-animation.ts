// 최고강화자 이펙트 PoC — 기존 150 sprite + Pixellab v2 animations.
// 워크플로:
//   1) create-1-direction-object (sprite를 style_image 로 참조)
//   2) 자동 review 시 select-frames[0] 로 promote
//   3) promoted object 에 animations 요청 (animation_description)
//   4) background-job 폴링 → rgba_bytes → PNG frames
// 실행: bun run scripts/_test-effect-animation.ts
import { config } from 'dotenv';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import sharp from 'sharp';

config({ path: '.env.local' });
const KEY = process.env.PIXELLAB_API_KEY!;
const HDR = { 'content-type': 'application/json', authorization: `Bearer ${KEY}` } as const;
const BASE = 'https://api.pixellab.ai/v2';
const OUT = '/tmp/effect-poc';
mkdirSync(OUT, { recursive: true });

interface Item {
  key: string;
  slot: 'weapon' | 'armor' | 'accessory';
  spritePrompt: string;
  effect: string;
}

const ITEMS: Item[] = [
  {
    key: 'volcano_first_ember_hammer',
    slot: 'weapon',
    spritePrompt: 'fantasy weapon hammer inventory item icon, single inanimate game loot object',
    effect: 'a single large bright glowing orange molten ember at the center of the hammer head, pulsing slowly and softly brightening and dimming in place',
  },
  {
    key: 'volcano_phoenix_blade',
    slot: 'weapon',
    spritePrompt: 'fantasy weapon sword inventory item icon, single inanimate game loot object',
    effect: 'glowing red rune line down the blade fuller, slowly flowing and shimmering with warm orange light, gentle flame wisps rising softly along the blade',
  },
];

async function api(method: 'GET' | 'POST', path: string, body?: unknown) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: HDR,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`${method} ${path} ${r.status}: ${t.slice(0, 400)}`);
  }
  return r.json();
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

interface State {
  item: Item;
  objectId?: string;
  promotedId?: string;
  jobId?: string;
  done?: boolean;
  err?: string;
}

async function main() {
  const states: State[] = ITEMS.map((item) => ({ item }));

  console.log(`[1/5] create-1-direction-object × ${ITEMS.length}`);
  for (const s of states) {
    try {
      const buf = readFileSync(`public/sprites/${s.item.slot}/${s.item.key}.png`);
      const refB64 = buf.toString('base64');
      const r = (await api('POST', '/create-1-direction-object', {
        description: s.item.spritePrompt,
        style_images: [{ type: 'base64', base64: refB64 }],
      })) as { object_id: string };
      s.objectId = r.object_id;
      console.log(`  ${s.item.key} → ${s.objectId}`);
    } catch (e) {
      s.err = String(e);
      console.log(`  ${s.item.key} ✗ ${e}`);
    }
  }

  console.log(`\n[2/5] review 대기 + select-frames[0] → promote`);
  const start2 = Date.now();
  while (states.some((s) => s.objectId && !s.err && !s.promotedId)) {
    await sleep(8000);
    const el = ((Date.now() - start2) / 1000).toFixed(0);
    const sts: string[] = [];
    for (const s of states) {
      if (!s.objectId || s.err || s.promotedId) {
        sts.push(`${s.item.key.slice(0, 14)}:skip`);
        continue;
      }
      try {
        const o = (await api('GET', `/objects/${s.objectId}`)) as { status: string };
        sts.push(`${s.item.key.slice(0, 14)}:${o.status}`);
        if (o.status === 'review') {
          const sel = (await api('POST', `/objects/${s.objectId}/select-frames`, {
            indices: [0],
          })) as { created_object_ids?: string[] };
          s.promotedId = sel.created_object_ids?.[0];
          console.log(`\n  ${s.item.key} promoted → ${s.promotedId}`);
        } else if (o.status === 'failed') {
          s.err = 'object failed';
        }
      } catch (e) {
        s.err = String(e);
      }
    }
    process.stdout.write(`\r  ${el}s  ${sts.join(' ')}`);
  }
  console.log('');

  console.log(`\n[3/5] promoted object completed 대기`);
  for (const s of states) {
    if (!s.promotedId || s.err) continue;
    for (let i = 0; i < 30; i++) {
      const o = (await api('GET', `/objects/${s.promotedId}`)) as { status: string };
      if (o.status === 'completed') break;
      if (o.status === 'failed') {
        s.err = 'promoted failed';
        break;
      }
      await sleep(3000);
    }
    console.log(`  ${s.item.key} promoted ready`);
  }

  console.log(`\n[4/5] animate POST × ${ITEMS.length}`);
  for (const s of states) {
    if (!s.promotedId || s.err) continue;
    try {
      const r = (await api('POST', `/objects/${s.promotedId}/animations`, {
        direction: 'unknown',
        animation_description: s.item.effect,
        frame_count: 8,
        no_background: true,
      })) as { background_job_id?: string };
      s.jobId = r.background_job_id;
      console.log(`  ${s.item.key} job=${s.jobId}`);
    } catch (e) {
      s.err = String(e);
      console.log(`  ${s.item.key} ✗ ${e}`);
    }
  }

  console.log(`\n[5/5] background-job 폴링 + 프레임 다운로드`);
  const start5 = Date.now();
  while (states.some((s) => s.jobId && !s.err && !s.done)) {
    await sleep(6000);
    const el = ((Date.now() - start5) / 1000).toFixed(0);
    const sts: string[] = [];
    for (const s of states) {
      if (!s.jobId || s.err || s.done) {
        sts.push(`${s.item.key.slice(0, 14)}:_`);
        continue;
      }
      const j = (await api('GET', `/background-jobs/${s.jobId}`)) as {
        status: string;
        last_response?: {
          images?: Array<{ base64: string; width: number; height: number; type: string }>;
        };
      };
      sts.push(`${s.item.key.slice(0, 14)}:${j.status}`);
      if (j.status === 'completed') {
        const imgs = j.last_response?.images ?? [];
        const dir = `${OUT}/${s.item.key}`;
        mkdirSync(dir, { recursive: true });
        for (let i = 0; i < imgs.length; i++) {
          const img = imgs[i]!;
          const raw = Buffer.from(img.base64, 'base64');
          const png = await sharp(raw, {
            raw: { width: img.width, height: img.height ?? img.width, channels: 4 },
          })
            .png()
            .toBuffer();
          writeFileSync(`${dir}/frame_${i}.png`, new Uint8Array(png));
        }
        s.done = true;
        console.log(`\n  ✓ ${s.item.key} ${imgs.length} frames → ${dir}/`);
      } else if (j.status === 'failed') {
        s.err = 'job failed';
      }
    }
    process.stdout.write(`\r  ${el}s  ${sts.join(' ')}`);
  }

  console.log('\n\n===== 결과 =====');
  for (const s of states) {
    console.log(`  ${s.item.key.padEnd(28)}  ${s.done ? '✓ ' + OUT + '/' + s.item.key : '✗ ' + (s.err ?? 'unknown')}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
