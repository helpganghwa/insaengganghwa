import { sql, type SQL } from 'drizzle-orm';

/**
 * 칭호 판정의 강화 지표 — 누적 표(0219 enhance_stats·enhance_equip_stats)에서 읽는다.
 *
 * 예전엔 판정마다 enhancement_logs 전체를 다시 셌다(기록 199만 건 유저 20초, 2026-09-28 #348).
 * 값의 정의는 0219의 enhance_stats_next / enhance_equip_next에 있고, 여기서는 이름만 맞춰 꺼낸다.
 * 컬럼 이름은 collectMetrics가 읽는 이름 그대로다(구조분해 자리도 예전 쿼리 자리 그대로).
 *
 * 전제: 호출 전에 ensureEnhanceStats로 ready 행을 만들어 둔다(judge.ts).
 */

/** 횟수·시간대 — 예전 "강화 로그 집계" 자리. */
export function enhCountsSql(u: SQL, s: SQL): SQL {
  return sql`
    select total, ok, mega, down, down9, cliff, crown, owl, early, weekend, friday, monday_down,
           evening, lunch, five_min as five_min_cnt, aging as aging_cnt, carefree as carefree_cnt
    from enhance_stats where user_id=${u} and server_id=${s}
  `;
}

/** 같은 결과 최장 연속 — 예전 "스트릭" 자리. 성공 연속은 성공만·대성공만 중 긴 쪽(예전 정의 그대로). */
export function enhRunsSql(u: SQL, s: SQL): SQL {
  return sql`
    select greatest(succ_run_max, mega_run_max) as win_run, down_run_max as down_run,
           hold_run_max as hold_run, mega_run_max as mega_run
    from enhance_stats where user_id=${u} and server_id=${s}
  `;
}

/** 강화 심화 — 예전 "판정 3차" 자리. 오늘 칸(cur_day)은 아직 닫히지 않은 날로 더한다. */
export function enhDeepSql(u: SQL, s: SQL): SQL {
  return sql`
    select st.day_max as enh_day_max,
           st.day_run_max as enh_day_run,
           st.night_day_max,
           (st.insomnia_closed + (st.cur_day is not null and st.day_all_night)::int) as insomnia_days,
           (st.commuter_closed + (st.day_has9 and st.day_has18)::int) as commuter_days,
           coalesce((select max(log_cnt) from enhance_equip_stats
                      where user_id=${u} and server_id=${s}),0)::int as eq_max_cnt,
           (exists(select 1 from enhance_equip_stats
                    where user_id=${u} and server_id=${s} and seven_falls_ok))::int as seven_falls_ok,
           (exists(select 1 from enhance_equip_stats
                    where user_id=${u} and server_id=${s} and reinc_ok))::int as reinc_ok,
           st.lightning as lightning_cnt,
           st.beginner_ok::int as beginner_ok,
           st.phoenix_ok::int as phoenix_ok
    from enhance_stats st where st.user_id=${u} and st.server_id=${s}
  `;
}

/** 무하락 90→100 · 무단축 +50 — 예전 "정밀" 자리. 무단축은 +50 첫 도달 전 그 장비에 보석 단축이 없었는가. */
export function enhEquipSql(u: SQL, s: SQL): SQL {
  return sql`
    select (exists(select 1 from enhance_equip_stats
                    where user_id=${u} and server_id=${s} and flawless_ok))::int as flawless_ok,
           (exists(select 1 from enhance_equip_stats f
                    where f.user_id=${u} and f.server_id=${s} and f.reached50_at is not null
                      and not exists(
                        select 1 from gem_time_reductions gtr
                        join enhancement_jobs ej on ej.id=gtr.job_id
                        where gtr.user_id=${u} and gtr.server_id=${s}
                          and ej.user_equipment_id=f.user_equipment_id
                          and gtr.created_at <= f.reached50_at)))::int as pure_ok
  `;
}

/** 최초 +100까지 걸린 일수(없으면 999) — 예전엔 로그의 min(created_at). */
export function first100DaysSql(u: SQL, s: SQL): SQL {
  return sql`(select coalesce(extract(epoch from (
                (select first100_at from enhance_stats where user_id=${u} and server_id=${s})
                - (select created_at from characters where user_id=${u} and server_id=${s})))/86400,999))::int`;
}

/** 최근 20회 무하락. */
export function clean20Sql(u: SQL, s: SQL): SQL {
  return sql`coalesce((select (nodown_run >= 20)::int from enhance_stats
                        where user_id=${u} and server_id=${s}),0)`;
}

/**
 * 그 KST 날짜에 강화가 있었는가 — 날짜 범위로 묻는다((user_id, created_at) 인덱스를 탄다).
 * `dd`는 date 식. 예전엔 로그 전체의 날짜를 뽑아 조인했다.
 */
export function enhancedOnDaySql(u: SQL, s: SQL, dd: SQL): SQL {
  return sql`exists(select 1 from enhancement_logs el
                    where el.user_id=${u} and el.server_id=${s}
                      and el.created_at >= ((${dd})::timestamp at time zone 'Asia/Seoul')
                      and el.created_at < (((${dd}) + 1)::timestamp at time zone 'Asia/Seoul'))`;
}
