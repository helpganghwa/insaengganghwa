import 'server-only';

import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { catalogItems, userEquipment, type Slot } from '@/lib/db/schema/equipment';
import { userSupplyBoxes, supplyOpenLogs } from '@/lib/db/schema/supply';
import { transcendLogs } from '@/lib/db/schema/transcend';
import { transcendFodderForStep } from '@/lib/game/balance';
import { logMemberAchievement } from '@/lib/game/guild/achievement';
import { logWorldEvent } from '@/lib/game/world/event';
import { sendMilestoneMail } from '@/lib/game/milestone-mail';
import { refreshEnhanceMetrics } from '@/lib/game/leaderboard/incremental';

/**
 * 보급 상자 열기 — GDD §3.4 / BALANCE §4 / SCHEMA §5.
 * 슬롯 일치 박스 → 해당 슬롯 활성 카탈로그 **균등 랜덤** 1개. 카탈로그당 1레코드:
 *  - 미보유 → 획득(+0/T0)
 *  - 보유 → transcend_progress +1 → 임계(선형 T→T+1 = T+1) 도달 시 **자동 초월**(다중 가능)
 * count 차감 + 레코드 갱신 + (자동초월 로그) + 열기 로그 = 단일 트랜잭션(CLAUDE §3.3).
 */
export type SupplyErrorCode = 'NO_BOX' | 'NO_CATALOG';
export class SupplyError extends Error {
  constructor(public code: SupplyErrorCode) {
    super(code);
    this.name = 'SupplyError';
  }
}

export type OpenResult = {
  catalogItemId: number;
  /** 도감 신규 해금(최초 획득) 여부. */
  isNew: boolean;
  /** 이번 열기로 자동 초월된 단계 수(중복일 때 0 이상). */
  transcended: number;
  /** 결과 초월 레벨. */
  transcendLevel: number;
  /** 결과 초월 진행도(다음 초월 임계 = transcendLevel+1). 게이지용. */
  transcendProgress: number;
};

function rngU32(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]!;
}

export async function openSupplyBoxes(input: {
  userId: string;
  serverId: number;
  slot: Slot;
  count?: number;
  /** 테스트용 결정적 RNG 주입(미지정 시 crypto u32). pool은 id 오름차순 고정이라 인덱스 재현 가능. */
  rng?: () => number;
}): Promise<OpenResult[]> {
  const { userId, serverId, slot } = input;
  const n = Math.max(1, Math.floor(input.count ?? 1));
  const rng = input.rng ?? rngU32;

  const opened = await db.transaction(async (tx) => {
    const [box] = await tx
      .select({ count: userSupplyBoxes.count })
      .from(userSupplyBoxes)
      .where(
        and(
          eq(userSupplyBoxes.userId, userId),
          eq(userSupplyBoxes.serverId, serverId),
          eq(userSupplyBoxes.slot, slot),
        ),
      )
      .for('update');
    if (!box || box.count < BigInt(n)) throw new SupplyError('NO_BOX');

    const pool = await tx
      .select({ id: catalogItems.id })
      .from(catalogItems)
      .where(and(eq(catalogItems.slot, slot), eq(catalogItems.active, true)))
      .orderBy(catalogItems.id); // 균등분포 불변 + 순서 고정(테스트 RNG 인덱스 재현·결과 안정).
    if (pool.length === 0) throw new SupplyError('NO_CATALOG');

    // ── N+1 제거(감사 C, 2026-08-20) — 종전엔 개봉 1개마다 잠금 조회+쓰기+로그가 돌아
    // 10연이 트랜잭션 안 32~34왕복(커밋까지 풀러 슬롯 점유)이었다. 뽑기·초월 연쇄는 순수
    // 계산이므로: ① 뽑기 전부 확정 ② 걸린 카탈로그만 IN 일괄 잠금(1) ③ JS로 뽑기 순서
    // 그대로 시뮬레이션 ④ 신규 INSERT·기존 UPDATE(VALUES 조인)·로그 2종을 다중행 1문씩.
    // 동시 개봉 경합은 위 박스 행 FOR UPDATE가 유저·슬롯 단위로 직렬화한다(신규 행 경합 불가).

    // ① 뽑기 확정 — 슬롯 내 균등(BALANCE §4.2). rng 호출 순서 유지(테스트 재현성).
    const picks: number[] = [];
    for (let i = 0; i < n; i++) picks.push(pool[rng() % pool.length]!.id);
    const uniqueIds = [...new Set(picks)];

    // ② 걸린 카탈로그의 보유 레코드만 일괄 잠금 조회.
    const existingRows = await tx
      .select({
        id: userEquipment.id,
        catalogItemId: userEquipment.catalogItemId,
        transcendLevel: userEquipment.transcendLevel,
        transcendProgress: userEquipment.transcendProgress,
        maxTranscendLevel: userEquipment.maxTranscendLevel,
      })
      .from(userEquipment)
      .where(
        and(
          eq(userEquipment.userId, userId),
          eq(userEquipment.serverId, serverId),
          sql`${userEquipment.catalogItemId} in (${sql.join(uniqueIds.map((id) => sql`${id}`), sql`, `)})`,
        ),
      )
      .for('update');

    // ③ 뽑기 순서대로 시뮬레이션 — 같은 아이템 반복 획득의 진행도·초월 연쇄를 순차 반영.
    type ItemState = {
      dbId: (typeof existingRows)[number]['id'] | null; // null=이 배치에서 신규(INSERT 후 채움)
      isNew: boolean;
      level: number;
      progress: number;
      prevMaxLevel: number; // DB의 max_transcend_level(신규는 0)
      logs: { fromT: number }[];
    };
    const states = new Map<number, ItemState>();
    for (const r of existingRows) {
      states.set(r.catalogItemId, {
        dbId: r.id,
        isNew: false,
        level: r.transcendLevel,
        progress: r.transcendProgress,
        prevMaxLevel: r.maxTranscendLevel,
        logs: [],
      });
    }

    const results: OpenResult[] = [];
    for (const catalogItemId of picks) {
      let st = states.get(catalogItemId);
      if (!st) {
        // 최초 획득 — 도감 해금(+0/T0). 같은 배치의 재획득은 아래 중복 분기로 이어진다.
        st = { dbId: null, isNew: true, level: 0, progress: 0, prevMaxLevel: 0, logs: [] };
        states.set(catalogItemId, st);
        results.push({ catalogItemId, isNew: true, transcended: 0, transcendLevel: 0, transcendProgress: 0 });
        continue;
      }
      // 중복 — 초월 진행도 +1 후 임계 도달분 자동 초월(선형 T→T+1 = T+1개).
      let transcended = 0;
      st.progress += 1;
      while (st.progress >= transcendFodderForStep(st.level + 1)) {
        st.progress -= transcendFodderForStep(st.level + 1);
        st.logs.push({ fromT: st.level });
        st.level += 1;
        transcended += 1;
      }
      results.push({
        catalogItemId,
        isNew: false,
        transcended,
        transcendLevel: st.level,
        transcendProgress: st.progress,
      });
    }

    // ④-a 신규 다중행 INSERT — 배치 내 재획득으로 진행/초월이 붙었을 수 있어 최종 상태로 삽입.
    const newStates = [...states.entries()].filter(([, s]) => s.isNew);
    if (newStates.length > 0) {
      const inserted = await tx
        .insert(userEquipment)
        .values(
          newStates.map(([catalogItemId, s]) => ({
            userId,
            serverId,
            catalogItemId,
            transcendLevel: s.level,
            transcendProgress: s.progress,
            ...(s.level > 0 ? { maxTranscendLevel: s.level, maxTranscendReachedAt: sql`now()` } : {}),
          })),
        )
        // 박스 락 직렬화로 경합은 실질 불가 — 방어적 무시(종전과 동일).
        .onConflictDoNothing()
        .returning({ id: userEquipment.id, catalogItemId: userEquipment.catalogItemId });
      for (const r of inserted) {
        const s = states.get(r.catalogItemId);
        if (s) s.dbId = r.id;
      }
    }

    // ④-b 기존 다중행 UPDATE — VALUES 조인 1문. raisedMax는 greatest/case로 행별 판정.
    const updated = [...states.entries()].filter(([, s]) => !s.isNew);
    if (updated.length > 0) {
      const valuesSql = sql.join(
        updated.map(([, s]) => sql`(${s.dbId}::bigint, ${s.progress}::int, ${s.level}::int)`),
        sql`, `,
      );
      await tx.execute(sql`
        update user_equipment ue
        set transcend_progress = v.progress,
            transcend_level = v.level,
            max_transcend_level = greatest(ue.max_transcend_level, v.level),
            max_transcend_reached_at = case
              when v.level > ue.max_transcend_level then now()
              else ue.max_transcend_reached_at
            end
        from (values ${valuesSql}) as v(id, progress, level)
        where ue.id = v.id
      `);
    }

    // ④-c 자동 초월 감사 로그 — 다중행 1문(있을 때만). dbId 미확보(이론상 conflict 스킵)는
    // 로그만 건너뛴다 — 본 상태는 위에서 반영됐고, 종전 코드도 이 경합에선 진행을 잃었다.
    const logRows = [...states.entries()].flatMap(([catalogItemId, s]) => {
      const dbId = s.dbId;
      if (dbId == null) return [];
      return s.logs.map(({ fromT }) => ({
        userId,
        serverId,
        userEquipmentId: dbId,
        catalogItemId,
        fromT,
        toT: fromT + 1,
        fodderCount: transcendFodderForStep(fromT + 1),
      }));
    });
    if (logRows.length > 0) await tx.insert(transcendLogs).values(logRows);

    // ④-d 열기 로그 — 뽑기 순서대로 다중행 1문.
    await tx.insert(supplyOpenLogs).values(
      results.map((r) => ({ userId, serverId, slot, catalogItemId: r.catalogItemId, isNew: r.isNew })),
    );

    await tx
      .update(userSupplyBoxes)
      .set({ count: sql`${userSupplyBoxes.count} - ${BigInt(n)}` })
      .where(
        and(
          eq(userSupplyBoxes.userId, userId),
          eq(userSupplyBoxes.serverId, serverId),
          eq(userSupplyBoxes.slot, slot),
        ),
      );

    return results;
  });

  // 길드/월드 업적 — **유저 개인 최고 초월 기록 갱신 시 1회**(2026-07-12 피드백).
  // 이전 방식(아이템별 색 등급 경계 11·21·31… 돌파마다 기록)은 106종이 비슷한 시기에
  // T11을 넘으며 피드가 도배됐다. 이제 "그 유저가 처음 밟는 초월 수치"만 기록:
  //  - 기준 = 전 장비 중 최고 초월(개인 기록). 11 미만은 종전처럼 침묵(일반 등급 제외).
  //  - 11부터는 +1 단위로 기록되지만 유저당 각 수치 1회뿐이라 도배 불가.
  //  - 한 번의 개봉에서 여러 단계를 뛰어도 이벤트는 1건(신기록 수치만 발표).
  try {
    const transcendedRows = opened.filter((r) => r.transcended > 0);
    if (transcendedRows.length > 0) {
      const top = transcendedRows.reduce((a, b) => (b.transcendLevel > a.transcendLevel ? b : a));
      const newMax = top.transcendLevel;
      if (newMax >= 11) {
        // 이전 개인 최고 = (이번에 안 연 장비들의 현재 최고) vs (이번에 연 장비들의 개봉 전 레벨).
        const openedIds = opened.map((r) => r.catalogItemId);
        const [row] = (await db.execute(sql`
          select coalesce(max(transcend_level), 0)::int as m
          from user_equipment
          where user_id = ${userId}::uuid and server_id = ${serverId}
            and catalog_item_id not in (${sql.join(openedIds.map((id) => sql`${id}`), sql`, `)})
        `)) as unknown as { m: number }[];
        // 이번에 연 장비의 '배치 시작 전 레벨' — 같은 장비가 한 배치에서 초월 후 재획득되면
        // 나중 행은 transcended=0이라 (transcendLevel - 0)=개봉 후 레벨이 되어 prevMax를 자기
        // 자신으로 부풀린다(신기록인데 침묵). catalog별 min(level-transcended)만 취해 방지.
        const startByCat = new Map<number, number>();
        for (const r of opened) {
          const before = r.transcendLevel - r.transcended;
          const cur = startByCat.get(r.catalogItemId);
          if (cur === undefined || before < cur) startByCat.set(r.catalogItemId, before);
        }
        const prevMax = Math.max(row?.m ?? 0, ...startByCat.values());
        if (newMax > prevMax) {
          const [ci] = (await db.execute(
            sql`select name from catalog_items where id = ${top.catalogItemId} limit 1`,
          )) as unknown as { name: string }[];
          await logMemberAchievement(userId, serverId, {
            action: 'achv_transcend',
            detail: { item: ci?.name ?? '장비', level: newMax },
          });
          await logWorldEvent(
            serverId,
            'transcend',
            { item: ci?.name ?? '장비', level: newMax },
            { actorUserId: userId },
          );
          // 이정표 보상 우편(2026-07-15) — 피드 발화와 1:1(개인 최고 갱신 게이트가 1회 보장).
          await sendMilestoneMail(userId, serverId, 'transcend', newMax);
        }
      }
    }
  } catch (e) {
    // 업적 기록 실패는 개봉 자체를 막지 않는다. 다만 이 블록엔 이정표 보상 우편이 들어 있고
    // 게이트(max_transcend_level)는 이미 갱신된 뒤라, 조용히 넘기면 보상이 영구 유실된다(2026-08-11).
    console.error(`[supply.open] 초월 업적·이정표 처리 실패 user=${userId} server=${serverId}`, e);
  }

  // 리더보드 증분 갱신(v2) — 신규 획득·자동초월이 combat을 바꾼다(트랜잭션 밖 best-effort).
  // 실패는 시간별 전체 재계산(cron)이 교정.
  try {
    await refreshEnhanceMetrics(userId, serverId);
  } catch {
    // cron 백스톱.
  }

  return opened;
}
