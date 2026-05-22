// PoC batch — 장비 5개를 특색 effect로 동시 애니메이션 큐잉.
// 워크플로: create-1-direction-object → select-frames[0] → animate (animation_description)
//          → background-jobs polling → rgba_bytes → PNG.
import { config } from 'dotenv';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import sharp from 'sharp';

config({ path: '.env.local' });
const KEY = process.env.PIXELLAB_API_KEY!;
const HDR = { 'content-type': 'application/json', authorization: `Bearer ${KEY}` } as const;
const BASE = 'https://api.pixellab.ai/v2';

const OUT = '/tmp/poc-batch';
mkdirSync(OUT, { recursive: true });

interface Item {
  key: string;
  slot: 'weapon' | 'armor' | 'accessory';
  spritePrompt: string;   // sprite 자체 묘사 (create-1-direction-object용)
  effect: string;          // effect 묘사 (animation_description용)
}

const ITEMS: Item[] = [
  {
    key: 'dragon_slayer_blade',
    slot: 'weapon',
    spritePrompt: 'fantasy weapon sword inventory item icon, single inanimate game loot object',
    effect: 'glowing molten orange embers rising from the blade with magical heat aura swirling and pulsing',
  },
  {
    key: 'lovesick_slime_dirk',
    slot: 'weapon',
    spritePrompt: 'fantasy weapon dagger inventory item icon, single inanimate game loot object',
    effect: 'thick lime green slime dripping bubbling and stretching slowly along the blade',
  },
  {
    key: 'thunder_rune_warhammer',
    slot: 'weapon',
    spritePrompt: 'fantasy weapon warhammer inventory item icon, single inanimate game loot object',
    effect: 'crackling blue lightning sparks electric arcs zapping and flashing around the stone head',
  },
  {
    key: 'fallen_choir_mantle',
    slot: 'armor',
    spritePrompt: 'fantasy armor cloth mantle inventory item icon, single inanimate game loot object',
    effect: 'pale white cloth flowing fluttering gently in a soft breeze',
  },
  {
    key: 'cinder_eye_charm',
    slot: 'accessory',
    spritePrompt: 'fantasy trinket charm pendant inventory item icon, single inanimate game loot object',
    effect: 'red ember glow pulsing and flickering from the eye stone with floating ash particles drifting upward',
  },
];

async function api(method: 'GET' | 'POST', path: string, body?: unknown) {
  const r = await fetch(`${BASE}${path}`, {
    method, headers: HDR, body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`${method} ${path} ${r.status}: ${t.slice(0, 400)}`);
  }
  return r.json();
}

async function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

interface ItemState {
  item: Item;
  objectId?: string;
  promotedId?: string;
  jobId?: string;
  done?: boolean;
  err?: string;
}

async function main() {
  const states: ItemState[] = ITEMS.map((item) => ({ item }));

  // 1) 5개 동시 create-1-direction-object
  console.log('[1/5] create-1-direction-object × 5');
  await Promise.all(states.map(async (s) => {
    try {
      const buf = readFileSync(`public/sprites/${s.item.slot}/${s.item.key}.png`);
      const refB64 = buf.toString('base64');
      const r = await api('POST', '/create-1-direction-object', {
        description: s.item.spritePrompt,
        style_images: [{ type: 'base64', base64: refB64 }],
      });
      s.objectId = r.object_id;
      console.log(`  ${s.item.key} → ${s.objectId}`);
    } catch (e) { s.err = String(e); console.log(`  ${s.item.key} ✗ ${e}`); }
  }));

  // 2) 5개 review 될 때까지 폴링
  console.log('\n[2/5] review 대기 (~4분)');
  const start2 = Date.now();
  while (states.some((s) => s.objectId && !s.err && !s.promotedId && !s.done)) {
    await sleep(8000);
    const el = ((Date.now() - start2) / 1000).toFixed(0);
    const statuses: string[] = [];
    for (const s of states) {
      if (!s.objectId || s.err || s.promotedId) { statuses.push(`${s.item.key.slice(0, 10)}:skip`); continue; }
      try {
        const o = await api('GET', `/objects/${s.objectId}`) as { status: string };
        statuses.push(`${s.item.key.slice(0, 10)}:${o.status}`);
        if (o.status === 'review') {
          // select first candidate
          const sel = await api('POST', `/objects/${s.objectId}/select-frames`, { indices: [0] }) as { created_object_ids?: string[] };
          s.promotedId = sel.created_object_ids?.[0];
          console.log(`\n  ${s.item.key} promoted → ${s.promotedId}`);
        } else if (o.status === 'failed') { s.err = 'object failed'; }
      } catch (e) { s.err = String(e); }
    }
    process.stdout.write(`\r  ${el}s  ${statuses.join(' ')}`);
  }
  console.log('');

  // 3) promoted object가 completed 될 때까지 (보통 즉시)
  console.log('\n[3/5] promoted completed 대기');
  for (const s of states) {
    if (!s.promotedId || s.err) continue;
    for (let i = 0; i < 30; i++) {
      const o = await api('GET', `/objects/${s.promotedId}`) as { status: string };
      if (o.status === 'completed') break;
      if (o.status === 'failed') { s.err = 'promoted failed'; break; }
      await sleep(3000);
    }
    console.log(`  ${s.item.key} promoted ready`);
  }

  // 4) 5개 동시 animate POST
  console.log('\n[4/5] animate POST × 5');
  await Promise.all(states.map(async (s) => {
    if (!s.promotedId || s.err) return;
    try {
      const r = await api('POST', `/objects/${s.promotedId}/animations`, {
        direction: 'unknown',
        animation_description: s.item.effect,
        frame_count: 8,
        no_background: true,
      }) as { background_job_id?: string };
      s.jobId = r.background_job_id;
      console.log(`  ${s.item.key} job=${s.jobId}`);
    } catch (e) { s.err = String(e); console.log(`  ${s.item.key} ✗ ${e}`); }
  }));

  // 5) 5개 job 완료 폴링
  console.log('\n[5/5] animation 폴링');
  const start5 = Date.now();
  while (states.some((s) => s.jobId && !s.err && !s.done)) {
    await sleep(6000);
    const el = ((Date.now() - start5) / 1000).toFixed(0);
    const sts: string[] = [];
    for (const s of states) {
      if (!s.jobId || s.err || s.done) { sts.push(`${s.item.key.slice(0, 10)}:_`); continue; }
      const j = await api('GET', `/background-jobs/${s.jobId}`) as { status: string; last_response?: { images?: Array<{ base64: string; width: number; height: number; type: string }> }; usage?: { usd?: number } };
      sts.push(`${s.item.key.slice(0, 10)}:${j.status}`);
      if (j.status === 'completed') {
        const imgs = j.last_response?.images ?? [];
        const dir = `${OUT}/${s.item.key}`;
        mkdirSync(dir, { recursive: true });
        for (let i = 0; i < imgs.length; i++) {
          const img = imgs[i]!;
          const raw = Buffer.from(img.base64, 'base64');
          const png = await sharp(raw, { raw: { width: img.width, height: img.height ?? img.width, channels: 4 } }).png().toBuffer();
          writeFileSync(`${dir}/frame_${i}.png`, new Uint8Array(png));
        }
        s.done = true;
        console.log(`\n  ✓ ${s.item.key} ${imgs.length} frames → ${dir}/`);
      } else if (j.status === 'failed') { s.err = 'job failed'; }
    }
    process.stdout.write(`\r  ${el}s  ${sts.join(' ')}`);
  }
  console.log('\n\n===== 결과 =====');
  for (const s of states) {
    console.log(`  ${s.item.key.padEnd(28)}  ${s.done ? '✓' : '✗ ' + (s.err ?? 'unknown')}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
