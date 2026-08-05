import 'server-only';

import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { CHALLENGES } from '@/lib/game/challenges/defs';

import { TITLE_SECRETS } from './defs.server';

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

/** 아직 판정 로직이 없는 코드 — 구현 시 제거. 사유는 주석으로. */
export const PENDING_CODES = new Set<string>([
  // 랭킹 스냅샷 연동 필요(조건부 5 + 파생)
  'rank_combat', 'rank_max', 'rank_sum', 'rank_raid', 'rank_melee', 'throne_shadow', 'uncrowned', 'pentagon', 'rising_star', 'guild_top',
  // 순간 포착 훅 필요(재화·전투력 변동 시점)
  'broke_now', 'lucky_777', 'power_77777', 'doremi', 'army_100k', 'rich_apex', 'dragon_hoard', 'all_in', 'billionaire', 'dust_to_mountain', 'scrooge',
  // 이력 테이블 부재(현재 상태만 있음)
  'mover_30', 'resident_10', 'homecoming', 'comeback', 'longevity', 'same_face_30', 'one_suit', 'no_guild_30', 'big_family', 'alley_boss', 'local_elite', 'elite_few',
  // 길드 세부 로그 필요
  'guild_founder', 'guild_donate', 'witness', 'smooth_sail',
  // 점령전 참여/수금 로그 연동 필요
  'tax_collector', 'siege_30', 'wall', 'tour_lord', 'assault_100', 'guardian_100', 'ram', 'iron_wall', 'border_patrol',
  // 채팅 멘션 수신 집계 필요
  'mention_100', 'night_talk', 'chat_1000',
  // 결제·구독 외 특수
  'top_patron', 'surpassed', 'welcome_crowd', 'sprout_keeper', 'old_friend', 'fire_support', 'raid_hero', 'melee_shame', 'melee_champion', 'open_king', 'first_guest',
  // 기타 보류(명세 확정 후)
  'pure_way', 'apex_shoot', 'sword_and_pen', 'new_record', 'day_100_party', 'treasure_hunt', 'medal_collector', 'march_live', 'daily_sortie', 'streak_king', 'codex_live',
  // 지역 보스 미출시
  'raid_temple', 'raid_kingdom',
  // 컷오버 지급(헌정)
  'cbt_2026',
]);

type Metrics = Record<string, number>;

const CATALOG_KEY_BY_ID = new Map<number, string>(); // catalog_items.id → key (지연 로드)

async function loadCatalogIds(): Promise<void> {
  if (CATALOG_KEY_BY_ID.size) return;
  const rows = (await db.execute(sql`select id, code from catalog_items`)) as unknown as { id: number; code: string }[];
  for (const r of rows) CATALOG_KEY_BY_ID.set(Number(r.id), r.code);
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
async function collectMetrics(userId: string, serverId: number): Promise<Metrics> {
  const u = sql`${userId}::uuid`;
  const s = sql`${serverId}`;

  const [enh, streaks, levels, supply, transcend, daily, social, money, melee, raid, avatar, misc] = await Promise.all([
    // 강화 로그 집계
    db.execute(sql`
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
             count(*) filter (where elapsed_ms <= 300000 + reduced_ms)::int as five_min_approx,
             count(*) filter (where elapsed_ms >= duration_ms + 86400000)::int as aging_cnt
      from enhancement_logs where user_id=${u} and server_id=${s}
    `),
    // 연속(스트릭) — gaps & islands. 결과별 최장 연속 + 하락 직후 성공 연속.
    db.execute(sql`
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
    db.execute(sql`
      select coalesce(max(max_enhance_level),0)::int as max_lv,
             coalesce(max(max_transcend_level),0)::int as max_t,
             count(distinct catalog_item_id)::int as codex,
             count(*) filter (where max_enhance_level >= 100)::int as lv100_cnt,
             coalesce(max(case when max_enhance_level >= 100 then 1 else 0 end),0)::int as has100
      from user_equipment where user_id=${u} and server_id=${s}
    `),
    // 보급
    db.execute(sql`
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
    db.execute(sql`
      select count(*)::int as total, coalesce(max(cnt),0)::int as day_max
      from (select count(*) cnt from transcend_logs where user_id=${u} and server_id=${s}
            group by date(created_at ${sql.raw(KST)})) d
    `),
    // 출석·우편
    db.execute(sql`
      select coalesce((select total_claimed_count from user_checkin_state where user_id=${u} and server_id=${s}),0)::int as checkin,
             (select count(*)::int from mail_claim_logs where user_id=${u} and server_id=${s}) as mail,
             coalesce((select max(cnt) from (select count(*) cnt from mail_claim_logs where user_id=${u} and server_id=${s} group by date(claimed_at ${sql.raw(KST)})) d),0)::int as mail_day,
             (select count(*)::int from mail_claim_logs l join mailbox m on m.id=l.mail_id
               where l.user_id=${u} and l.claimed_at <= m.created_at + interval '5 minutes') as mail_fast
    `),
    // 소셜
    db.execute(sql`
      select (select count(*)::int from friend_links where status='accepted' and server_id=${s}
                and (requester_id=${u} or addressee_id=${u})) as friends,
             (select count(*)::int from referral_attributions where referrer_user_id=${u}) as invites
    `),
    // 결제·시간 단축
    db.execute(sql`
      select coalesce((select sum(amount_krw)::bigint from iap_orders where user_id=${u} and status in ('paid','refunded')),0) as pay_sum,
             (select count(*)::int from iap_orders where user_id=${u} and status in ('paid','refunded')) as pay_cnt,
             coalesce((select sum(reduced_ms)::bigint from gem_time_reductions where user_id=${u} and server_id=${s}),0) as reduced_ms
    `),
    // 대난투
    db.execute(sql`
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
    db.execute(sql`
      select count(distinct ra.raid_id)::int as joins,
             coalesce(max(ra.damage),0)::bigint as max_dmg,
             count(*) filter (where ra.seq=1)::int as vanguard,
             count(*) filter (where extract(hour from ra.created_at ${sql.raw(KST)}) < 6)::int as night,
             count(distinct ra.raid_id) filter (where r.boss_code='dragon_west')::int as r_volcano,
             count(distinct ra.raid_id) filter (where r.boss_code='slime_king')::int as r_swamp,
             count(distinct ra.raid_id) filter (where r.boss_code='orc_chief')::int as r_orc,
             count(distinct ra.raid_id) filter (where r.boss_code='fallen_angel')::int as r_fallen
      from raid_attacks ra join raids r on r.id=ra.raid_id
      where ra.user_id=${u} and r.server_id=${s}
    `),
    // 아바타
    db.execute(sql`
      select count(*)::int as cnt,
             count(distinct options->>'gender')::int as genders,
             coalesce(max(combo),0)::int as combo_max,
             count(distinct equipment_snapshot::text)::int as combos
      from (select options, equipment_snapshot,
                   count(*) over (partition by equipment_snapshot::text) combo
            from user_profiles where user_id=${u} and server_id=${s}
              and coalesce((options->>'isDefault')::boolean,false) is false) t
    `),
    // 기타 — 가입 경과·도전과제·해방
    db.execute(sql`
      select coalesce(extract(day from now() - (select created_at from characters where user_id=${u} and server_id=${s}))::int,0) as days,
             (select count(*)::int from challenge_claims where user_id=${u} and server_id=${s}) as challenge_claims,
             (select count(*)::int from codex_champions where user_id=${u} and server_id=${s} and rank<=3) as liberated,
             (select count(*)::int from codex_champions where user_id=${u} and server_id=${s} and rank=1) as champions,
             (select count(*)::int from codex_champions cc join catalog_items ci on ci.id=cc.catalog_item_id
               where cc.user_id=${u} and cc.server_id=${s} and cc.rank<=3 and ci.slot='weapon') as lib_weapons,
             (select coalesce(extract(epoch from (select max_enhance_reached_at from user_equipment
               where user_id=${u} and server_id=${s} and max_enhance_level>=100 order by max_enhance_reached_at limit 1)
               - (select created_at from characters where user_id=${u} and server_id=${s}))/86400,999))::int as first100_days
    `),
  ]);

  const g = (r: unknown): Record<string, unknown> => ((r as unknown[])[0] ?? {}) as Record<string, unknown>;
  const n = (v: unknown): number => Number(v ?? 0);
  const e = g(enh), st = g(streaks), lv = g(levels), sp = g(supply), tr = g(transcend), dy = g(daily),
    so = g(social), mo = g(money), me = g(melee), ra = g(raid), av = g(avatar), mi = g(misc);

  return {
    enh_total: n(e.total), enh_ok: n(e.ok), enh_mega: n(e.mega), enh_down: n(e.down), down9: n(e.down9),
    cliff: n(e.cliff), crown: n(e.crown), owl: n(e.owl), early: n(e.early), weekend: n(e.weekend),
    friday: n(e.friday), monday_down: n(e.monday_down), evening: n(e.evening),
    five_min: n(e.five_min_approx), aging: n(e.aging_cnt),
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
    av_cnt: n(av.cnt), av_genders: n(av.genders), av_combo: n(av.combo_max), av_combos: n(av.combos),
    days: n(mi.days), challenge_claims: n(mi.challenge_claims),
    liberated: n(mi.liberated), champions: n(mi.champions), lib_weapons: n(mi.lib_weapons), first100_days: n(mi.first100_days),
  };
}

/** 지표 기반 규칙 — code → 술어. PENDING·아이템 발동·집행관은 여기 없음. */
const RULES: Record<string, (m: Metrics) => boolean> = {
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
  reincarnation: (m) => m.cliff >= 1 && m.max_lv >= 200,
  crown_touch: (m) => m.crown >= 1,
  win_streak: (m) => m.win_run >= 10,
  down_streak: (m) => m.down_run >= 5,
  down_10: (m) => m.down_run >= 10,
  hold_streak: (m) => m.hold_run >= 10,
  hold_20: (m) => m.hold_run >= 20,
  double_joy: (m) => m.mega_run >= 3,
  card_shark: (m) => m.mega_run >= 5,
  phoenix: (m) => m.win_run >= 10 && m.enh_down >= 1, // 근사 — 하락 경험+10연속 성공(정밀판은 후속)
  blitz: (m) => m.first100_days <= 7,
  five_min: (m) => m.five_min >= 100,
  aging: (m) => m.aging >= 50,
  carefree: () => false, // 7일 방치 수령 — elapsed 근사 불충분, PENDING과 동급(후속)
  fire_play: () => false, // 하루 시도 200 — 일단위 집계 추가 후속
  perpetual: () => false, // 30일 연속 수령 — 연속 일수 집계 후속
  flawless_100: () => false, // 90→100 무하락 — 장비별 정밀 판정 후속
  seven_falls: () => false, // 장비별 하락 7 후 100 — 후속
  one_well: () => false, // 장비별 누적 2000 — 후속
  // 보급
  supply_binge: (m) => m.supply_day >= 50,
  supply_5000: (m) => m.supply_total >= 5000,
  supply_10000: (m) => m.supply_total >= 10000,
  morning_ration: (m) => m.supply_morning >= 100,
  midnight_snack: (m) => m.supply_midnight >= 50,
  same_pull: () => false, // 3연속 동일 — 윈도 정밀 후속
  three_meals: () => false, // 3슬롯×30일 — 후속
  // 초월
  transcend_300: (m) => m.t_total >= 300,
  transcend_1000: (m) => m.t_total >= 1000,
  galaxy: (m) => m.t_total >= 3000,
  transcend_deep: (m) => m.max_t >= 30,
  eclipse: (m) => m.max_t >= 50,
  meteor_shower: (m) => m.t_day >= 30,
  star_rain: (m) => m.t_day >= 100,
  // 도감
  codex_120: (m) => m.codex >= 120,
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
  // 대난투
  melee_first_win: (m) => m.m_wins >= 1,
  melee_30_win: (m) => m.m_wins >= 30,
  melee_3streak: () => false, // 3연속 우승 — 날짜 연속성 후속
  melee_top10: (m) => m.m_top10 >= 50,
  melee_podium: (m) => m.m_podium >= 10,
  melee_30: (m) => m.m_joins >= 30,
  iron_man: (m) => m.m_joins >= 365,
  month_war: () => false, // 30일 연속 참가 — 후속
  melee_comet: (m) => m.m_comet >= 1,
  melee_last: (m) => m.m_last >= 1,
  kong_line: (m) => m.m_second >= 2,
  paper_thin: (m) => m.m_second_last >= 1,
  king_return: (m) => m.m_win_gap7 >= 1,
  david: () => false, // 하위 50% 대비 — 백분위 후속
  melee_week: () => false,
  // 레이드
  raid_strike: (m) => m.r_max_dmg >= 5_000_000,
  raid_365: (m) => m.r_joins >= 365,
  raid_100days: () => false, // 연속 100일 — 후속
  vanguard: (m) => m.r_vanguard >= 30,
  night_watch: (m) => m.r_night >= 50,
  raid_volcano: (m) => m.r_volcano >= 100,
  raid_swamp: (m) => m.r_swamp >= 100,
  raid_orc: (m) => m.r_orc >= 100,
  raid_fallen: (m) => m.r_fallen >= 100,
  continent_sweep: (m) => Math.min(m.r_volcano, m.r_swamp, m.r_orc, m.r_fallen) >= 10, // 현행 4지역 기준
  // 아바타
  initiation: (m) => m.av_cnt >= 1 && m.days <= 3,
  rebirth: (m) => m.av_cnt >= 100,
  avatar_1000: (m) => m.av_cnt >= 1000,
  avatar_50: (m) => m.av_cnt >= 50,
  two_mirrors: (m) => m.av_genders >= 2,
  same_combo: (m) => m.av_combo >= 10,
  disguise: (m) => m.av_combos >= 30,
  wandering_smith: () => false, // 6지역 거주 이력 — 후속
  // 해방
  lib_first: (m) => m.liberated >= 1,
  // 조합
  completionist: (m) => m.challenge_claims >= CHALLENGES.length,
  full_course: () => false, // 하루 4콘텐츠 — 교차 일자 조인 후속
  triathlon: () => false,
  flawless_all: (m) => m.challenge_claims >= CHALLENGES.length && m.codex >= 120 && m.max_lv >= 100,
  insomnia: () => false, // 0~6시만 수령한 날 7일 — 후속
  all_nighter: () => false,
  commuter: () => false,
  owl: (m) => m.owl >= 30,
  early_bird: (m) => m.early >= 30,
  weekend: (m) => m.weekend >= 100,
  friday: (m) => m.friday >= 100,
  monday: (m) => m.monday_down >= 10,
  evening_life: (m) => m.evening >= 100,
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

  return out;
}

/**
 * 발견 판정 + 원장 기록(멱등). 칭호 화면 진입 등 lazy 시점에 호출.
 * 반환: 이번에 새로 발견된 code 목록.
 */
export async function discoverTitles(userId: string, serverId: number): Promise<string[]> {
  const m = await collectMetrics(userId, serverId);
  const achieved = new Set<string>();
  for (const [code, rule] of Object.entries(RULES)) if (rule(m)) achieved.add(code);
  for (const code of await activeConditionals(userId, serverId, m)) achieved.add(code);

  if (!achieved.size) return [];
  const codes = [...achieved];
  const rows = (await db.execute(sql`
    insert into user_titles (user_id, server_id, title_code)
    select ${userId}::uuid, ${serverId}, unnest(array[${sql.join(codes.map((c) => sql`${c}`), sql`, `)}]::text[])
    on conflict (user_id, title_code) do nothing
    returning title_code
  `)) as unknown as { title_code: string }[];
  return rows.map((r) => r.title_code);
}

/** 대표 칭호 자격 — 영구형은 발견만으로, 조건부형은 지금 조건 충족까지. */
export async function representativeEligible(userId: string, serverId: number, code: string): Promise<boolean> {
  const discovered = (await db.execute(sql`
    select 1 from user_titles where user_id=${userId}::uuid and title_code=${code} limit 1
  `)) as unknown as unknown[];
  if (!discovered.length) return false;
  const secret = TITLE_SECRETS.find((t) => t.code === code);
  if (!secret) return false;
  const isConditional = secret.cat === '아이템 발동' || secret.cat.startsWith('랭킹') || secret.cat === '조건부' || secret.cat === '해방' || code === 'streak_king';
  if (!isConditional) return true;
  const act = await activeConditionals(userId, serverId);
  return act.has(code);
}
