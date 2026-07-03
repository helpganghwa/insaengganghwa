/**
 * 더미 유저 200명 생성 (테스트용).
 *
 *  - Supabase Admin API로 auth.users 200 row 생성(email/password)
 *  - public.profiles 200 row insert (닉네임은 '대장장이'+4자리 로컬 생성 —
 *    실유저와 동일한 한글 풀 사용, 0005 참조) + 다이아 랜덤
 *  - 각 유저 무기/방어구/장신구 각 1~3개 장비 보유(랜덤 카탈로그)
 *  - 전체 장비 강화 +0~+99 / 초월 0~10 분포(피라미드 — 대부분 낮고, 일부 고강)
 *  - user_codex 갱신(도감/챔피언 판정 정합)
 *
 * 실행: bun run scripts/seed-dummy-users.ts
 * 멱등성 X — 매 실행마다 새 200명 추가됨. 중복 방지는 닉네임 unique 제약 + email 유니크.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });
config({ path: '.env', override: false });

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DIRECT = process.env.DIRECT_URL;
if (!URL_BASE || !SERVICE || !DIRECT) {
  console.error('필요: NEXT_PUBLIC_SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY · DIRECT_URL');
  process.exit(1);
}
const COUNT = Number(process.env.DUMMY_COUNT ?? 200);

// 닉네임은 DB 함수 호출 — 실유저 가입 트리거(handle_new_user)와 동일 풀(0005).
// 공백·영문·숫자 섞임 없이 한글만, 자연스러운 동사+색상+명사 조합.
async function nick(): Promise<string> {
  const r = { name: `대장장이${Math.floor(Math.random() * 9000) + 1000}` };
  return r!.name;
}

// 시드 가능한 PRNG (mulberry32) — 실행마다 다른 결과 위해 Date.now seed.
function rngFrom(seed: number) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = rngFrom(Date.now() & 0x7fffffff);

// ── 강화/초월 분포 (피라미드 — 대부분 낮고, 일부 고강) ──
// 75% 일반(+0~+30 / T0~T2), 20% 중급(+30~+70 / T2~T6), 5% 고급(+70~+99 / T6~T10).
function rollEnhance(): { enh: number; t: number } {
  const r = rng();
  if (r < 0.75) return { enh: Math.floor(rng() * 31), t: Math.floor(rng() * 3) };
  if (r < 0.95) return { enh: 30 + Math.floor(rng() * 41), t: 2 + Math.floor(rng() * 5) };
  return { enh: 70 + Math.floor(rng() * 30), t: 6 + Math.floor(rng() * 5) };
}

// ── 메인 ──
const supa = createClient(URL_BASE, SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const db = postgres(DIRECT, { prepare: false, max: 4, idle_timeout: 10 });

try {
  // 카탈로그 슬롯별 id 풀 로드
  const catalogRows = (await db`
    select id, slot from catalog_items where active = true
  `) as unknown as { id: number; slot: 'weapon' | 'armor' | 'accessory' }[];
  const bySlot: Record<string, number[]> = { weapon: [], armor: [], accessory: [] };
  for (const r of catalogRows) bySlot[r.slot]!.push(r.id);
  console.log(
    `[catalog] weapon ${bySlot.weapon!.length} / armor ${bySlot.armor!.length} / accessory ${bySlot.accessory!.length}`,
  );

  const stamp = Date.now().toString(36);
  let ok = 0;
  let fail = 0;

  for (let i = 0; i < COUNT; i++) {
    try {
      // 1) auth.users 생성 — email 유니크 보장 위해 stamp+index
      const email = `dummy_${stamp}_${i}@insaengganghwa.local`;
      const { data: u, error: e } = await supa.auth.admin.createUser({
        email,
        password: crypto.randomUUID(),
        email_confirm: true,
        user_metadata: { dummy: true, seed_batch: stamp },
      });
      if (e || !u.user) {
        console.error(`  [${i}] auth createUser 실패: ${e?.message}`);
        fail++;
        continue;
      }
      const uid = u.user.id;

      // 2) profiles upsert — Supabase trigger가 placeholder row를 만들어 두었을 수 있어
      //    INSERT ... ON CONFLICT(id) DO UPDATE로 닉네임/다이아 덮어씀. 닉네임 unique
      //    충돌 시 재시도.
      let nickname = await nick();
      const diamond = Math.floor(rng() * 50000 + 1000);
      for (let attempt = 0; attempt < 8; attempt++) {
        try {
          await db`
            insert into profiles (id, nickname, diamond, is_adult, identity_verified_at, created_at, updated_at)
            values (
              ${uid}::uuid, ${nickname}, ${diamond}::bigint,
              true, now(), now(), now()
            )
            on conflict (id) do update set
              nickname = excluded.nickname,
              diamond = excluded.diamond,
              is_adult = excluded.is_adult,
              identity_verified_at = excluded.identity_verified_at,
              updated_at = now()
          `;
          break;
        } catch (err) {
          const msg = (err as Error).message;
          if (msg.includes('nickname') && attempt < 7) {
            nickname = await nick();
            continue;
          }
          throw err;
        }
      }

      // 3) 슬롯별 1~3 장비 + 강화/초월 + 슬롯당 1개 장착(50% 확률)
      const allInstances: { id: bigint; slot: string; cid: number; enh: number; t: number }[] = [];
      for (const slot of ['weapon', 'armor', 'accessory'] as const) {
        const count = 1 + Math.floor(rng() * 3);
        for (let k = 0; k < count; k++) {
          const cid = bySlot[slot]![Math.floor(rng() * bySlot[slot]!.length)]!;
          const { enh, t } = rollEnhance();
          const [row] = await db`
            insert into equipment_instances (user_id, catalog_item_id, enhance_level, transcend_level, equipped_slot, is_locked, acquired_at)
            values (${uid}::uuid, ${cid}, ${enh}, ${t}, null, false, now())
            returning id
          `;
          allInstances.push({ id: row!.id as bigint, slot, cid, enh, t });
        }
      }
      // 각 슬롯에서 가장 cp 높은 개체 1개 장착(없으면 첫째). bigint id → text cast.
      for (const slot of ['weapon', 'armor', 'accessory'] as const) {
        const cand = allInstances.filter((x) => x.slot === slot);
        if (cand.length === 0) continue;
        cand.sort((a, b) => b.enh - a.enh); // 강화 큰 거 우선
        const top = cand[0]!;
        await db`update equipment_instances set equipped_slot = ${slot} where id = ${String(top.id)}::bigint`;
      }

      // 4) user_codex — max_enhance_level 집계(catalog별 최대 강화)
      const codexMap = new Map<number, number>();
      for (const inst of allInstances) {
        const cur = codexMap.get(inst.cid) ?? 0;
        if (inst.enh > cur) codexMap.set(inst.cid, inst.enh);
      }
      for (const [cid, maxEnh] of codexMap) {
        await db`
          insert into user_codex (user_id, catalog_item_id, max_enhance_level, max_enhance_reached_at, first_acquired_at)
          values (${uid}::uuid, ${cid}, ${maxEnh}, now(), now())
          on conflict (user_id, catalog_item_id) do nothing
        `;
      }

      ok++;
      if ((i + 1) % 25 === 0) console.log(`  [${i + 1}/${COUNT}] ok=${ok} fail=${fail}`);
    } catch (err) {
      console.error(`  [${i}] 실패 ${(err as Error).message}`);
      fail++;
    }
  }
  console.log(`[seed-dummy] 완료 ok=${ok} fail=${fail} / ${COUNT}`);
} finally {
  await db.end();
}
