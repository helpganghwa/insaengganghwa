import 'server-only';

import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { diamondLedger } from '@/lib/db/schema/server';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
/** db 또는 트랜잭션 핸들 — 원장은 지갑 변경과 **같은 트랜잭션**에 묶여야 정합이 맞다. */
export type LedgerDb = typeof db | Tx;

/**
 * 다이아 증감 사유(diamond_ledger.reason) — 지갑 헬퍼 호출부마다 정확히 하나.
 * 새 증감 경로를 만들면 여기에 사유를 추가한다(union이라 누락은 타입 에러).
 */
export type LedgerReason =
  // ── 유입(+) ──
  /** 우편 수령 — 일일 보급·대난투·점령전 분배·추천인·마일스톤·운영자 지급이 전부 이 경로. 우편별 내역은 mail_claim_logs. */
  | 'mail_claim'
  /** 출석 보상(완주 보너스 포함). */
  | 'checkin'
  /**
   * 캐릭터 생성 보너스(신규 가입 · 새 서버 합류).
   * ⚠ 이 경로만 walletAdd를 못 쓴다 — 지갑을 만드는 INSERT 자체라 갱신할 행이 아직 없다.
   * 그래서 server-select.ts가 recordDiamondLedger를 직접 부른다(같은 tx).
   */
  | 'signup'
  /** 도전 과제 개별 보상. */
  | 'challenge'
  /** 도전 과제 전체 완료 보너스. */
  | 'challenge_bonus'
  /** 상점 무료 수령(일일/주간/월간). */
  | 'shop_free'
  /** 결제 상품 지급 — ref=주문 id. */
  | 'iap'
  /** 배틀패스 무료 트랙 보상. */
  | 'battlepass_free'
  /** 배틀패스 프리미엄 구간 보상. */
  | 'battlepass_premium'
  /** 점령전 세금 수금 중 집행관 몫. */
  | 'guild_tax'
  /** 아바타 생성 환불(AI 거절·시스템 실패·운영자 회수). */
  | 'avatar_refund'
  /** 길드 문양 생성 환불(생성 실패·운영자 회수). */
  | 'emblem_refund'
  // ── 소모(−) ──
  /** 강화 시간 단축 — **원장 미기록**(LEDGER_SKIP_REASONS 참조). */
  | 'enhance_reduce'
  /** 레이드 개설비. */
  | 'raid_open'
  /** 레이드 추가 공격권(보석 공격 포함). */
  | 'raid_extra_attack'
  /** 상점 보급 상자 구매. */
  | 'shop_box'
  /** 닉네임 변경(첫 변경은 무료라 기록 없음). */
  | 'nickname_change'
  /** 아바타 생성 예치. */
  | 'avatar_create'
  /** 길드 결성. */
  | 'guild_create'
  /** 길드 문양 재생성. */
  | 'guild_emblem'
  /** 길드 기부. */
  | 'guild_donate'
  /** 거주지 이동 쿨타임 단축. */
  | 'residence_cooldown'
  /** 파견 보상 다이아(수령). ref=expedition id. */
  | 'expedition'
  /** 파견 미션 새로고침(무료 소진 후). */
  | 'expedition_refresh'
  /** 파견 슬롯 다이아 구매(레벨 무료 해금의 선구매). */
  | 'expedition_slot'
  /** 파견 시간 단축 — 강화 단축과 동일하게 **원장 미기록**(LEDGER_SKIP_REASONS). */
  | 'expedition_reduce'
  /** 칭호 발견 보상 수령(0191) — 칭호 화면 [모두 받기], 발견 1개당 TITLE_DISCOVERY_DIAMOND. */
  | 'title_discovery'
  /** 결제 환불에 따른 지급분 회수 — 잔액 부족 시 0까지만 회수하므로 실제 회수액만 기록. */
  | 'refund_clawback';

/**
 * 원장에서 제외하는 사유.
 *
 * 강화 시간 단축은 인당 하루 60건 규모로 다른 사유(인당 1~2건/일)와 자릿수가 다른 데다,
 * 같은 정보(누가 언제 얼마를 태워 얼마를 당겼는지)가 이미 `enhancement_logs.reduced_ms` ·
 * `gem_time_reductions`에 남는다. 중복 저장으로 원장이 부풀면 유저별 조회·사유별 집계가
 * 둘 다 느려지므로 이 경로만 건너뛴다.
 *
 * ⚠ 따라서 **원장 합계 ≠ 지갑 잔액**이다. 강화 단축 소모를 집계하려면 enhancement_logs를 봐야 한다.
 */
const LEDGER_SKIP_REASONS = new Set<LedgerReason>(['enhance_reduce', 'expedition_reduce']);

export type LedgerEntry = {
  userId: string;
  serverId: number;
  /** 지갑에 실제 반영된 값. 양수=유입, 음수=소모. */
  delta: bigint;
  reason: LedgerReason;
  /** 주문번호·우편 id·레이드 id 등 추적 키. */
  ref?: string;
};

/**
 * 원장 1행 기록 — 호출은 지갑 헬퍼(lib/game/wallet.ts) 내부에서만.
 * delta 0은 기록하지 않는다(길드 문양 첫 시도 등 무료 no-op이 원장을 오염시키지 않게).
 */
export async function recordDiamondLedger(dbx: LedgerDb, entry: LedgerEntry): Promise<void> {
  if (entry.delta === 0n) return;
  if (LEDGER_SKIP_REASONS.has(entry.reason)) return;
  await dbx.insert(diamondLedger).values({
    userId: entry.userId,
    serverId: entry.serverId,
    delta: entry.delta,
    reason: entry.reason,
    ref: entry.ref ?? null,
  });
}

/** 원장 보존 기간 — 분쟁·사고 조사에 필요한 창(반기). 이후는 삭제. */
export const LEDGER_RETENTION_DAYS = 180;

/**
 * 보존 정리 — 180일 초과분 삭제. 채팅 정리(cleanupChat)와 같은 배치+시간예산 패턴:
 * 무제한 단문 DELETE는 누적량에 비례해 statement_timeout에 걸리고, 실패→적체→다음 날
 * 더 큰 DELETE의 영구 실패 루프가 된다. 잔여는 다음 실행으로 넘긴다.
 * 실패 시 -1(크론 응답은 정상이어도 로그·수치로 드러나게).
 */
export async function cleanupDiamondLedger(): Promise<number> {
  const BATCH = 5000;
  const TIME_BUDGET_MS = 30_000;
  const t0 = Date.now();
  let total = 0;
  try {
    while (Date.now() - t0 < TIME_BUDGET_MS) {
      const r = (await db.execute(sql`
        delete from diamond_ledger where id in (
          select id from diamond_ledger
          where created_at < now() - (${LEDGER_RETENTION_DAYS} || ' days')::interval
          limit ${BATCH}
        )
      `)) as unknown as { count?: number };
      const n = r.count ?? 0;
      total += n;
      if (n < BATCH) break;
    }
    return total;
  } catch (e) {
    console.error('[ledger.cleanup] 실패', (e as Error).message);
    return -1;
  }
}
