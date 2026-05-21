/**
 * 더미 유저 200명 생성 (테스트용).
 *
 *  - Supabase Admin API로 auth.users 200 row 생성(email/password)
 *  - public.profiles 200 row insert (한국어 자연스러운 닉네임 + 다이아 랜덤)
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

// ── 한국어 닉네임 풀(자연스러운 조합) ──
const ADJ = [
  '달빛', '잿빛', '푸른', '붉은', '고요한', '용감한', '느릿한', '재바른', '늪의',
  '산울림', '잠 못 자는', '말없는', '느긋한', '꼼꼼한', '들떠 있는', '서두르는',
  '오래 견딘', '늙은', '어린', '한가한', '단단한', '맑은', '흐릿한', '먼 길의',
  '북쪽의', '서쪽의', '동트는', '저녁의', '한밤의', '새벽의', '잿더미', '눈먼',
  '귀먼', '말 많은', '입 무거운', '발 가벼운', '손 무거운', '느린 손의', '한가위의',
];
const NOUN = [
  '대장간', '대장장이', '망치꾼', '검객', '도끼꾼', '활잡이', '창잡이', '방랑자',
  '여행자', '길손', '나무꾼', '어부', '사냥꾼', '학자', '점쟁이', '음유시인',
  '농부', '목수', '도공', '상인', '거지왕', '수도사', '기사', '용사', '전사',
  '주술사', '광부', '대공', '소공자', '말꾼', '북치는이', '청지기', '경비병',
  '척후병', '제련공', '깃대잡이', '갈대공', '뱃사공', '석공', '문지기', '약초꾼',
];
function nick(rng: () => number): string {
  const a = ADJ[Math.floor(rng() * ADJ.length)]!;
  const n = NOUN[Math.floor(rng() * NOUN.length)]!;
  // 끝에 1~3자리 숫자 — 닉네임 unique 확보
  const tag = Math.floor(rng() * 9000 + 100);
  return `${a} ${n}${tag}`;
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
      let nickname = nick(rng);
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
            nickname = nick(rng);
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
