// V4 확정 17종 → Pixellab object_id 매핑 (scripts/obj-map-v4.json).
//
// gen-items.ts가 생성 당시 object_id를 저장하지 않아 사후 복구가 필요하다. 객체 목록의
// `prompt`가 우리가 보낸 buildArt(art) 그대로라, 그것으로 정확히 짝을 찾는다.
// 아이템마다 어느 키로 만들었는지가 다르므로(같은 키로만 애니 요청 가능) 키 라벨도 함께 적는다.
//
// 사용: bun run scripts/map-v4-objects.ts
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { config } from 'dotenv';

import { V4_ITEMS, buildArt } from './items-v2';

config({ path: '.env.local' });
config({ path: '.env', override: false });

const PIX = 'https://api.pixellab.ai/v2';
const KEYS: { label: 'key1' | 'key2'; token?: string }[] = [
  { label: 'key1', token: process.env.PIXELLAB_API_KEY },
  { label: 'key2', token: process.env.PIXELLAB_API_KEY_2 },
];

type ObjRow = { id: string; prompt?: string; name?: string };

/** 계정의 객체 전량 수집 — limit/offset 페이지네이션(응답이 빌 때까지). */
async function listAll(token: string): Promise<ObjRow[]> {
  const out: ObjRow[] = [];
  for (let offset = 0; offset < 5000; offset += 100) {
    const r = await fetch(`${PIX}/objects?limit=100&offset=${offset}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!r.ok) {
      console.error(`  목록 실패 HTTP ${r.status}`);
      break;
    }
    const j = (await r.json()) as { objects?: ObjRow[] };
    const rows = j.objects ?? [];
    out.push(...rows);
    if (rows.length < 100) break;
  }
  return out;
}

const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();

async function main() {
  const targets = V4_ITEMS.filter((it) => it.keeper);
  console.log(`대상 ${targets.length}종`);

  const pool: { label: string; rows: ObjRow[] }[] = [];
  for (const { label, token } of KEYS) {
    if (!token) {
      console.log(`${label}: 토큰 없음 — 건너뜀`);
      continue;
    }
    const rows = await listAll(token);
    console.log(`${label}: 객체 ${rows.length}개`);
    pool.push({ label, rows });
  }

  const map: Record<string, { key: string; objectId: string }> = {};
  const missing: string[] = [];
  for (const it of targets) {
    const want = norm(buildArt(it));
    let hit: { label: string; id: string } | null = null;
    for (const { label, rows } of pool) {
      // 프롬프트 완전 일치 우선, 없으면 앞 120자 접두 일치(꼬리 tail 차이 흡수).
      const exact = rows.find((o) => o.prompt && norm(o.prompt) === want);
      const pref = exact ?? rows.find((o) => o.prompt && norm(o.prompt).startsWith(want.slice(0, 120)));
      if (pref) {
        hit = { label, id: pref.id };
        break;
      }
    }
    if (hit) map[it.key] = { key: hit.label, objectId: hit.id };
    else missing.push(it.key);
  }

  writeFileSync(join(process.cwd(), 'scripts/obj-map-v4.json'), JSON.stringify(map, null, 2) + '\n');
  const byKey = Object.values(map).reduce<Record<string, number>>((a, v) => {
    a[v.key] = (a[v.key] ?? 0) + 1;
    return a;
  }, {});
  console.log(`\n매칭 ${Object.keys(map).length}/${targets.length} — 키별:`, byKey);
  if (missing.length) console.log('미매칭:', missing.join(', '));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
