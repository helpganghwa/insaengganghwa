// 테스트 세트 애니메이션 — 정적 PNG(first_frame) → animate-with-text-v3 → 프레임 저장.
// 해방(강화랭킹 1~3위) 연출용 은은한 광휘 루프. 출력: public/sprites-test/anim/<key>/<i>.png + frames.json
// 사용: bun run scripts/_gen-test-anim.ts
import { config } from 'dotenv';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

config({ path: '.env.local' });
const KEY = process.env.PIXELLAB_API_KEY;
if (!KEY) {
  console.error('PIXELLAB_API_KEY 필요');
  process.exit(1);
}

const BASE = 'https://api.pixellab.ai/v2';
const FRAME_COUNT = 16; // v3 최대(부드러운 루프). 품질 우선.

// 해방 연출 원칙(docs/ITEM-SETS §7): 물체 자체는 움직이지 않는다. 오라/광휘가 생겨 맥동 +
// 이미지상 "자연스럽게 움직일 수 있는 요소만" 미세하게. 부위별 이미지를 보고 효과 선택.
// 반지는 만족 → 유지(재생성 X). 검·흉갑만 재생성: 본체 완전 고정 + 더 화려한 오라.
const ITEMS = [
  {
    key: 'kingdom_dawnguard_sword', slot: 'weapon',
    action: 'the steel sword is completely rigid and frozen, exactly identical in every single frame — no movement, no bending, no shifting, no wobble of the object itself. ONLY a lavish radiant golden aura animates: glowing light rays and swirling sparkling motes emanate and pulse outward around the blade, a brilliant divine shimmer sweeps along the steel edge, ornate holy golden glow',
  },
  {
    key: 'kingdom_dawnguard_cuirass', slot: 'armor',
    action: 'the steel breastplate is completely rigid and frozen, exactly identical in every single frame — no movement, no wobble, no shifting of the armor itself. ONLY a lavish radiant golden aura animates: the golden sun emblem on the chest glows and radiates pulsing light rays, swirling sparkling motes and a brilliant divine holy shimmer pulse outward around the armor, ornate golden glow',
  },
] as const;

const OUT = join(process.cwd(), 'public', 'sprites-test', 'anim');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function animateOne(key: string, slot: string, action: string): Promise<void> {
  const src = join(process.cwd(), 'public', 'sprites-test', slot, `${key}.png`);
  if (!existsSync(src)) {
    console.error(`✗ ${key}: 원본 PNG 없음 (${src})`);
    return;
  }
  const b64 = readFileSync(src).toString('base64');

  // 1) 비동기 잡 제출
  const sub = await fetch(`${BASE}/animate-with-text-v3`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      first_frame: { type: 'base64', base64: `data:image/png;base64,${b64}` },
      action,
      frame_count: FRAME_COUNT,
    }),
  });
  if (!sub.ok) {
    console.error(`✗ ${key}: submit HTTP ${sub.status} ${(await sub.text()).slice(0, 300)}`);
    return;
  }
  const { background_job_id: jobId } = (await sub.json()) as { background_job_id?: string };
  if (!jobId) {
    console.error(`✗ ${key}: no job id`);
    return;
  }
  console.log(`  [${key}] job ${jobId} 제출 — 폴링…`);

  // 2) 폴링 (최대 ~8분 — 화려한 액션은 더 오래 걸림)
  for (let i = 0; i < 80; i++) {
    await sleep(6000);
    const r = await fetch(`${BASE}/background-jobs/${jobId}`, {
      headers: { authorization: `Bearer ${KEY}` },
    });
    if (!r.ok) {
      console.error(`  [${key}] poll HTTP ${r.status}`);
      continue;
    }
    const j = (await r.json()) as {
      status?: string;
      last_response?: { images?: { base64?: string }[] };
    };
    if (j.status === 'failed') {
      console.error(`✗ ${key}: job failed`);
      return;
    }
    if (j.status === 'completed') {
      const imgs = j.last_response?.images ?? [];
      if (!imgs.length) {
        console.error(`✗ ${key}: completed but no images`);
        return;
      }
      const dir = join(OUT, key);
      mkdirSync(dir, { recursive: true });
      let n = 0;
      imgs.forEach((im, idx) => {
        const raw = (im.base64 ?? '').replace(/^data:image\/png;base64,/, '');
        if (!raw) return;
        writeFileSync(join(dir, `${idx}.png`), Buffer.from(raw, 'base64'));
        n++;
      });
      writeFileSync(join(dir, 'frames.json'), JSON.stringify({ count: n }));
      console.log(`✓ ${key}: ${n} 프레임 저장 (anim/${key}/)`);
      return;
    }
    console.log(`  [${key}] ${j.status}… (${(i + 1) * 6}s)`);
  }
  console.error(`✗ ${key}: 타임아웃`);
}

for (const it of ITEMS) {
  await animateOne(it.key, it.slot, it.action);
}
console.log('done');
