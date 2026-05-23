// 이미지-우선 batch — region/tone 분포 잡고 sprite 생성 → 사용자 선별 → lore 작성.
// 5종 동시 큐 → review 대기 → 각 4 candidates 다운로드.
// (promote/animation은 사용자 검수 후 별도 단계)
import { config } from 'dotenv';
import { writeFileSync, mkdirSync } from 'node:fs';

config({ path: '.env.local' });
const KEY = process.env.PIXELLAB_API_KEY!;
const HDR = { 'content-type': 'application/json', authorization: `Bearer ${KEY}` } as const;
const BASE = 'https://api.pixellab.ai/v2';
const OUT = '/tmp/batch-new';
mkdirSync(OUT, { recursive: true });

interface Plan {
  slug: string;        // 임시 식별자(파일명·디렉터리)
  slot: 'weapon' | 'armor' | 'accessory';
  region: string;      // 카탈로그 region (한국어)
  tone: string;        // 카탈로그 tone
  description: string; // Pixellab description (영문)
}

// batch 33: 일반 region 재생성 weapon 5종 (11/14/17/24/28 자리)
const BATCH: Plan[] = [
  {
    slug: 'common_innkeeper_breadknife',
    slot: 'weapon',
    region: '일반',
    tone: '위트',
    description: 'humorous quirky cheerful fantasy innkeeper bread knife weapon item icon, simple wide kitchen bread knife with serrated edge and worn wooden handle, with a small piece of bread crumb stuck to the blade, single inanimate game loot object on transparent background, no character, no figure',
  },
  {
    slug: 'common_alchemist_potion_dagger',
    slot: 'weapon',
    region: '일반',
    tone: '기괴',
    description: 'uncanny eerie fantasy alchemist throwing potion vial dagger weapon item icon, slim glass vial with a sharp dagger blade tip, filled with bubbling green liquid and a cork stopper, single inanimate game loot object on transparent background, no character, no figure',
  },
  {
    slug: 'common_old_gentleman_cane_sword',
    slot: 'weapon',
    region: '일반',
    tone: '장엄',
    description: 'grand majestic fantasy old gentleman concealed cane sword weapon item icon, polished mahogany walking cane with a brass duck-head handle, slightly drawn revealing a thin slim sword blade inside, single inanimate game loot object on transparent background, no character, no figure',
  },
  {
    slug: 'common_fortune_teller_orb_staff',
    slot: 'weapon',
    region: '일반',
    tone: '수수께끼',
    description: 'mysterious cryptic fantasy fortune teller crystal orb staff weapon item icon, slim brass staff topped with a clear crystal ball cradled by three brass claws, with a small swirl of pale mist inside the orb, single inanimate game loot object on transparent background, no character, no figure',
  },
  {
    slug: 'common_acrobat_fan_blade',
    slot: 'weapon',
    region: '일반',
    tone: '위트',
    description: 'humorous quirky whimsical fantasy acrobat folding fan blade weapon item icon, ornate red and gold folding fan half-opened with sharp steel blades along each spoke, single inanimate game loot object on transparent background, no character, no figure',
  },
];

async function api(method: 'GET' | 'POST', path: string, body?: unknown) {
  const r = await fetch(`${BASE}${path}`, {
    method, headers: HDR, body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`${method} ${path} ${r.status}: ${(await r.text()).slice(0, 400)}`);
  return r.json();
}
async function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

interface State { plan: Plan; objectId?: string; done?: boolean; err?: string; }

async function main() {
  const states: State[] = BATCH.map((plan) => ({ plan }));

  console.log(`[1/3] create-1-direction-object × ${BATCH.length}`);
  await Promise.all(states.map(async (s) => {
    try {
      // create-1-direction-object: size는 int(64/128/...) 형식.
      // default(빈 인자)는 64 → 16 candidates. 128 → 4 candidates.
      const r = await api('POST', '/create-1-direction-object', {
        description: s.plan.description,
        size: 128,
      }) as { object_id: string };
      s.objectId = r.object_id;
      console.log(`  ${s.plan.slug} → ${s.objectId}`);
    } catch (e) { s.err = String(e); console.log(`  ${s.plan.slug} ✗ ${e}`); }
  }));

  console.log(`\n[2/3] review 대기 + candidates 다운로드 (~4분)`);
  const start = Date.now();
  while (states.some((s) => s.objectId && !s.err && !s.done)) {
    await sleep(8000);
    const el = ((Date.now() - start) / 1000).toFixed(0);
    const sts: string[] = [];
    for (const s of states) {
      if (!s.objectId || s.err || s.done) { sts.push(`${s.plan.slug.slice(0, 14)}:_`); continue; }
      try {
        const o = await api('GET', `/objects/${s.objectId}`) as { status: string; frame_urls?: string[] | null };
        sts.push(`${s.plan.slug.slice(0, 14)}:${o.status}`);
        if (o.status === 'review' && o.frame_urls?.length) {
          const dir = `${OUT}/${s.plan.slug}`;
          mkdirSync(dir, { recursive: true });
          for (let i = 0; i < o.frame_urls.length; i++) {
            const buf = Buffer.from(await (await fetch(o.frame_urls[i]!)).arrayBuffer());
            writeFileSync(`${dir}/candidate_${i}.png`, new Uint8Array(buf));
          }
          // object_id도 메타로 저장 (사용자 선택 후 select-frames에 필요)
          writeFileSync(`${dir}/_meta.json`, JSON.stringify({ object_id: s.objectId, plan: s.plan }, null, 2));
          s.done = true;
          console.log(`\n  ✓ ${s.plan.slug} ${o.frame_urls.length} candidates → ${dir}/`);
        } else if (o.status === 'failed') { s.err = 'failed'; }
      } catch (e) { s.err = String(e); }
    }
    process.stdout.write(`\r  ${el}s  ${sts.join(' ')}`);
  }
  console.log('\n\n[3/3] 결과');
  for (const s of states) {
    console.log(`  ${s.plan.slug.padEnd(22)} ${s.done ? '✓' : '✗ ' + (s.err ?? '?')}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
