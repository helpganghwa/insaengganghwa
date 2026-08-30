import 'server-only';

import { expeditionSlotsFor } from '@/lib/game/balance';

import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { CHALLENGES } from '@/lib/game/challenges/defs';
import { guildCapacity } from '@/lib/game/guild/balance';

import { TITLE_BY_CODE } from './defs';
import { TITLE_SECRETS, TITLE_SECRET_BY_CODE } from './defs.server';

/**
 * 칭호 판정 엔진 — 상태 파생(도전과제 status.ts 철학, TITLES.md §2).
 *
 * 구조:
 *  - 지표 수집: 유저의 게임 상태를 병렬 SQL 몇 번으로 지표 객체로 만든다.
 *  - 규칙 평가: 각 칭호 code → 지표 술어. "지금 조건을 만족하는가"(activeNow)를 낸다.
 *  - 발견 기록: activeNow인 칭호를 user_titles 원장에 멱등 insert(최초 발견).
 *    조건부 칭호의 "활성"은 저장하지 않는다 — 대표 표시 시점에 재평가(§3.5).
 *
 * 아직 판정 불가한 코드(랭킹 스냅샷·순간 포착·이력 부재 등)는 PENDING_CODES로 명시한다 —
 * 조용히 빠뜨리지 않고, 구현이 붙는 순서대로 이 목록에서 제거한다.
 */

const KST = `at time zone 'Asia/Seoul'`;

export { PENDING_CODES, EVENT_HOOK_CODES } from './pending';
import { PENDING_CODES } from './pending';

/**
 * 이 칭호를 목록·분모에서 감출지 — 판정이 없는데 아직 보유하지도 않은 것.
 *
 * PENDING은 "못 얻는 것"인데 목록에선 "아직 못 얻은 것"과 구별되지 않는다(조건 비공개가 원칙이라
 * 둘 다 조건이 가려진 채 이름만 보인다). 그 상태로 분모에 들어가 있어 발견 게이지가 최대
 * 330/356(92.7%)에서 멈췄다 — 채울 수 없는 완성도 표시라 없는 조건을 파게 된다.
 *
 * 보유분은 감추지 않는다 — 이벤트 훅 지급 등으로 이미 보유한 칭호를 감추면 **보유한 칭호가
 * 목록에서 사라진다**. 판정이 생기면 PENDING에서 빠지고 그대로 목록에 나타난다.
 */
export function isHiddenPendingTitle(code: string, owned: boolean): boolean {
  return !owned && PENDING_CODES.has(code);
}

/**
 * 이 유저에게 보이는 칭호 총수(= 발견 게이지의 분모).
 * 판정 가능한 것 전부 + 보유한 PENDING. 유저마다 다를 수 있지만 **항상 도달 가능한** 값이다.
 */
export function visibleTitleTotal(ownedPendingCount: number): number {
  return TITLE_BY_CODE.size - PENDING_CODES.size + ownedPendingCount;
}

type Metrics = Record<string, number>;

const CATALOG_KEY_BY_ID = new Map<number, string>(); // catalog_items.id → key (지연 로드)
let catalogLoadedAt = 0;
const CATALOG_TTL_MS = 10 * 60_000; // 무기 교체 등 런타임 카탈로그 변경이 영영 안 보이지 않게(감사 L6)

async function loadCatalogIds(): Promise<void> {
  if (CATALOG_KEY_BY_ID.size && Date.now() - catalogLoadedAt < CATALOG_TTL_MS) return;
  const rows = (await db.execute(sql`select id, code from catalog_items`)) as unknown as { id: number; code: string }[];
  CATALOG_KEY_BY_ID.clear();
  for (const r of rows) CATALOG_KEY_BY_ID.set(Number(r.id), r.code);
  catalogLoadedAt = Date.now();
}

/** 장착 상태 — key → enhance_level (장착 슬롯에 있는 것만). */
async function equippedMap(userId: string, serverId: number): Promise<Map<string, number>> {
  await loadCatalogIds();
  const rows = (await db.execute(sql`
    select catalog_item_id, enhance_level from user_equipment
    where user_id=${userId}::uuid and server_id=${serverId} and equipped_slot is not null
  `)) as unknown as { catalog_item_id: number; enhance_level: number }[];
  const m = new Map<string, number>();
  for (const r of rows) {
    const key = CATALOG_KEY_BY_ID.get(Number(r.catalog_item_id));
    if (key) m.set(key, Number(r.enhance_level));
  }
  return m;
}

/** 지표 수집 — 병렬 소수 왕복. 없는 값은 0. */

/**
 * 지표 쿼리 결과가 제자리에 왔는지 확인 — 대표 컬럼 유무만 본다.
 *
 * collectMetrics는 27개 쿼리를 **위치로** 구조분해한다. 중간에 하나를 끼워 넣고 이름을 끝에
 * 붙이면 그 뒤가 전부 밀리는데, 잘못 온 결과에는 그 컬럼이 없어서 n()이 0을 돌려주고
 * 판정이 **조용히** 틀린다(랭킹 1위인데 비활성, 다이아 90만인데 '빈털터리' 활성).
 * 여기서 큰 소리로 깨뜨려 배포 전에 잡는다.
 */
function assertMetricShape(r: { ranks: unknown; wallet: unknown; misc: unknown; levels: unknown }): void {
  const first = (v: unknown): Record<string, unknown> => ((v as unknown[])[0] ?? {}) as Record<string, unknown>;
  const bad: string[] = [];
  // ranks는 행이 없을 수 있다(랭킹 미등재) — 있을 때만 모양을 본다.
  const rk = first(r.ranks);
  if (Object.keys(rk).length && !('metric' in rk)) bad.push('ranks');
  if (!('dia' in first(r.wallet))) bad.push('wallet');
  if (!('days' in first(r.misc))) bad.push('misc');
  if (!('codex' in first(r.levels))) bad.push('levels');
  if (bad.length) {
    throw new Error(`[titles] 지표 자리 어긋남: ${bad.join(', ')} — collectMetrics 구조분해 순서가 쿼리 배열과 다르다`);
  }
}

/**
 * 배열 순서를 유지한 채 동시 실행 수 제한 — 지표 27쿼리가 풀(max 8)을 독식해 다른 요청을
 * 굶기지 않게(감사 M6). 5개 웨이브로 흘리면 칭호 판정 총 소요는 비슷하고 풀 점유는 5/8로 준다.
 */
async function runLimited<T>(thunks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const out = new Array<T>(thunks.length);
  let next = 0;
  let failed = false; // 한 쿼리 실패 시 나머지 워커도 중단 — 실패한 판정에 풀 점유 낭비 방지
  await Promise.all(
    Array.from({ length: Math.min(limit, thunks.length) }, async () => {
      while (!failed && next < thunks.length) {
        const idx = next++;
        try {
          out[idx] = await thunks[idx]!();
        } catch (e) {
          failed = true;
          throw e;
        }
      }
    }),
  );
  return out;
}

async function collectMetrics(userId: string, serverId: number): Promise<Metrics> {
  const u = sql`${userId}::uuid`;
  const s = sql`${serverId}`;

  // ⚠ 이름 순서는 아래 배열 **순서와 1:1**이다. 중간에 쿼리를 끼워 넣고 이름을 끝에 붙이면
  //   그 뒤 전부가 밀려 엉뚱한 결과를 읽는다 — 2026-08-19에 lg·gh·f3가 그렇게 어긋나
  //   순위·다이아·길드·채팅·스트릭 지표가 통째로 오판정됐다(랭킹 1위인데 칭호 비활성,
  //   다이아 90만인데 '빈털터리' 활성). 아래 assertMetricShape가 재발을 잡는다.
  const [enh, streaks, levels, supply, transcend, daily, social, money, lg, gh, f3, melee, raid, avatar, misc, ranks, wallet, guildx, chatx, social2, streak2, enh3, flawless, supply3, melee3, cross3, conquest, exped] = await runLimited([
    // 강화 로그 집계
    () => db.execute(sql`
      select count(*)::int as total,
             count(*) filter (where result in ('success','mega'))::int as ok,
             count(*) filter (where result='mega')::int as mega,
             count(*) filter (where result='down')::int as down,
             count(*) filter (where result='down' and from_level % 10 = 9)::int as down9,
             count(*) filter (where result='down' and from_level = 199)::int as cliff,
             count(*) filter (where result='mega' and to_level = 100)::int as crown,
             count(*) filter (where extract(hour from created_at ${sql.raw(KST)}) between 3 and 4)::int as owl,
             count(*) filter (where extract(hour from created_at ${sql.raw(KST)}) between 5 and 6)::int as early,
             count(*) filter (where extract(isodow from created_at ${sql.raw(KST)}) in (6,7))::int as weekend,
             count(*) filter (where extract(isodow from created_at ${sql.raw(KST)})=5 and extract(hour from created_at ${sql.raw(KST)}) >= 20)::int as friday,
             count(*) filter (where extract(isodow from created_at ${sql.raw(KST)})=1 and result='down')::int as monday_down,
             count(*) filter (where extract(hour from created_at ${sql.raw(KST)}) between 18 and 20)::int as evening,
             -- 실대기 5분 이내(자연 단시간 + 보석 단축 포함) — cond "대기 5분 이내의 강화"와 1:1(감사 H3)
             count(*) filter (where elapsed_ms <= 300000)::int as five_min_cnt,
             -- 만기 후 방치 수령(0166 overdue_ms) — 컬럼 도입(2026-08-21) 이후 수령분만 집계(과거 행은 null)
             count(*) filter (where overdue_ms >= 86400000)::int as aging_cnt,
             count(*) filter (where overdue_ms >= 604800000)::int as carefree_cnt
      from enhancement_logs where user_id=${u} and server_id=${s}
    `),
    // 연속(스트릭) — gaps & islands. 결과별 최장 연속 + 하락 직후 성공 연속.
    () => db.execute(sql`
      with seq as (
        select result, row_number() over (order by id) rn,
               lag(result) over (order by id) prev,
               row_number() over (partition by result order by id) rk
        from enhancement_logs where user_id=${u} and server_id=${s}
      ), grp as (
        select result, rn - rk as g from seq
      ), runs as (
        select result, count(*)::int len from grp group by result, g
      )
      select coalesce(max(len) filter (where result in ('success','mega')),0)::int as win_run,
             coalesce(max(len) filter (where result='down'),0)::int as down_run,
             coalesce(max(len) filter (where result='hold'),0)::int as hold_run,
             coalesce(max(len) filter (where result='mega'),0)::int as mega_run
      from runs
    `),
    // 장비 레벨·초월·도감·장비별 특수
    () => db.execute(sql`
      select coalesce(max(max_enhance_level),0)::int as max_lv,
             coalesce(max(max_transcend_level),0)::int as max_t,
             -- 도감 분자는 **활성 카탈로그만** — catalog_total(where active)·/me 게이지와 분모/분자
             -- 기준 통일(적대 검수 3: 무기 교체로 퇴역 아이템 보유자가 "전부 수집"을 조기 성립).
             count(distinct catalog_item_id) filter (where exists(
               select 1 from catalog_items ci where ci.id=catalog_item_id and ci.active))::int as codex,
             count(*) filter (where max_enhance_level >= 100)::int as lv100_cnt,
             coalesce(max(case when max_enhance_level >= 100 then 1 else 0 end),0)::int as has100
      from user_equipment where user_id=${u} and server_id=${s}
    `),
    // 보급
    () => db.execute(sql`
      select count(*)::int as total,
             coalesce(max(cnt),0)::int as day_max,
             count(*) filter (where extract(hour from created_at ${sql.raw(KST)}) < 9)::int as morning,
             count(*) filter (where extract(hour from created_at ${sql.raw(KST)}) < 2)::int as midnight
      from (
        select created_at,
               count(*) over (partition by date(created_at ${sql.raw(KST)})) cnt
        from supply_open_logs where user_id=${u} and server_id=${s}
      ) t
    `),
    // 초월
    () => db.execute(sql`
      select count(*)::int as total, coalesce(max(cnt),0)::int as day_max
      from (select count(*) cnt from transcend_logs where user_id=${u} and server_id=${s}
            group by date(created_at ${sql.raw(KST)})) d
    `),
    // 출석·우편
    () => db.execute(sql`
      select coalesce((select total_claimed_count from user_checkin_state where user_id=${u} and server_id=${s}),0)::int as checkin,
             (select count(*)::int from mail_claim_logs where user_id=${u} and server_id=${s}) as mail,
             coalesce((select max(cnt) from (select count(*) cnt from mail_claim_logs where user_id=${u} and server_id=${s} group by date(claimed_at ${sql.raw(KST)})) d),0)::int as mail_day,
             -- fast_claim은 수령 시점 박제(0171) — 우편 30일 삭제로 join이 끊겨도 진행도 보존
             -- + 서버 필터(둘 다 2026-08-25 칭호 감사 발견 1).
             (select count(*)::int from mail_claim_logs
               where user_id=${u} and server_id=${s} and fast_claim) as mail_fast
    `),
    // 소셜
    () => db.execute(sql`
      select (select count(*)::int from friend_links where status='accepted' and server_id=${s}
                and (requester_id=${u} or addressee_id=${u})) as friends,
             -- CBT 초대 실적 합산(2026-08-07 확정) — 컷오버는 referral_attributions를 이월하지
             -- 않지만(보상만 우편 재지급), 초대는 진행도가 아닌 '전파 기여'라 칭호 실적으로 인정.
             -- 단순 카운트 칭호(invite_1/5/20/50)만 해당 — 조건부(ref_50/100/champ/over)는
             -- 초대받은 유저의 정식 서버 진행도 기준이라 합산하지 않는다(설계 의도).
             (select count(*)::int from referral_attributions where referrer_user_id=${u})
               + coalesce((select invite_count from cbt_carryover where user_id=${u}), 0) as invites
    `),
    // 결제·시간 단축 — 결제(iap_orders)는 서버 무관 **계정 단위**가 의도(결제 테이블에 server_id
    // 없음). pay_*·top_patron 조건 문구도 서버를 언급하지 않는다(감사 M4에서 문구 쪽을 정렬).
    // 환불 제외(2026-08-22 사용자 확정) — 결제→환불 반복으로 실비용 0에 후원 칭호·결제
    // 랭킹을 만드는 어뷰징 차단. 기획득 영구 칭호는 원장 원칙상 잔존(어뷰저는 운영 제재).
    () => db.execute(sql`
      select coalesce((select sum(amount_krw)::bigint from iap_orders where user_id=${u} and status = 'paid'),0) as pay_sum,
             (select count(*)::int from iap_orders where user_id=${u} and status = 'paid') as pay_cnt,
             coalesce((select sum(reduced_ms)::bigint from gem_time_reductions where user_id=${u} and server_id=${s}),0) as reduced_ms
    `),
    /**
     * 다이아 이력 — diamond_ledger(0159) 도입으로 판정이 가능해진 재화 계열(2026-08-12).
     *
     * ⚠ 소비 합계는 **원장만으로는 틀린다**. 강화 시간단축(enhance_reduce)은 하루 60건 규모라
     * 의도적으로 원장에서 빠져 있고(ledger.ts LEDGER_SKIP_REASONS) 같은 정보가
     * gem_time_reductions에 남는다 — 두 소스를 합쳐야 실제 소비액이 된다.
     *
     * 무료 수급은 유료 유입(iap·유료 패스 보상)과 **환불 반환**을 뺀 것. 환불은 되돌려받은
     * 것이지 새로 수급한 게 아니라 '티끌 모아 태산'의 취지에 맞지 않는다.
     *
     * ⚠ 소비 쪽에서도 refund_clawback(결제 환불 시 지급분 회수)을 뺀다. 이건 유저가 쓴 게 아니라
     * 우리가 되가져간 것이다. 빼지 않으면 "10만원 패키지 결제 후 환불"만으로 실소비 0인 계정에
     * 올인(하루 10만 소비)이 붙는다 — 실제로 스테이징 테스트 계정의 일일 최대 소비 11,100이
     * 전액 이 회수분이었다(2026-08-12 재검증에서 발견).
     *
     * ⚠ 아직 원장에 안 남는 지출이 하나 더 있다 — 닉네임 변경(첫 변경 무료, 이후 300💎)이
     * 지갑 헬퍼를 거치지 않고 raw UPDATE로 깎는다. 그만큼 소비가 과소 집계된다(별건으로 남김).
     *
     * from 절 없이 스칼라 서브쿼리만 쓴다 — 원장 행이 0인 신규 유저도 한 행을 돌려받아야 한다.
     */
    () => db.execute(sql`
      -- 현 캐릭터 생성 이후로 한정(2026-08-13) — diamond_ledger는 탈퇴 후에도 보존되는 결제
      -- 감사 원장이라(withdraw.ts WITHDRAW_PRESERVED), 스코프 없이는 탈퇴·재가입 유저가
      -- 전생 획득으로 백만장자를 즉시 재발견한다. '재가입=새 시작' 원칙에 맞춘다.
      with birth as (
        select coalesce((select created_at from characters
          where user_id=${u} and server_id=${s}), '-infinity'::timestamptz) as t0
      )
      select
        -- 환불 반환(avatar_refund·emblem_refund)은 '획득'이 아니다 — 아바타 생성→거절 루프로
        -- 누적 획득을 부풀릴 수 있어 dia_free와 같은 기준으로 뺀다.
        coalesce((select sum(delta) from diamond_ledger where user_id=${u} and server_id=${s} and delta > 0
                    and reason not in ('avatar_refund','emblem_refund')
                    and created_at >= (select t0 from birth)),0)::bigint as dia_gained,
        coalesce((select sum(delta) from diamond_ledger where user_id=${u} and server_id=${s} and delta > 0
                    and reason not in ('iap','battlepass_premium','avatar_refund','emblem_refund')
                    and created_at >= (select t0 from birth)),0)::bigint as dia_free,
        coalesce((select max(t) from (
          select sum(v) as t from (
            select (created_at ${sql.raw(KST)})::date as d, -delta as v
              from diamond_ledger where user_id=${u} and server_id=${s} and delta < 0
                and reason <> 'refund_clawback'
                and created_at >= (select t0 from birth)
            union all
            select (created_at ${sql.raw(KST)})::date, gems_spent
              from gem_time_reductions where user_id=${u} and server_id=${s}
            union all
            -- 예치 환불(아바타 생성 거절·문양 실패)은 같은 날의 예치 지출을 상쇄한다 — 안 빼면
            -- 하루 10건 거절만으로 실소비 0인 계정에 큰손(1만 소비)이 선다(2026-08-12 재재검증).
            -- 잔여 오차: 환불이 자정을 넘거나(생성 ~8분이라 하루 최대 1건) 운영자가 며칠 뒤
            -- 환불하면 지출일이 상쇄 없이 남는다. 전자는 최대 1건(≤1,500)이라 단독으로 임계에
            -- 못 미치고, 후자는 운영자 개입이 전제라 허용한다. 상쇄만 있는 날은 합이 음수가
            -- 되는데 max가 무시하므로 무해하다.
            select (created_at ${sql.raw(KST)})::date, -delta
              from diamond_ledger where user_id=${u} and server_id=${s} and delta > 0
                and reason in ('avatar_refund','emblem_refund')
                and created_at >= (select t0 from birth)
          ) x group by d) y),0)::bigint as spend_day_max,
        -- 10일 창 **최저 잔액** 복원(자린고비, 2026-08-21 문구 개정 "지출 있어도 유지 인정") —
        -- 어느 시점의 잔액 = 현재 잔액 − (그 시점 이후 델타 합). 창 내 최저 잔액 = 현재 −
        -- max(최근 k건 델타 누적합, k=1..N). k=0(변동 없음 = 현재 잔액)은 TS에서 max(…, 0).
        -- 원장(0159)은 enhance_reduce를 기록하지 않으므로(LEDGER_SKIP_REASONS) 그 지출은
        -- gem_time_reductions에서 음수 델타로 합류시켜야 등식이 성립한다 — 빼먹으면 복원
        -- 잔액이 실제보다 낮아져 단축을 쓰는 유저가 구조적으로 오탈락한다(적대 검수 3).
        coalesce((select max(w.s) from (
          select sum(delta) over (order by created_at desc, seq desc
            rows between unbounded preceding and current row) as s
          from (
            select delta, created_at, id as seq from diamond_ledger
              where user_id=${u} and server_id=${s} and created_at >= now() - interval '10 days'
            union all
            select -gems_spent, created_at, id from gem_time_reductions
              where user_id=${u} and server_id=${s} and created_at >= now() - interval '10 days'
          ) ev
        ) w),0)::bigint as led_peak10
    `),
    /** 길드 이력 — guild_audit_log의 join/leave는 actor_user_id 기준(가입·탈퇴 주체). */
    () => db.execute(sql`
      select
        (exists(
          select 1 from guild_audit_log l
          join guild_audit_log j on j.guild_id = l.guild_id and j.actor_user_id = l.actor_user_id
            and j.action = 'join' and j.created_at > l.created_at
          where l.action = 'leave' and l.actor_user_id = ${u} and l.server_id = ${s}
        ))::int as homecoming,
        -- 마지막 이탈 시각 = 자진 탈퇴·추방(guild_leave_log) ∪ 해산 여파(audit disband, target=me)의
        -- 최댓값. leave_log 하나로는 안 된다 — audit의 'leave'는 actor 기준이라 추방·해산 피해자가
        -- 빠지고(2026-08-12 재검증), leave_log는 추방까지는 담지만 **해산 멤버는 CASCADE로 지워져
        -- 어디에도 없었다**(재재검증에서 발견 → disband.ts가 멤버별 audit 행을 남기도록 보강).
        -- 해산 멤버를 leave_log에 넣는 선택은 안 된다 — 그 테이블은 24h 재가입 잠금의 근거다.
        coalesce(extract(epoch from (now() - greatest(
          (select max(left_at) from guild_leave_log where user_id = ${u} and server_id = ${s}),
          (select max(created_at) from guild_audit_log
             where target_user_id = ${u} and server_id = ${s} and action = 'disband')
        ))) / 86400, -1)::float as since_leave,
        -- 골목대장 — 내 거주 구역 주민 중 전투력 1위인 동안. 거주지가 없으면 대상 아님.
        (exists(
          select 1 from characters me
          where me.user_id = ${u} and me.server_id = ${s} and me.residence_zone_id is not null
            and exists(select 1 from leaderboard_ranks lm
                       where lm.user_id = me.user_id and lm.server_id = ${s} and lm.metric = 'combat')
            and not exists(
              select 1 from characters c2
              join leaderboard_ranks l2 on l2.user_id = c2.user_id and l2.server_id = ${s} and l2.metric = 'combat'
              where c2.server_id = ${s} and c2.residence_zone_id = me.residence_zone_id
                and l2.value > (select value from leaderboard_ranks
                                where user_id = me.user_id and server_id = ${s} and metric = 'combat'))
        ))::int as alley_boss
    `),
    /** 다윗(대난투 하위 CP로 3위 이내)·철인 3종(하루에 레이드·대난투·점령전 모두). */
    () => db.execute(sql`
      select
        (exists(
          select 1 from melee_participants p
          -- revealed 필터 — computed 단계(23:00~24:00/09~10시) 결과 유출 방지(감사 2026-08-25 발견 5).
          join melee_battles b on b.id = p.battle_id and b.server_id = ${s} and b.status = 'revealed'
          where p.user_id = ${u} and p.final_rank <= 3
            and (select count(*) from melee_participants q
                   where q.battle_id = p.battle_id and q.cp_snapshot < p.cp_snapshot) * 2
                < (select count(*) from melee_participants r where r.battle_id = p.battle_id)
        ))::int as david,
        -- 철인 3종 — "참여" 정의를 다른 판정과 통일(감사 L4): 레이드=실제 공격일(r_joins과 동일 원천),
        -- 점령전=전투가 성립한 배치(무공격 배치 제외 — 점령전 4차 판정 블록과 동일 원칙).
        (exists(
          select 1 from (
            select (ra.created_at ${sql.raw(KST)})::date as d
              from raid_attacks ra join raids r on r.id = ra.raid_id and r.server_id = ${s}
              where ra.user_id = ${u}
            intersect
            select b.battle_date from melee_participants mp
              join melee_battles b on b.id = mp.battle_id and b.server_id = ${s}
              where mp.user_id = ${u}
            intersect
            select gd.battle_kst_day from guild_battle_deployments gd
              join conquest_battles cb on cb.zone_id = gd.zone_id
                and cb.battle_kst_day = gd.battle_kst_day and cb.published_at is not null
              where gd.user_id = ${u} and gd.server_id = ${s}
          ) t
        ))::int as triathlon
    `),
    // 대난투
    () => db.execute(sql`
      with p as (
        select mp.final_rank, mb.participant_count, mb.battle_date,
               row_number() over (order by mb.battle_date) as nth
        from melee_participants mp join melee_battles mb on mb.id=mp.battle_id
        where mp.user_id=${u} and mb.server_id=${s} and mb.status='revealed'
      )
      select count(*)::int as joins,
             count(*) filter (where final_rank=1)::int as wins,
             count(*) filter (where final_rank=2)::int as second,
             count(*) filter (where final_rank<=3)::int as podium,
             count(*) filter (where final_rank <= greatest(1, (participant_count+9)/10))::int as top10,
             count(*) filter (where final_rank=participant_count)::int as last_place,
             count(*) filter (where final_rank=participant_count-1)::int as second_last,
             count(*) filter (where final_rank=1 and nth<=10)::int as comet,
             coalesce((select count(*) from (
               select battle_date, lag(battle_date) over (order by battle_date) prev
               from p where final_rank=1) w
               where prev is not null and battle_date - prev > 7),0)::int as win_gap7
      from p
    `),
    // 레이드
    () => db.execute(sql`
      select count(distinct ra.raid_id)::int as joins,
             coalesce(max(ra.damage),0)::bigint as max_dmg,
             -- 선봉장 = 그 레이드의 **전체 최초** 공격이 나인 레이드 수. ra.seq는 "내 n번째 공격"이라
             -- seq=1은 참여 수와 동치였다(감사 H4) — 레이드별 최초 공격자(min id)로 판정한다.
             (select count(*)::int from raids r2
                join lateral (select a.user_id from raid_attacks a where a.raid_id=r2.id
                              order by a.id limit 1) fa on true
                where r2.server_id=${s} and fa.user_id=${u}) as vanguard,
             count(*) filter (where extract(hour from ra.created_at ${sql.raw(KST)}) < 6)::int as night,
             count(distinct ra.raid_id) filter (where r.boss_code='dragon_west')::int as r_volcano,
             count(distinct ra.raid_id) filter (where r.boss_code='slime_king')::int as r_swamp,
             count(distinct ra.raid_id) filter (where r.boss_code='orc_chief')::int as r_orc,
             count(distinct ra.raid_id) filter (where r.boss_code='fallen_angel')::int as r_fallen,
             count(distinct ra.raid_id) filter (where r.boss_code='stone_golem')::int as r_temple,
             count(distinct ra.raid_id) filter (where r.boss_code='gold_griffin')::int as r_kingdom
      from raid_attacks ra join raids r on r.id=ra.raid_id
      where ra.user_id=${u} and r.server_id=${s}
    `),
    // 아바타 — "생성 N회" 계열은 **누적 이력**(profile_generation_jobs, 수락분) 기준.
    // 종전 user_profiles(현재 보유) 기준은 ① cond("생성")와 불일치 ② 삭제 시 카운트 후퇴
    // ③ 보유 캡 98과 충돌해 rebirth(100)·avatar_1000이 영구 불가였다(2026-08-21 사용자 지적).
    // 보유 기준 칭호(avatar_50 "50개 보유")만 owned로 분리.
    () => db.execute(sql`
      select (select count(*)::int from profile_generation_jobs
               where user_id=${u} and server_id=${s} and status='accepted') as cnt,
             (select count(distinct options->>'gender')::int from profile_generation_jobs
               where user_id=${u} and server_id=${s} and status='accepted') as genders,
             coalesce((select max(c) from (select count(*) c from profile_generation_jobs
               where user_id=${u} and server_id=${s} and status='accepted'
               group by equipment_snapshot::text) t),0)::int as combo_max,
             (select count(distinct equipment_snapshot::text)::int from profile_generation_jobs
               where user_id=${u} and server_id=${s} and status='accepted') as combos,
             (select count(*)::int from user_profiles
               where user_id=${u} and server_id=${s}
                 and coalesce((options->>'isDefault')::boolean,false) is false) as owned,
             -- 입문식 — "가입 3일 안에"는 **이력** 판정(감사 2026-08-25 발견 3: 현재 경과일 게이트는
             -- 4일차 이후 첫 칭호 화면 진입 시 영구 미발견). 수락(지급)된 잡의 생성 시각 기준.
             (select exists(select 1 from profile_generation_jobs j
                where j.user_id=${u} and j.server_id=${s} and j.user_profile_id is not null
                  and j.created_at <= (select p.created_at from profiles p where p.id=${u}::uuid) + interval '3 days'))::int as first3
    `),
    // 기타 — 가입 경과·도전과제·해방
    () => db.execute(sql`
      select coalesce(extract(day from now() - (select created_at from characters where user_id=${u} and server_id=${s}))::int,0) as days,
             (select count(*)::int from challenge_claims where user_id=${u} and server_id=${s}) as challenge_claims,
             (select count(*)::int from codex_champions where user_id=${u} and server_id=${s} and rank<=3) as liberated,
             (select count(*)::int from codex_champions where user_id=${u} and server_id=${s} and rank=1) as champions,
             (select count(*)::int from codex_champions cc join catalog_items ci on ci.id=cc.catalog_item_id
               where cc.user_id=${u} and cc.server_id=${s} and cc.rank<=3 and ci.slot='weapon') as lib_weapons,
             -- +100 "최초 도달" 시각은 enhancement_logs가 정본 — max_enhance_reached_at은 신기록마다
             -- 갱신되는 파생값이라 blitz 영구 미획득·late_bloomer 오활성을 냈다(감사 2026-08-25 발견 2).
             (select coalesce(extract(epoch from (select min(created_at) from enhancement_logs
               where user_id=${u} and server_id=${s} and to_level>=100)
               - (select created_at from characters where user_id=${u} and server_id=${s}))/86400,999))::int as first100_days,
             (select count(*)::int from catalog_items where active) as catalog_total,
             -- 거주·아바타·기부·집행관 이력(0166) — 캐릭터 행 1개에서 한 번에.
             -- 거주/아바타 경과는 대상이 실제로 있을 때만(백필이 created_at을 채워 두므로 게이트 필수).
             coalesce((select case when residence_zone_id is not null
               then extract(day from now() - residence_since)::int else 0 end
               from characters where user_id=${u} and server_id=${s}),0) as res_days,
             coalesce((select residence_move_count from characters where user_id=${u} and server_id=${s}),0) as res_moves,
             coalesce((select jsonb_array_length(visited_regions) from characters where user_id=${u} and server_id=${s}),0) as regions_lived,
             coalesce((select case when active_profile_id is not null
               then extract(day from now() - active_profile_since)::int else 0 end
               from characters where user_id=${u} and server_id=${s}),0) as avatar_days,
             coalesce((select guild_donation_count from characters where user_id=${u} and server_id=${s}),0) as donate_cnt,
             coalesce((select jsonb_array_length(executor_zone_history) from characters where user_id=${u} and server_id=${s}),0) as exec_zones
    `),
    // 랭킹(판정 2차) — 리더보드 카운터 기준 지표별 내 값·순위. 행 없는 지표는 TS에서 9999 처리.
    () => db.execute(sql`
      select m.metric, m.value::bigint as value,
             (select count(*)+1 from leaderboard_ranks lr
               where lr.server_id=${s} and lr.metric=m.metric and lr.value > m.value)::int as pos
      from leaderboard_ranks m where m.server_id=${s} and m.user_id=${u}
    `),
    // 재화·결제 순위(판정 2차) — 다이아 현재값·서버 순위, 누적 결제 순위
    () => db.execute(sql`
      with sums as (select io.user_id, sum(io.amount_krw) t from iap_orders io
                    where io.status = 'paid' group by 1) -- 환불 제외(2026-08-22)
      select coalesce(c.diamond::bigint,0) as dia,
             case when c.user_id is null then 9999
                  else (select count(*)+1 from characters c2
                        where c2.server_id=${s} and c2.diamond > c.diamond)::int end as dia_rank,
             (select count(*)::int from sums s2 where s2.t > coalesce((select t from sums where user_id=${u}),0)) + 1 as pay_rank,
             (exists(select 1 from sums where user_id=${u}))::int as has_pay
      from (select 1) one left join characters c on c.user_id=${u} and c.server_id=${s}
    `),
    // 길드(판정 2차) — 소속 일수·창설자(최초 가입자)·길드 xp 순위
    () => db.execute(sql`
      select extract(day from now()-gm.joined_at)::int as gdays,
             (gm.role='leader')::int as gleader,
             (gm.joined_at = (select min(joined_at) from guild_members g2 where g2.guild_id=g.id))::int as founder,
             -- 길드 순위 = (level, xp) 사전식 — guilds.xp는 레벨업 시 임계 차감된 "잔여 XP"라
             -- 단독 비교 시 갓 레벨업한 상위 길드가 밀린다(2026-08-25 명가 오활성 버그).
             (select count(*)+1 from guilds g3 where g3.server_id=${s}
                and (g3.level > g.level or (g3.level = g.level and g3.xp > g.xp)))::int as grank,
             (select count(*) from guild_members g4 where g4.guild_id=g.id and g4.server_id=${s})::int as gsize,
             g.level::int as glevel
      from guild_members gm join guilds g on g.id=gm.guild_id
      where gm.user_id=${u} and gm.server_id=${s}
    `),
    // 채팅(판정 2차) — 누적·심야·멘션 수신(구 string[] 멘션은 미집계 허용)
    () => db.execute(sql`
      select (select count(*)::int from chat_messages where user_id=${u} and server_id=${s}) as chats,
             (select count(*)::int from chat_messages where user_id=${u} and server_id=${s}
               and extract(hour from created_at ${sql.raw(KST)}) < 6) as night_chats,
             (select count(*)::int from chat_messages cm where cm.server_id=${s} and cm.mentions @>
               (select jsonb_build_array(jsonb_build_object('c', public_code)) from profiles where id=${u})) as mentions_got
    `),
    // 소셜 2차 — 추천 유저 성장·추월, 오래된 친구, 새싹 친구
    () => db.execute(sql`
      select (select count(*)::int from referral_attributions ra where ra.referrer_user_id=${u}
               and exists(select 1 from user_equipment ue where ue.user_id=ra.new_user_id
                 and ue.server_id=${s} and ue.max_enhance_level>=50)) as ref_50,
             (select count(*)::int from referral_attributions ra
               join leaderboard_ranks lr on lr.user_id=ra.new_user_id and lr.server_id=${s} and lr.metric='combat'
               where ra.referrer_user_id=${u} and lr.value > coalesce((select value from leaderboard_ranks
                 where server_id=${s} and user_id=${u} and metric='combat'),0)) as ref_over,
             (select count(*)::int from referral_attributions ra where ra.referrer_user_id=${u}
               and exists(select 1 from user_equipment ue where ue.user_id=ra.new_user_id
                 and ue.server_id=${s} and ue.max_enhance_level>=100)) as ref_100,
             (select count(*)::int from referral_attributions ra where ra.referrer_user_id=${u}
               and exists(select 1 from melee_participants mp join melee_battles mb on mb.id=mp.battle_id
                 where mp.user_id=ra.new_user_id and mb.server_id=${s} and mb.status='revealed'
                   and mp.final_rank=1)) as ref_champ,
             -- updated_at = 수락 시각 — friend_links는 수락 전이 외에 UPDATE가 없다(2026-08-21 확인).
             -- created_at은 "요청 생성" 시각이라 오히려 부정확(감사 L2 검토 결과 현행 유지).
             (select count(*)::int from friend_links fl where fl.server_id=${s} and fl.status='accepted'
               and (fl.requester_id=${u} or fl.addressee_id=${u})
               and fl.updated_at <= now() - interval '90 days') as old_friends,
             (select count(*)::int from friend_links fl
               join characters c on c.server_id=${s}
                 and c.user_id = case when fl.requester_id=${u} then fl.addressee_id else fl.requester_id end
               where fl.server_id=${s} and fl.status='accepted' and (fl.requester_id=${u} or fl.addressee_id=${u})
                 and c.created_at >= fl.updated_at - interval '7 days') as sprout_friends
    `),
    // 스트릭 2차 — 출석/레이드 현재 연속일(gaps & islands), 최근 20회 무하락, 어제 1위 4종
    () => db.execute(sql`
      with cd as (select distinct kst_day::date dd from checkin_claim_logs where user_id=${u} and server_id=${s}),
           cruns as (select dd, dd - (row_number() over (order by dd))::int as g from cd),
           ccur as (select count(*)::int len, max(dd) mx from cruns
                    where g = (select g from cruns order by dd desc limit 1)),
           rd as (select distinct (ra.created_at ${sql.raw(KST)})::date dd
                  from raid_attacks ra join raids r on r.id=ra.raid_id
                  where ra.user_id=${u} and r.server_id=${s}),
           rruns as (select dd, dd - (row_number() over (order by dd))::int as g from rd),
           rcur as (select count(*)::int len, max(dd) mx from rruns
                    where g = (select g from rruns order by dd desc limit 1)),
           today as (select (now() ${sql.raw(KST)})::date d)
      select coalesce((select case when mx >= (select d from today) - 1 then len else 0 end from ccur),0) as checkin_streak,
             coalesce((select case when mx >= (select d from today) - 1 then len else 0 end from rcur),0) as raid_streak,
             (select (count(*)=20 and count(*) filter (where result='down')=0)::int
                from (select result from enhancement_logs where user_id=${u} and server_id=${s}
                      order by id desc limit 20) t20) as clean20,
             coalesce((select (mp.final_rank=1)::int from melee_participants mp
               join melee_battles mb on mb.id=mp.battle_id
               where mp.user_id=${u} and mb.server_id=${s} and mb.status='revealed'
                 and mb.battle_date = (select d from today) - 1),0) as y_melee_win,
             coalesce((select (mp.final_rank=mb.participant_count)::int from melee_participants mp
               join melee_battles mb on mb.id=mp.battle_id
               where mp.user_id=${u} and mb.server_id=${s} and mb.status='revealed'
                 and mb.battle_date = (select d from today) - 1),0) as y_melee_last,
             coalesce((select (rk.user_id=${u}::uuid)::int from (
               select ra.user_id, sum(ra.damage) dmg from raid_attacks ra join raids r on r.id=ra.raid_id
               where r.server_id=${s} and (ra.created_at ${sql.raw(KST)})::date = (select d from today) - 1
               group by 1 order by 2 desc, 1 limit 1) rk),0) as y_raid_top,
             coalesce((select (rk.user_id=${u}::uuid)::int from (
               select user_id, count(*) c from supply_open_logs
               where server_id=${s} and (created_at ${sql.raw(KST)})::date = (select d from today) - 1
               group by 1 order by 2 desc, 1 limit 1) rk),0) as y_open_top
    `),
    // 강화 심화(판정 3차) — 일단위 집계·연속일·심야/출퇴근 패턴·장비별 누적
    () => db.execute(sql`
      with l as (select id, user_equipment_id ueid, result, to_level, from_level fl, created_at ca,
                        (created_at ${sql.raw(KST)})::date dd,
                        extract(hour from created_at ${sql.raw(KST)})::int hh
                 from enhancement_logs where user_id=${u} and server_id=${s})
      select
        coalesce((select max(c) from (select count(*) c from l group by dd) t),0)::int as enh_day_max,
        coalesce((select max(len) from (select count(*) len from (
            select dd - (row_number() over (order by dd))::int g from (select distinct dd from l) d) r
          group by g) x),0)::int as enh_day_run,
        coalesce((select max(c) from (select count(*) c from l where hh<6 group by dd) t),0)::int as night_day_max,
        (select count(*)::int from (select dd from l group by dd having bool_and(hh<6)) t) as insomnia_days,
        (select count(*)::int from (select dd from l group by dd having bool_or(hh=9) and bool_or(hh=18)) t) as commuter_days,
        coalesce((select max(c) from (select count(*) c from l group by ueid) t),0)::int as eq_max_cnt,
        -- 칠전팔기 — "딛고" = +100 **최초 도달 이전**의 하락 7회(같은 장비). 도달 후 하락은
        -- 미포함(감사 2026-08-25 발견 6 — 순서 미강제로 문구보다 관대했음).
        (select exists(
           select 1 from (select ueid, min(ca) filter (where to_level>=100) f100 from l group by ueid) t
           where t.f100 is not null
             and (select count(*) from l d where d.ueid=t.ueid and d.result='down' and d.ca < t.f100) >= 7
         ))::int as seven_falls_ok,
        -- 환생 — "+199에서 하락한 **그 장비**를 다시 +200까지"(같은 장비·순서 강제, 감사 2026-08-25 발견 6).
        (select exists(
           select 1 from l d where d.fl=199 and d.result='down'
             and exists(select 1 from l u2 where u2.ueid=d.ueid and u2.to_level>=200 and u2.ca > d.ca)
         ))::int as reinc_ok,
        (select count(*)::int from enhancement_logs
           where user_id=${u} and server_id=${s} and elapsed_ms <= 60000 and reduced_ms > 0) as lightning_cnt,
        (select exists(select 1 from enhancement_logs l1
           where l1.user_id=${u} and l1.server_id=${s} and l1.from_level=1
             and l1.created_at > (select min(created_at) from enhancement_logs
               where user_id=${u} and server_id=${s} and to_level>=100)))::int as beginner_ok,
        (select exists(
           with runs as (select rn, result, rn - row_number() over (order by rn) g
                         from (select result, row_number() over (order by id) rn from l) t
                         where result in ('success','mega')),
                agg as (select min(rn) start_rn, count(*) len from runs group by g)
           select 1 from agg a
           join (select result, row_number() over (order by id) rn from l) prev on prev.rn = a.start_rn - 1
           where prev.result='down' and a.len>=10))::int as phoenix_ok
    `),
    // 무하락 90→100(정밀) + 무단축 +50(보석 단축 이력 대조)
    () => db.execute(sql`
      with l as (select id, user_equipment_id ueid, to_level, result, created_at
                 from enhancement_logs where user_id=${u} and server_id=${s}),
           f as (select ueid, min(id) fid from l where to_level>=100 group by 1),
           n as (select l.ueid, max(l.id) lid from l join f on f.ueid=l.ueid
                 where l.to_level=90 and l.id<=f.fid group by 1),
           bad as (select distinct l.ueid from l join f on f.ueid=l.ueid join n on n.ueid=l.ueid
                   where l.id between n.lid and f.fid and l.result='down'),
           f50 as (select ueid, min(created_at) t50 from l where to_level>=50 group by 1),
           red as (select ej.user_equipment_id ueid, gtr.created_at
                   from gem_time_reductions gtr join enhancement_jobs ej on ej.id=gtr.job_id
                   where gtr.user_id=${u} and gtr.server_id=${s})
      select (exists(select 1 from f join n on n.ueid=f.ueid
                left join bad b on b.ueid=f.ueid where b.ueid is null))::int as flawless_ok,
             (exists(select 1 from f50 where not exists(
                select 1 from red where red.ueid=f50.ueid and red.created_at <= f50.t50)))::int as pure_ok
    `),
    // 보급 심화 — 3연속 동일·하루 3슬롯 일수
    () => db.execute(sql`
      with sl as (select catalog_item_id cid, slot, (created_at ${sql.raw(KST)})::date dd,
                         lag(catalog_item_id) over (order by id) p1,
                         lag(catalog_item_id, 2) over (order by id) p2
                  from supply_open_logs where user_id=${u} and server_id=${s})
      select (exists(select 1 from sl where cid=p1 and cid=p2))::int as same_pull_ok,
             (select count(*)::int from (select dd from sl group by dd
                having count(distinct slot)=3) t) as meals_days
    `),
    // 대난투 심화 — 연속 참가일·연속 우승일
    () => db.execute(sql`
      with p as (select mb.battle_date dd, mp.final_rank, mb.participant_count
                 from melee_participants mp join melee_battles mb on mb.id=mp.battle_id
                 where mp.user_id=${u} and mb.server_id=${s} and mb.status='revealed')
      select
        coalesce((select max(len) from (select count(*) len from (
            select dd - (row_number() over (order by dd))::int g from (select distinct dd from p) d) r
          group by g) x),0)::int as melee_day_run,
        coalesce((select max(len) from (select count(*) len from (
            select dd - (row_number() over (order by dd))::int g
            from (select distinct dd from p where final_rank=1) d) r
          group by g) x),0)::int as melee_win_run,
        coalesce((select max(len) from (
          select count(*) len from (
            select nth - row_number() over (order by nth) g
            from (select row_number() over (order by dd) nth,
                         (final_rank <= greatest(1, (pc+9)/10)) top10
                  from (select dd, final_rank, participant_count pc from p) q) t where top10) r
          group by g) x),0)::int as sprint_run
    `),
    // 교차 — 레이드 최장 연속일·친구 합동 레이드·풀코스·가입 100일째 활동
    () => db.execute(sql`
      with rd as (select distinct (ra.created_at ${sql.raw(KST)})::date dd
                  from raid_attacks ra join raids r on r.id=ra.raid_id
                  where ra.user_id=${u} and r.server_id=${s})
      select
        coalesce((select max(len) from (select count(*) len from (
            select dd - (row_number() over (order by dd))::int g from rd) r group by g) x),0)::int as raid_day_run,
        (select count(distinct ra.raid_id)::int from raid_attacks ra
           join raids r on r.id=ra.raid_id
           where ra.user_id=${u} and r.server_id=${s} and exists(
             select 1 from raid_attacks ra2
             join friend_links fl on fl.server_id=${s} and fl.status='accepted'
               and ((fl.requester_id=${u} and fl.addressee_id=ra2.user_id)
                 or (fl.addressee_id=${u} and fl.requester_id=ra2.user_id))
             where ra2.raid_id=ra.raid_id)) as fire_support_cnt,
        (select count(distinct ra.raid_id)::int from raid_attacks ra join raids r on r.id=ra.raid_id
           where ra.user_id=${u} and r.server_id=${s}
             and extract(isodow from ra.created_at ${sql.raw(KST)}) in (6,7)) as weekend_raid_cnt,
        (select exists(
           select 1
           from (select distinct (created_at ${sql.raw(KST)})::date dd from enhancement_logs
                 where user_id=${u} and server_id=${s}) e
           join (select distinct (created_at ${sql.raw(KST)})::date dd from supply_open_logs
                 where user_id=${u} and server_id=${s}) sp on sp.dd=e.dd
           join rd on rd.dd=e.dd
           join (select distinct mb.battle_date dd from melee_participants mp
                 join melee_battles mb on mb.id=mp.battle_id
                 where mp.user_id=${u} and mb.server_id=${s} and mb.status='revealed') m on m.dd=e.dd))::int as fullcourse_ok,
        (select exists(
           select 1 from characters c where c.user_id=${u} and c.server_id=${s} and (
             exists(select 1 from enhancement_logs el where el.user_id=${u} and el.server_id=${s}
                    and (el.created_at ${sql.raw(KST)})::date = (c.created_at ${sql.raw(KST)})::date + 99)
             or exists(select 1 from supply_open_logs so where so.user_id=${u} and so.server_id=${s}
                    and (so.created_at ${sql.raw(KST)})::date = (c.created_at ${sql.raw(KST)})::date + 99)
             or exists(select 1 from checkin_claim_logs cc where cc.user_id=${u} and cc.server_id=${s}
                    and cc.kst_day::date = (c.created_at ${sql.raw(KST)})::date + 99))))::int as day100_ok
    `),
    // 점령전(판정 4차) — 배치×전투 결과 조인. 전투 없는 날 배치(무공격)는 참여로 안 센다.
    () => db.execute(sql`
      with d as (
        select gd.role, gd.guild_id, cb.winner_guild_id
        from guild_battle_deployments gd
        join conquest_battles cb on cb.zone_id = gd.zone_id
          and cb.battle_kst_day = gd.battle_kst_day and cb.published_at is not null
        where gd.user_id=${u} and gd.server_id=${s}
      )
      select count(*) filter (where role='attack')::int as cq_attack,
             count(*) filter (where role='attack' and winner_guild_id=guild_id)::int as cq_attack_win,
             count(*) filter (where role='defend' and winner_guild_id=guild_id)::int as cq_defend_win,
             (select count(*)::int from guild_audit_log
               where server_id=${s} and actor_user_id=${u} and action='tax_collect') as cq_tax
      from d
    `),
    // 파견(2026-08-30, 8종) — 수령 누적·지역 수·원정(24h)·대성공·레벨·슬롯 개방(계정 합산 강화).
    () => db.execute(sql`
      select (select count(*)::int from expeditions where user_id=${u} and server_id=${s} and status='claimed') as exp_claims,
             (select count(distinct region)::int from expeditions where user_id=${u} and server_id=${s} and status='claimed') as exp_regions,
             (select count(*)::int from expeditions where user_id=${u} and server_id=${s} and status='claimed' and difficulty='grand') as exp_grand,
             (select count(*)::int from expeditions where user_id=${u} and server_id=${s} and status='claimed' and crit) as exp_crit,
             coalesce((select level from expedition_state where user_id=${u} and server_id=${s}), 0)::int as exp_level,
             coalesce((select sum(enhance_level) from user_equipment where user_id=${u} and server_id=${s}), 0)::int as exp_enh_sum
    `),
  ], 5);

  // 자리 어긋남 재발 방지 — 각 결과가 **제 쿼리인지** 대표 컬럼으로 확인한다.
  // 순서가 밀리면 값이 조용히 0/9999가 되어 칭호가 말없이 오판정된다(2026-08-19 사고).
  assertMetricShape({ ranks, wallet, misc, levels });
  const g = (r: unknown): Record<string, unknown> => ((r as unknown[])[0] ?? {}) as Record<string, unknown>;
  const n = (v: unknown): number => Number(v ?? 0);
  const e = g(enh), st = g(streaks), lv = g(levels), sp = g(supply), tr = g(transcend), dy = g(daily),
    so = g(social), mo = g(money), me = g(melee), ra = g(raid), av = g(avatar), mi = g(misc),
    wa = g(wallet), gx = g(guildx), cx = g(chatx), s2 = g(social2), k2 = g(streak2),
    e3 = g(enh3), fl = g(flawless), s3 = g(supply3), m3 = g(melee3), c3 = g(cross3), cq = g(conquest), ex = g(exped),
    lgr = g(lg), ghs = g(gh), ft = g(f3);
  // 랭킹 — 행 없는 지표는 순위 밖(9999)
  const pos: Record<string, number> = { max: 9999, sum: 9999, combat: 9999, raid: 9999, melee: 9999 };
  let combatValue = 0;
  for (const r of ranks as unknown as { metric: string; value: unknown; pos: unknown }[]) {
    pos[r.metric] = n(r.pos);
    if (r.metric === 'combat') combatValue = n(r.value);
  }

  return {
    enh_total: n(e.total), enh_ok: n(e.ok), enh_mega: n(e.mega), enh_down: n(e.down), down9: n(e.down9),
    cliff: n(e.cliff), crown: n(e.crown), owl: n(e.owl), early: n(e.early), weekend: n(e.weekend),
    friday: n(e.friday), monday_down: n(e.monday_down), evening: n(e.evening),
    five_min: n(e.five_min_cnt),
    win_run: n(st.win_run), down_run: n(st.down_run), hold_run: n(st.hold_run), mega_run: n(st.mega_run),
    max_lv: n(lv.max_lv), max_t: n(lv.max_t), codex: n(lv.codex), lv100_cnt: n(lv.lv100_cnt),
    supply_total: n(sp.total), supply_day: n(sp.day_max), supply_morning: n(sp.morning), supply_midnight: n(sp.midnight),
    t_total: n(tr.total), t_day: n(tr.day_max),
    checkin: n(dy.checkin), mail: n(dy.mail), mail_day: n(dy.mail_day), mail_fast: n(dy.mail_fast),
    friends: n(so.friends), invites: n(so.invites),
    pay_sum: n(mo.pay_sum), pay_cnt: n(mo.pay_cnt), reduced_days: n(mo.reduced_ms) / 86400000,
    m_joins: n(me.joins), m_wins: n(me.wins), m_second: n(me.second), m_podium: n(me.podium),
    m_top10: n(me.top10), m_last: n(me.last_place), m_second_last: n(me.second_last), m_comet: n(me.comet), m_win_gap7: n(me.win_gap7),
    r_joins: n(ra.joins), r_max_dmg: n(ra.max_dmg), r_vanguard: n(ra.vanguard), r_night: n(ra.night),
    r_volcano: n(ra.r_volcano), r_swamp: n(ra.r_swamp), r_orc: n(ra.r_orc), r_fallen: n(ra.r_fallen),
    r_temple: n(ra.r_temple), r_kingdom: n(ra.r_kingdom),
    av_cnt: n(av.cnt), av_genders: n(av.genders), av_combo: n(av.combo_max), av_combos: n(av.combos),
    av_owned: n(av.owned), av_first3: n(av.first3),
    days: n(mi.days), challenge_claims: n(mi.challenge_claims),
    liberated: n(mi.liberated), champions: n(mi.champions), lib_weapons: n(mi.lib_weapons), first100_days: n(mi.first100_days),
    catalog_total: n(mi.catalog_total),
    // 파견(2026-08-30)
    exp_claims: n(ex.exp_claims), exp_regions: n(ex.exp_regions), exp_grand: n(ex.exp_grand), exp_crit: n(ex.exp_crit),
    exp_level: n(ex.exp_level), exp_slots: expeditionSlotsFor(n(ex.exp_enh_sum)),
    // ── 판정 5차(2026-08-21) — 0166 이력 컬럼으로 열린 지표(PENDING 12종 해소) ──
    res_days: n(mi.res_days), res_moves: n(mi.res_moves), regions_lived: n(mi.regions_lived),
    avatar_days: n(mi.avatar_days), donate_cnt: n(mi.donate_cnt), exec_zones: n(mi.exec_zones),
    aging_cnt: n(e.aging_cnt), carefree_cnt: n(e.carefree_cnt),
    // ── 판정 2차 ──
    p_max: pos.max!, p_sum: pos.sum!, p_combat: pos.combat!, p_raid: pos.raid!, p_melee: pos.melee!,
    v_combat: combatValue,
    dia: n(wa.dia), dia_rank: n(wa.dia_rank) || 9999, pay_rank: n(wa.pay_rank) || 9999, has_pay: n(wa.has_pay),
    in_guild: (gx.gdays ?? null) === null ? 0 : 1, gdays: n(gx.gdays), founder: n(gx.founder),
    gleader: n(gx.gleader), grank: n(gx.grank) || 9999, gsize: n(gx.gsize), glevel: n(gx.glevel),
    chats: n(cx.chats), night_chats: n(cx.night_chats), mentions_got: n(cx.mentions_got),
    ref_50: n(s2.ref_50), ref_100: n(s2.ref_100), ref_champ: n(s2.ref_champ),
    ref_over: n(s2.ref_over), old_friends: n(s2.old_friends), sprout_friends: n(s2.sprout_friends),
    checkin_streak: n(k2.checkin_streak), raid_streak: n(k2.raid_streak), clean20: n(k2.clean20),
    y_melee_win: n(k2.y_melee_win), y_melee_last: n(k2.y_melee_last), y_raid_top: n(k2.y_raid_top), y_open_top: n(k2.y_open_top),
    // ── 판정 3차 ──
    enh_day_max: n(e3.enh_day_max), enh_day_run: n(e3.enh_day_run),
    night_day_max: n(e3.night_day_max), insomnia_days: n(e3.insomnia_days), commuter_days: n(e3.commuter_days),
    eq_max_cnt: n(e3.eq_max_cnt), seven_falls_ok: n(e3.seven_falls_ok), reinc_ok: n(e3.reinc_ok), phoenix_ok: n(e3.phoenix_ok),
    lightning_cnt: n(e3.lightning_cnt), beginner_ok: n(e3.beginner_ok),
    flawless_ok: n(fl.flawless_ok), pure_ok: n(fl.pure_ok),
    same_pull_ok: n(s3.same_pull_ok), meals_days: n(s3.meals_days),
    melee_day_run: n(m3.melee_day_run), melee_win_run: n(m3.melee_win_run), sprint_run: n(m3.sprint_run),
    raid_day_run: n(c3.raid_day_run), fire_support_cnt: n(c3.fire_support_cnt), weekend_raid_cnt: n(c3.weekend_raid_cnt),
    fullcourse_ok: n(c3.fullcourse_ok), day100_ok: n(c3.day100_ok),
    cq_attack: n(cq.cq_attack), cq_attack_win: n(cq.cq_attack_win), cq_defend_win: n(cq.cq_defend_win), cq_tax: n(cq.cq_tax),
    // ── 판정 4차(2026-08-12) — diamond_ledger·guild_audit_log 도입으로 열린 지표 ──
    dia_gained: n(lgr.dia_gained), dia_free: n(lgr.dia_free), spend_day_max: n(lgr.spend_day_max),
    // 자린고비(2026-08-21 개정) — "10일 내내 10만 유지"를 지출 허용으로: 원장으로 10일 창의
    // 최저 잔액을 복원(led_peak10 주석 참조). 창이 통째로 존재하려면 가입 10일 이상이어야 한다.
    hoard_ok:
      n(mi.days) >= 10 && n(wa.dia) - Math.max(n(lgr.led_peak10), 0) >= 100_000 ? 1 : 0,
    homecoming: n(ghs.homecoming), since_leave: Number(ghs.since_leave ?? -1), alley_boss: n(ghs.alley_boss),
    david: n(ft.david), triathlon: n(ft.triathlon),
  };
}

/** 지표 기반 규칙 — code → 술어. PENDING·아이템 발동·집행관은 여기 없음. */
const RULES: Record<string, (m: Metrics) => boolean> = {
  // 파견(2026-08-30)
  exp_first: (m) => m.exp_claims >= 1,
  exp_50: (m) => m.exp_claims >= 50,
  exp_500: (m) => m.exp_claims >= 500,
  exp_all_regions: (m) => m.exp_regions >= 6,
  exp_grand_10: (m) => m.exp_grand >= 10,
  exp_crit_10: (m) => m.exp_crit >= 10,
  exp_level_30: (m) => m.exp_level >= 30,
  exp_four_slots: (m) => m.exp_slots >= 4,
  // 강화
  enhance_100: (m) => m.max_lv >= 100,
  enhance_150: (m) => m.max_lv >= 150,
  enhance_200: (m) => m.max_lv >= 200,
  enhance_1000: (m) => m.enh_total >= 1000,
  enhance_10000: (m) => m.enh_total >= 10000,
  lucky_hammer: (m) => m.enh_mega >= 100,
  down_curse: (m) => m.enh_down >= 100,
  curse_of_9: (m) => m.down9 >= 10,
  cliff_edge: (m) => m.cliff >= 1,
  reincarnation: (m) => m.reinc_ok === 1, // 같은 장비·순서 강제(감사 2026-08-25)
  crown_touch: (m) => m.crown >= 1,
  win_streak: (m) => m.win_run >= 10,
  down_streak: (m) => m.down_run >= 5,
  down_10: (m) => m.down_run >= 10,
  hold_streak: (m) => m.hold_run >= 10,
  hold_20: (m) => m.hold_run >= 20,
  double_joy: (m) => m.mega_run >= 3,
  card_shark: (m) => m.mega_run >= 5,
  phoenix: (m) => m.phoenix_ok === 1, // 정밀(3차) — 하락 직후 10연속 성공
  blitz: (m) => m.first100_days <= 7,
  five_min: (m) => m.five_min >= 100,
  // 만기 후 방치 수령 — enhancement_logs.overdue_ms(0166, resolve.ts가 수령 시점에 기록)
  aging: (m) => m.aging_cnt >= 50,
  carefree: (m) => m.carefree_cnt >= 1,
  fire_play: (m) => m.enh_day_max >= 200,
  perpetual: (m) => m.enh_day_run >= 30,
  flawless_100: (m) => m.flawless_ok === 1,
  seven_falls: (m) => m.seven_falls_ok === 1,
  one_well: (m) => m.eq_max_cnt >= 2000,
  // 보급
  supply_binge: (m) => m.supply_day >= 50,
  supply_5000: (m) => m.supply_total >= 5000,
  supply_10000: (m) => m.supply_total >= 10000,
  morning_ration: (m) => m.supply_morning >= 100,
  midnight_snack: (m) => m.supply_midnight >= 50,
  same_pull: (m) => m.same_pull_ok === 1,
  three_meals: (m) => m.meals_days >= 30,
  // 초월
  transcend_300: (m) => m.t_total >= 300,
  transcend_1000: (m) => m.t_total >= 1000,
  galaxy: (m) => m.t_total >= 3000,
  transcend_deep: (m) => m.max_t >= 30,
  eclipse: (m) => m.max_t >= 50,
  meteor_shower: (m) => m.t_day >= 30,
  star_rain: (m) => m.t_day >= 100,
  // 도감
  // 도감 "전부" — 카탈로그 실측(catalog_total)과 대조. 120 하드코딩은 카탈로그가 늘면
  // 문구("모든 장비")가 거짓이 된다(감사 L8).
  codex_120: (m) => m.catalog_total > 0 && m.codex >= m.catalog_total,
  // 일상·소셜·재화
  checkin_30: (m) => m.checkin >= 30,
  checkin_365: (m) => m.checkin >= 365,
  mail_1000: (m) => m.mail >= 1000,
  big_eater: (m) => m.mail_day >= 50,
  fast_courier: (m) => m.mail_fast >= 100,
  friends_30: (m) => m.friends >= 30,
  invite_20: (m) => m.invites >= 20,
  time_capsule: (m) => m.days >= 365,
  time_gold: (m) => m.reduced_days >= 30,
  pay_first: (m) => m.pay_cnt >= 1,
  pay_5: (m) => m.pay_sum >= 50_000,
  pay_20: (m) => m.pay_sum >= 200_000,
  pay_50: (m) => m.pay_sum >= 500_000,
  pay_200: (m) => m.pay_sum >= 2_000_000,
  pay_500: (m) => m.pay_sum >= 5_000_000,
  pay_1000: (m) => m.pay_sum >= 10_000_000,
  // 대난투
  melee_first_win: (m) => m.m_wins >= 1,
  melee_30_win: (m) => m.m_wins >= 30,
  melee_3streak: (m) => m.melee_win_run >= 3,
  melee_top10: (m) => m.m_top10 >= 50,
  melee_podium: (m) => m.m_podium >= 10,
  melee_30: (m) => m.m_joins >= 30,
  iron_man: (m) => m.m_joins >= 365,
  month_war: (m) => m.melee_day_run >= 30,
  melee_comet: (m) => m.m_comet >= 1,
  melee_last: (m) => m.m_last >= 1,
  kong_line: (m) => m.m_second >= 2,
  paper_thin: (m) => m.m_second_last >= 1,
  king_return: (m) => m.m_win_gap7 >= 1,
  // 레이드
  raid_strike: (m) => m.r_max_dmg >= 5_000_000,
  raid_365: (m) => m.r_joins >= 365,
  raid_100days: (m) => m.raid_day_run >= 100,
  vanguard: (m) => m.r_vanguard >= 30,
  night_watch: (m) => m.r_night >= 50,
  raid_volcano: (m) => m.r_volcano >= 100,
  raid_swamp: (m) => m.r_swamp >= 100,
  raid_orc: (m) => m.r_orc >= 100,
  raid_fallen: (m) => m.r_fallen >= 100,
  raid_temple: (m) => m.r_temple >= 100, // 신전 보스 = stone_golem(초기 지역 칭호 4종에서 매핑 누락)
  raid_kingdom: (m) => m.r_kingdom >= 100, // 왕국 보스 = gold_griffin(0168)
  continent_sweep: (m) =>
    Math.min(m.r_volcano, m.r_swamp, m.r_orc, m.r_fallen, m.r_temple, m.r_kingdom) >= 10,
  // 아바타
  initiation: (m) => m.av_first3 === 1, // 이력 판정(감사 2026-08-25)
  rebirth: (m) => m.av_cnt >= 100,
  avatar_1000: (m) => m.av_cnt >= 1000,
  avatar_50: (m) => m.av_owned >= 50, // 유일한 "보유" 기준 — cond가 '50개 보유'

  two_mirrors: (m) => m.av_genders >= 2,
  same_combo: (m) => m.av_combo >= 10,
  disguise: (m) => m.av_combos >= 30,
  wandering_smith: (m) => m.regions_lived >= 6, // characters.visited_regions(0166) — 6개 지역 전부
  // 해방
  lib_first: (m) => m.liberated >= 1,
  // 조합
  completionist: (m) => m.challenge_claims >= CHALLENGES.length,
  full_course: (m) => m.fullcourse_ok === 1,
  flawless_all: (m) => m.challenge_claims >= CHALLENGES.length && m.catalog_total > 0 && m.codex >= m.catalog_total && m.max_lv >= 100,
  insomnia: (m) => m.insomnia_days >= 7,
  all_nighter: (m) => m.night_day_max >= 10,
  commuter: (m) => m.commuter_days >= 30,
  owl: (m) => m.owl >= 30,
  early_bird: (m) => m.early >= 30,
  weekend: (m) => m.weekend >= 100,
  friday: (m) => m.friday >= 100,
  monday: (m) => m.monday_down >= 10,
  evening_life: (m) => m.evening >= 100,
  // ── 판정 2차: 랭킹 순간·기록 ──
  pentagon: (m) => m.p_max <= 10 && m.p_sum <= 10 && m.p_combat <= 10 && m.p_raid <= 10 && m.p_melee <= 10,
  // new_record — 판정이 아니라 이벤트 훅: rank-leader 크론(world/event.ts)이 max 1위
  // **교체**를 관측한 순간 지급(첫 관측 시드는 제외 — 오픈 직후 남발 방지). EVENT_HOOK_CODES.
  // 재화·전투력 순간값 — 판정 시점(칭호 화면 진입 등)에 그 값이면 발견. 훅 보강은 후속.
  lucky_777: (m) => m.dia === 777,
  doremi: (m) => m.dia === 12_345,
  power_77777: (m) => m.v_combat === 77_777,
  army_100k: (m) => m.v_combat >= 100_000,
  sword_and_pen: (m) => m.codex >= 100 && m.v_combat >= 100_000,
  // 채팅
  chat_1000: (m) => m.chats >= 1000,
  night_talk: (m) => m.night_chats >= 100,
  mention_100: (m) => m.mentions_got >= 100,
  // 거주·집행관 — characters 이력 컬럼(0166)
  resident_10: (m) => m.res_days >= 10,
  mover_30: (m) => m.res_moves >= 30,
  tour_lord: (m) => m.exec_zones >= 3,
  // 아바타 유지 — 대표가 실제로 바뀔 때만 since 갱신(같은 아바타 재클릭 무시)
  same_face_30: (m) => m.avatar_days >= 30,
  one_suit: (m) => m.avatar_days >= 100,
  // 길드·소셜
  witness: (m) => m.gdays >= 100,
  guild_donate: (m) => m.donate_cnt >= 100,
  pillar: (m) => m.donate_cnt >= 365,
  guild_founder: (m) => m.founder === 1, // 근사 — 최초 가입자=창설자(창설 이벤트 로그 부재)
  welcome_crowd: (m) => m.ref_50 >= 1,
  // 초대 트리(2026-08-05 확정) — 두 번째 발자국 → 길잡이 → 모병관(기존) → 길이 된 사람
  invite_1: (m) => m.invites >= 1,
  invite_5: (m) => m.invites >= 5,
  invite_50: (m) => m.invites >= 50,
  school_founder: (m) => m.ref_100 >= 3,
  sprout_scout: (m) => m.ref_champ >= 1,
  // ── 판정 3차: 특수 ──
  pure_way: (m) => m.pure_ok === 1,
  fire_support: (m) => m.fire_support_cnt >= 50,
  day_100_party: (m) => m.day100_ok === 1,
  // ── 판정 4차: 점령전(배치×전투 결과) ──
  siege_30: (m) => m.cq_attack >= 30,
  assault_100: (m) => m.cq_attack >= 100,
  ram: (m) => m.cq_attack_win >= 30,
  wall: (m) => m.cq_defend_win >= 10,
  guardian_100: (m) => m.cq_defend_win >= 100,
  iron_wall: (m) => m.cq_defend_win >= 30,
  tax_collector: (m) => m.cq_tax >= 10,
  // ── 커버리지 감사 보완(2026-08-05) — 판정 경로 누락 5종 ──
  beginner_mind: (m) => m.beginner_ok === 1,
  lightning: (m) => m.lightning_cnt >= 30,
  sprint: (m) => m.sprint_run >= 5,
  weekend_raid: (m) => m.weekend_raid_cnt >= 100,
  surpassed: (m) => m.ref_over >= 1,
  old_friend: (m) => m.old_friends >= 1,
  sprout_keeper: (m) => m.sprout_friends >= 10,
  // ── PENDING 해소(2026-08-12) — diamond_ledger·guild_audit_log 도입으로 근거가 생긴 것들 ──
  billionaire: (m) => m.dia_gained >= 1_000_000,
  dust_to_mountain: (m) => m.dia_free >= 100_000,
  all_in: (m) => m.spend_day_max >= 100_000,
  bottomless: (m) => m.spend_day_max >= 10_000,
  dragon_hoard: (m) => m.hoard_ok === 1,
  homecoming: (m) => m.homecoming >= 1,
  // no_guild_30(무소속) — 조건부라 RULES가 아닌 activeConditionals에서 판정한다(감사 H1:
  // 여기만 있으면 발견은 되는데 대표 장착·활성 표기가 영구 불가).
  david: (m) => m.david >= 1,
  triathlon: (m) => m.triathlon >= 1,
  // 출석 수령 누적 = 접속일 근사. 접속 자체를 세는 원장이 없고, 출석은 하루 1회라 상한이 같다.
  longevity: (m) => m.checkin >= 500,
  // ── 2차 증설(2026-08-21, 신규 93종 중 영구 2 — 조합 91은 아이템 발동 자동 판정) ──
  first_bitter: (m) => m.enh_down >= 1,
  late_bloomer: (m) => m.lv100_cnt >= 1 && m.first100_days >= 100,
  // ── 2026-08-27 업데이트 신규 18종 — 기존 지표의 미사용 구간 ──
  enhance_5000: (m) => m.enh_total >= 5000,
  enhance_50000: (m) => m.enh_total >= 50000,
  hold_50: (m) => m.hold_run >= 50,
  mega_streak_7: (m) => m.mega_run >= 7,
  supply_30000: (m) => m.supply_total >= 30000,
  raid_1000: (m) => m.r_joins >= 1000,
  raid_strike_20m: (m) => m.r_max_dmg >= 20_000_000,
  melee_podium_50: (m) => m.m_podium >= 50,
  cq_defend_300: (m) => m.cq_defend_win >= 300,
  cq_tax_100: (m) => m.cq_tax >= 100,
  chat_10000: (m) => m.chats >= 10000,
  checkin_100: (m) => m.checkin >= 100,
};

/** 조건부(상태형) 활성 — 대표 표시·발견 공용. 아이템 발동 + 장비 상태 + 해방 + 집행관. */
export async function activeConditionals(userId: string, serverId: number, m?: Metrics): Promise<Set<string>> {
  const eq = await equippedMap(userId, serverId);
  const out = new Set<string>();

  for (const t of TITLE_SECRETS) {
    if (t.req) {
      if (t.req.items.every((k) => (eq.get(k) ?? -1) >= t.req!.min)) out.add(t.code);
    }
  }
  // 장비 상태형
  const lvls = [...eq.values()];
  if (lvls.length === 3 && lvls.every((v) => v === lvls[0]) && lvls[0]! >= 50) out.add('balance_master');
  if (lvls.length === 3 && lvls.every((v) => v >= 100)) out.add('full_armed');
  if (lvls.some((v) => v >= 200)) out.add('star_holder');

  // 집행관
  const zone = (await db.execute(sql`
    select 1 from zones where executor_user_id=${userId}::uuid and server_id=${serverId} limit 1
  `)) as unknown as unknown[];
  if (zone.length) out.add('zone_executor');

  // 해방(보유 수 기반)
  const mm = m ?? (await collectMetrics(userId, serverId));
  if (mm.liberated >= 3) out.add('lib_holder');
  if (mm.liberated >= 10) out.add('lib_ten');
  if (mm.champions >= 5) out.add('champ_5');
  if (mm.lib_weapons >= 10) out.add('armory_lord');

  // ── 판정 2차: 랭킹형("~인 동안") ──
  if (mm.p_combat === 1) out.add('rank_combat');
  if (mm.p_max === 1) out.add('rank_max');
  if (mm.p_sum === 1) out.add('rank_sum');
  if (mm.p_raid === 1) out.add('rank_raid');
  if (mm.p_melee === 1) out.add('rank_melee');
  const allPos = [mm.p_max, mm.p_sum, mm.p_combat, mm.p_raid, mm.p_melee];
  if (allPos.some((p) => p === 2)) out.add('throne_shadow');
  if (allPos.every((p) => p! >= 2 && p! <= 3)) out.add('uncrowned');
  if (mm.days <= 30 && mm.p_combat <= 100) out.add('rising_star');
  // 재화·결제·길드·도감 상태형
  // 빈털터리 — 캐릭터가 있어야(dia_rank 9999 = 캐릭터 없음) 지갑 0이 의미를 가진다(감사 L3:
  // 캐릭터 없는 계정이 judge에선 발견되고 display에선 숨겨지는 갈림 제거 — 요건을 display와 통일).
  if (mm.dia === 0 && mm.dia_rank !== 9999) out.add('broke_now');
  if (mm.dia_rank === 1 && mm.dia > 0) out.add('rich_apex');
  if (mm.pay_rank === 1 && mm.has_pay === 1) out.add('top_patron');
  if (mm.in_guild === 1 && mm.grank === 1) out.add('guild_top');
  if (mm.gleader === 1) out.add('guild_flag');
  // 유지형 스트릭
  if (mm.checkin_streak >= 30) out.add('streak_king');
  if (mm.raid_streak >= 7) out.add('march_live');
  if (mm.clean20 === 1) out.add('smooth_sail');
  // 어제 1위형("오늘 하루 동안")
  if (mm.y_melee_win === 1) out.add('melee_champion');
  if (mm.y_melee_last === 1) out.add('melee_shame');
  if (mm.y_raid_top === 1) out.add('raid_hero');
  if (mm.y_open_top === 1) out.add('open_king');
  // ── PENDING 해소(2026-08-12) — 현재 상태만으로 판정되는 "~인 동안" 3종 ──
  // ⚠ 조건부는 발견 판정과 **대표 표시 재검증**이 둘 다 있어야 한다. display.ts의
  //   HEAVY_CONDITIONALS에 같이 넣지 않으면 발견은 되는데 대표로 달면 조용히 숨겨진다.
  if (mm.in_guild === 1 && mm.gsize >= guildCapacity(mm.glevel)) out.add('big_family');
  if (mm.in_guild === 1 && mm.gsize <= 5 && mm.grank <= 10) out.add('elite_few');
  if (mm.alley_boss === 1) out.add('alley_boss');
  // 무소속(2026-08-21 조건부 전환) — 미소속 && 마지막 탈퇴(해산 포함) 후 7일, 무기록이면
  // 가입 후 7일. 조건 문구가 정본(코드명의 30은 과거 기획 잔재 — 마이그레이션 비용 때문에 유지).
  if (mm.in_guild === 0 && (mm.since_leave >= 7 || (mm.since_leave < 0 && mm.days >= 7))) {
    out.add('no_guild_30');
  }

  return out;
}

/**
 * 발견 판정 + 원장 기록(멱등). 칭호 화면 진입 등 lazy 시점에 호출.
 * 반환: 이번에 새로 발견된 code 목록.
 */
/** 판정 결과 인스턴스 캐시 — 새로고침 연타로 27쿼리 지표 수집이 반복되지 않게(풀러 보호). */
const judgeCache = new Map<string, { at: number; result: { found: string[]; active: Set<string> } }>();
const JUDGE_TTL_MS = 30_000;

export async function discoverTitles(
  userId: string,
  serverId: number,
): Promise<{ found: string[]; active: Set<string> }> {
  const ck = `${userId}:${serverId}`;
  const hit = judgeCache.get(ck);
  if (hit && Date.now() - hit.at < JUDGE_TTL_MS) return hit.result;
  // 캐릭터 존재 가드(칭호 감사 4-e) — srv 쿠키 변조 등으로 캐릭터 없는 서버 번호가 오면
  // 판정도 원장 기록도 하지 않는다(checkin claim.ts의 서버 가드와 동일 원칙).
  const ch = (await db.execute(sql`
    select 1 from characters where user_id=${userId}::uuid and server_id=${serverId} limit 1
  `)) as unknown as unknown[];
  if (!ch.length) {
    const empty = { found: [], active: new Set<string>() };
    // 빈 결과는 5초만 캐시 — 콜백 실패 후 자가복구로 캐릭터가 방금 생기는 레이스에서
    // 첫 발견을 30초나 막지 않게(적대 검수 5). at을 과거로 밀어 TTL을 앞당긴다.
    judgeCache.set(ck, { at: Date.now() - (JUDGE_TTL_MS - 5_000), result: empty });
    return empty;
  }
  const m = await collectMetrics(userId, serverId);
  const achieved = new Set<string>();
  for (const [code, rule] of Object.entries(RULES)) if (rule(m)) achieved.add(code);
  const active = await activeConditionals(userId, serverId, m);
  for (const code of active) achieved.add(code);

  const inserted: string[] = [];
  if (achieved.size) {
    const codes = [...achieved];
    const rows = (await db.execute(sql`
      insert into user_titles (user_id, server_id, title_code)
      select ${userId}::uuid, ${serverId}, unnest(array[${sql.join(codes.map((c) => sql`${c}`), sql`, `)}]::text[])
      on conflict (user_id, server_id, title_code) do nothing
      returning title_code
    `)) as unknown as { title_code: string }[];
    inserted.push(...rows.map((r) => r.title_code));
  }

  // 메타 칭호 — 발견 원장 자체가 조건(칭호 50 발견·히든 10 발견). 위 insert 반영 후 집계.
  const [meta] = (await db.execute(sql`
    select count(*)::int as total,
           count(*) filter (where title_code = any(array[${sql.join(HIDDEN_CODES.map((c) => sql`${c}`), sql`, `)}]::text[]))::int as hidden
    from user_titles where user_id=${userId}::uuid and server_id=${serverId}
  `)) as unknown as { total: number; hidden: number }[];
  const metaCodes: string[] = [];
  if (Number(meta?.total ?? 0) >= 50) metaCodes.push('medal_collector');
  if (Number(meta?.hidden ?? 0) >= 10) metaCodes.push('treasure_hunt');
  if (metaCodes.length) {
    const rows = (await db.execute(sql`
      insert into user_titles (user_id, server_id, title_code)
      select ${userId}::uuid, ${serverId}, unnest(array[${sql.join(metaCodes.map((c) => sql`${c}`), sql`, `)}]::text[])
      on conflict (user_id, server_id, title_code) do nothing
      returning title_code
    `)) as unknown as { title_code: string }[];
    inserted.push(...rows.map((r) => r.title_code));
  }
  // active 동봉 — 칭호 화면이 발견+활성을 한 번의 지표 수집으로 받게(중복 collectMetrics 제거).
  const result = { found: inserted, active };
  judgeCache.set(ck, { at: Date.now(), result });
  if (judgeCache.size > 500) judgeCache.clear(); // 러프한 상한 — 인스턴스 메모리 보호
  return result;
}

/** 히든 칭호 목록 — 메타 칭호(treasure_hunt) 집계용. defs의 hidden 플래그가 정본. */
const HIDDEN_CODES: string[] = [...TITLE_BY_CODE.values()].filter((d) => d.hidden).map((d) => d.code);

/** 대표 칭호 자격 — 영구형은 발견만으로, 조건부형은 지금 조건 충족까지. */
export async function representativeEligible(userId: string, serverId: number, code: string): Promise<boolean> {
  const discovered = (await db.execute(sql`
    select 1 from user_titles where user_id=${userId}::uuid and server_id=${serverId} and title_code=${code} limit 1
  `)) as unknown as unknown[];
  if (!discovered.length) return false;
  // 조건부 여부는 defs의 kind가 정본 — cat 문자열 추정은 영구형 해방(lib_first 등)을
  // 조건부로 오판해 장착 즉시 롤백되는 버그를 만들었다(2026-08-05).
  const def = TITLE_BY_CODE.get(code);
  if (!def) return false;
  if (def.kind !== 'conditional') return true;
  // 최다 케이스 표적 검증(칭호 감사 3-a) — 아이템 발동(164종)·장비 상태형·집행관은 장착
  // 1~2쿼리로 끝난다. 지표 27쿼리 전체 수집은 랭킹·스트릭 등 나머지 조건부에만.
  const secret = TITLE_SECRET_BY_CODE.get(code);
  if (secret?.req || code === 'balance_master' || code === 'full_armed' || code === 'star_holder') {
    const eq = await equippedMap(userId, serverId);
    if (secret?.req) return secret.req.items.every((k) => (eq.get(k) ?? -1) >= secret.req!.min);
    const lvls = [...eq.values()];
    if (code === 'balance_master') return lvls.length === 3 && lvls.every((v) => v === lvls[0]) && lvls[0]! >= 50;
    if (code === 'full_armed') return lvls.length === 3 && lvls.every((v) => v >= 100);
    return lvls.some((v) => v >= 200); // star_holder
  }
  if (code === 'zone_executor') {
    const zone = (await db.execute(sql`
      select 1 from zones where executor_user_id=${userId}::uuid and server_id=${serverId} limit 1
    `)) as unknown as unknown[];
    return zone.length > 0;
  }
  const act = await activeConditionalsCached(userId, serverId);
  return act.has(code);
}

/**
 * 장착 검증용 활성 캐시(감사 M8) — 종전엔 대표 장착 1회마다 지표 27쿼리 전체를 재수집했다.
 * 칭호 화면 진입(discoverTitles)이 방금 채운 judgeCache를 우선 재사용하고, 없으면 1회 계산 후
 * 같은 TTL로 보관. 30초 이내 스테일은 display의 표시 재검증이 어차피 걸러준다.
 */
const activeCache = new Map<string, { at: number; active: Set<string> }>();
async function activeConditionalsCached(userId: string, serverId: number): Promise<Set<string>> {
  const ck = `${userId}:${serverId}`;
  const j = judgeCache.get(ck);
  if (j && Date.now() - j.at < JUDGE_TTL_MS) return j.result.active;
  const hit = activeCache.get(ck);
  if (hit && Date.now() - hit.at < JUDGE_TTL_MS) return hit.active;
  const active = await activeConditionals(userId, serverId);
  activeCache.set(ck, { at: Date.now(), active });
  if (activeCache.size > 500) activeCache.clear(); // 러프한 상한 — 인스턴스 메모리 보호
  return active;
}
