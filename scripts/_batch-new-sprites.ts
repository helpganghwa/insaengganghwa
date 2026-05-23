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

// batch 25: accessory 세 번째 5종 (다양 모티프 — 개구리 회피)
const BATCH: Plan[] = [
  {
    slug: 'marsh_witty_slime_blob_charm',
    slot: 'accessory',
    region: '늪지대',
    tone: '위트',
    description: 'humorous quirky whimsical marsh swamp fantasy slime blob charm accessory item icon, silver chain holding a single small round cheerful green slime blob with two tiny dot eyes and a small smile, single inanimate game loot object on transparent background, no character, no figure',
  },
  {
    slug: 'orc_heroic_first_kill_tooth_ring',
    slot: 'accessory',
    region: '오크 부락',
    tone: '영웅담',
    description: 'heroic epic orcish tribal warband fantasy first kill tooth ring accessory item icon, simple dark iron band ring with a single small yellowed wolf tooth set on top, single inanimate game loot object on transparent background, no character, no figure',
  },
  {
    slug: 'rune_legendary_first_letter_amulet',
    slot: 'accessory',
    region: '고대 룬 산맥',
    tone: '전설',
    description: 'legendary mythic ancient storied mountain rune fantasy first letter amulet accessory item icon, silver chain holding a flat dark stone medallion with a single deep ancient rune letter carved at the center glowing faint blue, single inanimate game loot object on transparent background, no character, no figure',
  },
  {
    slug: 'volcano_mournful_ember_locket',
    slot: 'accessory',
    region: '서쪽 화산',
    tone: '비애',
    description: 'mournful sorrowful volcanic forge fire fantasy ember locket accessory item icon, dark blackened brass locket on a chain with a single fading orange ember inside, the locket slightly open at the seam, single inanimate game loot object on transparent background, no character, no figure',
  },
  {
    slug: 'common_grand_king_signet_ring',
    slot: 'accessory',
    region: '일반',
    tone: '장엄',
    description: 'grand majestic imposing fantasy king signet ring accessory item icon, heavy gold signet ring with a single large blue sapphire at the top engraved with a royal crown emblem, single inanimate game loot object on transparent background, no character, no figure',
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
