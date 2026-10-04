/**
 * 대난투 헤드라인 엔진(순수) — 배틀 결과 + 어제까지의 누적 이력에서 "읽을 만한 사건"을 규칙으로 찾아
 * 문장으로 만든다. 40종(사용자 선정 2026-09-02). DB/IO 없음 — 크론·백테스트·테스트가 같은 함수를 쓴다.
 *
 * 흐름: generateHeadlines(오늘 배틀, 참가자, 이력) → 후보 전부 + 자동 선택 3(~4)
 *      applyBattleToHistory(이력, 오늘) → 다음 날을 위한 누적 갱신(DB 누적표와 같은 의미 — 하루치만 더한다).
 * 원칙: 이름이 붙는 사건은 긍정·중립 프레임. 이모지 없음. 이름은 배틀 시점 닉네임 스냅샷.
 */
import { MELEE_HP_MULT } from '@/lib/game/balance';
import { getJosaPicker } from 'josa';

export type HeadlineParticipant = {
  userId: string;
  nickname: string;
  cp: number;
  rank: number;
  killerUserId: string | null;
  attackCount: number;
  defenseCount: number;
  eliminatedRound: number | null;
  guildName: string | null;
  /** 배틀 시점 **그 서버의** 길드장 여부(조인). 모르면 false. */
  isGuildLeader?: boolean;
  /** **그 서버에서 시작한 뒤** 경과 일수(캐릭터 생성일 기준, 배틀일 기준 0=당일). 모르면 null. */
  accountAgeDays?: number | null;
};

export type HeadlineBattle = {
  /** KST 배틀일 YYYY-MM-DD */
  date: string;
  participantCount: number;
  totalRounds: number;
  championUserId: string;
  finale: {
    roster: { userId: string; nickname: string; cp: number; rank: number }[];
    /** [공격자 idx, 타겟 idx, 데미지, 타겟 잔여HP] — 마지막 MELEE_REPLAY_ROUNDS 라운드 */
    events: [number, number, number, number][];
  };
};

export type UserStats = {
  entries: number;
  wins: number;
  seconds: number;
  podiums: number;
  kills: number;
  attacks: number;
  defenses: number;
  bestRank: number | null;
  lastWinDate: string | null;
  /** lastWinDate로 끝나는 연속(일) 우승 수 */
  winStreak: number;
};

export type DaySnapshot = {
  date: string;
  championUserId: string;
  /** userId → 최종 순위 */
  ranks: Map<string, number>;
  /** 피처치자 → 처치자 */
  killerOf: Map<string, string>;
  /** 1·2·3위 userId */
  podium: string[];
};

export type HeadlineHistory = {
  battlesBefore: number;
  stats: Map<string, UserStats>;
  records: { maxAttacks: number; maxDefenses: number; maxKills: number };
  /** 길드명 → 통산 우승 / 등장 배틀 수 */
  guildWins: Map<string, number>;
  guildEntries: Map<string, number>;
  /** 직전 배틀 스냅샷(연속일 판정은 호출부가 date로) */
  yesterday: DaySnapshot | null;
  /** 두 사람 사이에 처치가 있었던 연속 일수(직전 배틀 기준). key = 정렬한 두 userId */
  pairStreak: Map<string, number>;
  /** 피처치자 → 같은 처치자에게 연속으로 당한 일수(직전 배틀 기준) */
  sameKillerStreak: Map<string, { killer: string; days: number }>;
  /** 직전 배틀까지 연속 Top10 일수(10-04 top10_streak). 없으면 0. */
  top10Streak: Map<string, number>;
  /** 어제 자동 선택된 코드(같은 종류 연속 방지 감점) */
  usedYesterdayCodes: Set<string>;
  /** 어제 헤드라인 주인공(같은 사람 연일 노출 감점) */
  usedYesterdaySubjects: Set<string>;
};

export type HeadlineCategory = 'crown' | 'upset' | 'survive' | 'record' | 'drama' | 'guild' | 'growth';
export type Headline = {
  code: string;
  category: HeadlineCategory;
  text: string;
  /** 자동 선택 점수 — 희소성 + 크기. 높을수록 먼저. */
  score: number;
  /** 주인공 userId — 같은 사람이 두 줄에 나오지 않게 */
  subjects: string[];
};

export function emptyHistory(): HeadlineHistory {
  return {
    battlesBefore: 0,
    stats: new Map(),
    records: { maxAttacks: 0, maxDefenses: 0, maxKills: 0 },
    guildWins: new Map(),
    guildEntries: new Map(),
    yesterday: null,
    pairStreak: new Map(),
    sameKillerStreak: new Map(),
    top10Streak: new Map(),
    usedYesterdayCodes: new Set(),
    usedYesterdaySubjects: new Set(),
  };
}

const fmt = (n: number) => Math.round(n).toLocaleString('ko-KR');
const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/**
 * 조사 붙이기 — josa('슷파', '이', '가') → '슷파가', josa('Res', '을', '를') → 'Res를'.
 * 받침 판정은 josa 패키지(한글·ㄹ받침·숫자 발음·로마자, 기호는 앞 글자 기준)에 맡긴다(2026-09-23).
 * 둘째 인자가 받침형 조사(이·을·과…)이고 셋째는 호출부 가독성용이라 판정에는 쓰지 않는다.
 */
export function josa(word: string, withBatchim: string, _without: string): string {
  if (!word.trim()) return word; // 빈 값이면 조사를 붙이지 않는다(자리표시가 새는 것 방지)
  return word + getJosaPicker(withBatchim)(word);
}
/** 기본 닉네임(미변경) 패턴 — 주인공으로 나오면 읽는 맛이 떨어져 감점. */
const DEFAULT_NICK = /^대장장이[0-9a-z]{4}$/;
const KILL_MILESTONES = [50, 100, 200, 500, 1000];
const WIN_MILESTONES = new Set([5, 10, 20, 30, 50, 100]);
const PODIUM_MILESTONES = [5, 10, 20, 30, 50, 100];
/**
 * 종류별 선택 점수 재산정(10-04) — 프로덕션 9/3~10/4 배틀 32회 중 운영자가 직접 고른 29회의 선택률로 정했다.
 * target = 1 + 3 × (선택 + 0.5) / (등장 + 1), base = 종전 평균 점수. 같은 종류 안의 크기 차이는 절반만 남긴다(add 참조).
 * 백테스트: 운영자 선택 재현 37% → 54%. 등장 3회 미만인 종류는 표본이 적어 넣지 않았다(종전 점수 유지).
 */
const HEADLINE_PREF: Record<string, { target: number; base: number }> = {
  record_kills: { target: 3.62, base: 3.0 },
  win_streak: { target: 3.16, base: 3.46 },
  same_killer_streak: { target: 2.97, base: 2.5 },
  record_defenses: { target: 2.88, base: 3.0 },
  revenge: { target: 2.58, base: 2.0 },
  career_kills_ms: { target: 2.45, base: 2.43 },
  reclaim: { target: 2.39, base: 2.32 },
  hunter_crowned: { target: 2.23, base: 3.0 },
  champion_hunter: { target: 1.9, base: 1.5 },
  master_crowned: { target: 1.9, base: 1.0 },
  rank_jump: { target: 1.8, base: 2.44 },
  top_kills_today: { target: 1.72, base: 1.8 },
  career_wins: { target: 1.57, base: 1.71 },
  rematch: { target: 1.56, base: 3.0 },
  record_attacks: { target: 1.38, base: 3.0 },
  no_attack_top10: { target: 1.38, base: 1.0 },
  crown_returned: { target: 1.3, base: 1.5 },
  rivals: { target: 1.29, base: 3.41 },
  eternal_second: { target: 1.26, base: 3.73 },
  podium_guild_sweep: { target: 1.26, base: 3.0 },
  newbie_top10: { target: 1.17, base: 2.0 },
  slayer_champ: { target: 1.15, base: 2.0 },
  giant_kill: { target: 1.06, base: 2.04 },
  rank_gap_max: { target: 1.06, base: 1.42 },
  tank_survivor: { target: 1.05, base: 1.43 },
};
/** 이력이 이만큼 쌓인 뒤에만 '역대'·'최초' 계열을 낸다(첫 며칠은 전부 기록이라 의미 없음). */
const MIN_BATTLES_FOR_RECORDS = 3;

function prevDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}
function statsOf(h: HeadlineHistory, userId: string): UserStats {
  return (
    h.stats.get(userId) ?? {
      entries: 0, wins: 0, seconds: 0, podiums: 0, kills: 0, attacks: 0, defenses: 0,
      bestRank: null, lastWinDate: null, winStreak: 0,
    }
  );
}

export function generateHeadlines(
  b: HeadlineBattle,
  parts: readonly HeadlineParticipant[],
  h: HeadlineHistory,
): { candidates: Headline[]; picks: Headline[] } {
  const out: Headline[] = [];
  const n = parts.length;
  if (n < 2) return { candidates: [], picks: [] };
  const byId = new Map(parts.map((p) => [p.userId, p]));
  const champ = byId.get(b.championUserId) ?? parts.find((p) => p.rank === 1);
  if (!champ) return { candidates: [], picks: [] };
  const byRank = [...parts].sort((a, c) => a.rank - c.rank);
  const second = byRank.find((p) => p.rank === 2) ?? null;
  const third = byRank.find((p) => p.rank === 3) ?? null;
  // 전투력 순위(1=최강) — 동점은 같은 순위
  const byCp = [...parts].sort((a, c) => c.cp - a.cp);
  const cpRank = new Map<string, number>();
  byCp.forEach((p, i) => cpRank.set(p.userId, i > 0 && byCp[i - 1]!.cp === p.cp ? cpRank.get(byCp[i - 1]!.userId)! : i + 1));
  // 처치 목록
  const kills = new Map<string, HeadlineParticipant[]>();
  for (const p of parts) if (p.killerUserId && byId.has(p.killerUserId)) (kills.get(p.killerUserId) ?? kills.set(p.killerUserId, []).get(p.killerUserId)!).push(p);
  const killsOf = (id: string) => kills.get(id)?.length ?? 0;
  const yesterdayIsPrev = h.yesterday?.date === prevDay(b.date);
  const y = yesterdayIsPrev ? h.yesterday : null;
  const cs = statsOf(h, champ.userId);
  const cName = champ.nickname;
  const add = (code: string, category: HeadlineCategory, score: number, text: string, subjects: string[]) => {
    // 기본 닉네임 주인공은 감점(읽는 맛) — 사건 자체는 남긴다(검수에서 고를 수 있게).
    const dull = subjects.some((u) => DEFAULT_NICK.test(byId.get(u)?.nickname ?? ''));
    // 운영자 선택 기준 재산정(10-04) — 종류별 평균을 선택률 목표로 옮기고, 같은 종류 안의 크기 차이는 절반만 남긴다.
    const pref = HEADLINE_PREF[code];
    const s = pref ? pref.target + 0.5 * (score - pref.base) : score;
    out.push({ code, category, score: dull ? s - 1 : s, text, subjects });
  };

  /* ── 우승·왕관 ── */
  if (cs.entries === 0) add('debut_win', 'crown', 3.5, `${cName}, 첫 참가에 우승`, [champ.userId]);
  else if (cs.wins === 0 && cs.seconds >= 2) add('second_breaks', 'crown', 3, `준우승만 ${cs.seconds}번, ${cName} 드디어 우승`, [champ.userId]);
  else if (cs.wins === 0) add('first_win', 'crown', 2.5, `${cName}, 생애 첫 우승`, [champ.userId]);
  if (cs.wins >= 1) {
    const total = cs.wins + 1;
    const streak = y && y.championUserId === champ.userId ? cs.winStreak + 1 : 1;
    if (streak >= 2) add('win_streak', 'crown', 2.5 + 0.3 * streak, `${cName}, ${streak}일 연속 우승(통산 ${total}회)`, [champ.userId]);
    else if (cs.lastWinDate) {
      const gap = daysBetween(cs.lastWinDate, b.date);
      if (gap >= 2) add('reclaim', 'crown', 2 + Math.min(1, gap / 10), `${cName}, ${gap}일 만에 정상 탈환(통산 ${total}회 우승)`, [champ.userId]);
    }
    add('career_wins', 'crown', WIN_MILESTONES.has(total) ? 3 : 1.5, `${cName}, 통산 ${total}회 우승`, [champ.userId]);
  }
  {
    const r = cpRank.get(champ.userId)!;
    if (r > 30) add('outside_top100_champ', 'crown', 2 + Math.min(1.5, r / 100), `전투력 ${r}위 ${josa(cName, '이', '가')} 우승`, [champ.userId]);
  }
  if (champ.attackCount <= 2) add('bloodless_champ', 'crown', 2, `${cName}, 공격 ${champ.attackCount}회만으로 우승`, [champ.userId]);
  {
    const defs = parts.map((p) => p.defenseCount).sort((a, c) => c - a);
    const p95 = defs[Math.max(0, Math.floor(defs.length * 0.05) - 1)] ?? 0;
    if (champ.defenseCount >= Math.max(15, p95)) add('iron_champ', 'crown', 2, `${cName}, ${champ.defenseCount}번 맞고도 우승`, [champ.userId]);
  }
  {
    const k = killsOf(champ.userId);
    if (k >= 4) add('slayer_champ', 'crown', 1 + Math.min(1, k / 10), `챔피언 ${cName}, ${k}명을 쓰러뜨리고 정상`, [champ.userId]);
  }
  // 결승 로그 — 잔여 HP는 이벤트에 있다(타겟 잔여HP). 챔피언 마지막 피격의 잔여 비율.
  {
    const roster = b.finale.roster;
    const cIdx = roster.findIndex((r) => r.userId === champ.userId);
    const tIdx = third ? roster.findIndex((r) => r.userId === third.userId) : -1;
    if (cIdx >= 0) {
      const ev = b.finale.events;
      let lastHit: [number, number, number, number] | null = null;
      for (const e of ev) if (e[1] === cIdx) lastHit = e;
      const maxHp = (roster[cIdx]!.cp || champ.cp) * MELEE_HP_MULT;
      if (lastHit && maxHp > 0) {
        const ratio = Math.max(0, lastHit[3]) / maxHp;
        if (ratio <= 0.05) add('final_clutch', 'crown', 2 + (0.05 - ratio) * 20, `${cName}, 체력 ${(ratio * 100).toFixed(1)}%를 남기고 우승`, [champ.userId]);
      }
      if (tIdx >= 0) {
        const thirdOut = ev.findIndex((e) => e[1] === tIdx && e[3] <= 0);
        if (thirdOut >= 0) {
          const finalEvents = ev.slice(thirdOut + 1);
          const champAttacks = finalEvents.filter((e) => e[0] === cIdx).length;
          const hitsOnChamp = finalEvents.filter((e) => e[1] === cIdx).length;
          if (champAttacks >= 2 && hitsOnChamp === 0 && second)
            add('final_sweep', 'crown', 1.5, `${cName}, 결승에서 한 대도 맞지 않고 ${josa(second.nickname, '을', '를')} 제압`, [champ.userId]);
        }
      }
    }
  }
  if (y) {
    const yc = byId.get(y.championUserId);
    if (yc && yc.rank > 1) {
      const killer = yc.killerUserId ? byId.get(yc.killerUserId) : null;
      // 연속 우승 중이던 어제 챔피언을 멈춘 경우(10-04 신규) — 운영자가 즐겨 고른 연속 우승·천적 줄의 반대편 이야기.
      const ycStreak = statsOf(h, yc.userId).winStreak;
      if (killer && ycStreak >= 2) {
        if (killer.userId === champ.userId)
          add('streak_ended', 'crown', 3.4, `${cName}, ${yc.nickname}의 ${ycStreak}일 연속 우승을 끊고 정상`, [champ.userId, yc.userId]);
        else add('streak_ended', 'crown', 2.9, `${killer.nickname}, ${yc.nickname}의 ${ycStreak}일 연속 우승 행진을 멈춤(${fmt(killer.rank)}위)`, [killer.userId, yc.userId]);
      } else if (killer && killer.userId === champ.userId) {
        add('hunter_crowned', 'crown', 3, `${cName}, 어제 챔피언 ${josa(yc.nickname, '을', '를')} 직접 꺾고 우승`, [champ.userId, yc.userId]);
      } else {
        add('crown_returned', 'crown', 1.5, `어제 챔피언 ${yc.nickname}, 오늘 ${fmt(yc.eliminatedRound ?? 0)}라운드에 ${killer ? `${killer.nickname}에게 ` : ''}탈락(${fmt(yc.rank)}위)`, [yc.userId]);
        if (killer) add('champion_hunter', 'crown', 1.5, `어제 챔피언 ${josa(yc.nickname, '을', '를')} 쓰러뜨린 ${killer.nickname}(${fmt(killer.rank)}위)`, [killer.userId]);
      }
    }
  }
  if (second) {
    const ss = statsOf(h, second.userId);
    if (ss.seconds >= 2) add('eternal_second', 'crown', 2 + 0.3 * (ss.seconds + 1), `${second.nickname}, ${ss.seconds + 1}번째 준우승`, [second.userId]);
  }

  /* ── 자이언트 킬링·이변 ── */
  {
    // 쓰러진 쪽이 의미 있는 전투력(참가자 중앙값 이상)일 때만 — 저전투력끼리의 큰 비율은 잡음.
    const cpSorted = parts.map((p) => p.cp).sort((a, c) => a - c);
    const minVictimCp = Math.max(10_000, cpSorted[Math.floor(cpSorted.length / 2)] ?? 0);
    let best: { k: HeadlineParticipant; v: HeadlineParticipant; ratio: number } | null = null;
    for (const [kid, victims] of kills) {
      const k = byId.get(kid)!;
      if (k.cp <= 0) continue;
      for (const v of victims) {
        if (v.cp < minVictimCp) continue;
        const ratio = v.cp / k.cp;
        if (!best || ratio > best.ratio) best = { k, v, ratio };
      }
    }
    if (best && best.ratio >= 3)
      add('giant_kill', 'upset', 1 + Math.min(2.5, Math.log10(best.ratio) * 1.5), `전투력 ${fmt(best.k.cp)}의 ${josa(best.k.nickname, '이', '가')} 전투력 ${fmt(best.v.cp)}의 ${josa(best.v.nickname, '을', '를')} 쓰러뜨림`, [best.k.userId, best.v.userId]);
    for (const [kid, victims] of kills) {
      const k = byId.get(kid)!;
      const big = victims.filter((v) => v.cp >= k.cp * 2);
      if (big.length >= 3) {
        add('multi_giant', 'upset', 3 + big.length * 0.2, `전투력 ${fmt(k.cp)}의 ${k.nickname}, 자기보다 센 상대 ${big.length}명을 쓰러뜨림`, [k.userId]);
        break;
      }
    }
  }
  {
    const top10cp = byCp.slice(0, Math.min(10, n));
    if (n >= 30 && top10cp.every((p) => p.rank > 10)) add('top10_wiped', 'upset', 3, `이변의 날, 전투력 상위 10명 중 Top10에 든 사람 없음`, top10cp.map((p) => p.userId));
  }
  {
    const weak = byRank.filter((p) => p.rank <= 10 && (cpRank.get(p.userId) ?? 0) >= Math.ceil(n * 0.9));
    if (weak[0]) add('weak_top10', 'upset', 2.5, `전투력 하위 10%의 ${weak[0].nickname}, 최종 ${weak[0].rank}위`, [weak[0].userId]);
  }
  {
    let best: HeadlineParticipant | null = null;
    let bestGap = 0;
    for (const p of byRank) {
      if (p.rank > 20) break;
      const gap = (cpRank.get(p.userId) ?? 0) - p.rank;
      if (gap > bestGap) { bestGap = gap; best = p; }
    }
    if (best && bestGap >= 100) add('rank_gap_max', 'upset', 1 + Math.min(1.5, bestGap / 300), `전투력 ${cpRank.get(best.userId)}위 ${josa(best.nickname, '이', '가')} 최종 ${best.rank}위`, [best.userId]);
  }
  if (y) {
    let best: HeadlineParticipant | null = null;
    let bestJump = 0;
    for (const p of byRank) {
      if (p.rank > 10) break;
      const yr = y.ranks.get(p.userId);
      if (yr == null) continue;
      const jump = yr - p.rank;
      if (jump > bestJump) { bestJump = jump; best = p; }
    }
    if (best && bestJump >= 100) add('rank_jump', 'upset', 1 + bestJump / 300, `어제 ${fmt(y.ranks.get(best.userId)!)}위 ${best.nickname}, 오늘 ${best.rank}위`, [best.userId]);
  }

  /* ── 생존·회피 ── */
  {
    const d = byRank.find((p) => p.rank <= 10 && p.attackCount === 0 && p.defenseCount === 0);
    if (d) add('dodger_0_0', 'survive', 2.5 + (10 - d.rank) * 0.1, `${d.nickname}, 공격 0회·방어 0회로 최종 ${d.rank}위`, [d.userId]);
    // 체인 난투에선 상위권이 한 번도 공격받지 않기가 사실상 불가능(실측 무공격 최고 43~165위) — 무공격은 상위 5%를 기준으로.
    const naLimit = Math.max(10, Math.ceil(n * 0.05));
    const na = byRank.find((p) => p.rank <= naLimit && p.attackCount === 0 && p.defenseCount > 0);
    if (na) add('no_attack_top10', 'survive', 2 + (na.rank <= 10 ? 0.5 : 0), `${na.nickname}, 공격 한 번 없이 ${fmt(n)}명 중 ${na.rank}위(방어 ${na.defenseCount}회)`, [na.userId]);
    let tank: HeadlineParticipant | null = null;
    for (const p of byRank) {
      if (p.rank > 20) break;
      if (p.rank === 1) continue;
      if (!tank || p.defenseCount > tank.defenseCount) tank = p;
    }
    if (tank && tank.defenseCount >= 10) add('tank_survivor', 'survive', 1 + tank.defenseCount / 30, `${tank.defenseCount}번 맞고도 ${tank.rank}위까지 버틴 ${tank.nickname}`, [tank.userId]);
  }

  /* ── 공격·기록 ── */
  const recordsReady = h.battlesBefore >= MIN_BATTLES_FOR_RECORDS;
  {
    const ma = [...parts].sort((a, c) => c.attackCount - a.attackCount)[0]!;
    if (recordsReady && ma.attackCount > h.records.maxAttacks) add('record_attacks', 'record', 3, `${ma.nickname}, 공격 ${ma.attackCount}회로 역사상 최다 공격`, [ma.userId]);
    const md = [...parts].sort((a, c) => c.defenseCount - a.defenseCount)[0]!;
    if (recordsReady && md.defenseCount > h.records.maxDefenses) add('record_defenses', 'record', 3, `${md.nickname}, 방어 ${md.defenseCount}회로 역사상 최다 방어`, [md.userId]);
    let topK: HeadlineParticipant | null = null;
    for (const p of byRank) if (killsOf(p.userId) > (topK ? killsOf(topK.userId) : 0)) topK = p;
    if (topK) {
      const k = killsOf(topK.userId);
      if (recordsReady && k > h.records.maxKills) add('record_kills', 'record', 3, `${topK.nickname}, 하루 ${k}명 처치로 역대 기록 갱신`, [topK.userId]);
      else if (k >= 3) add('top_kills_today', 'record', 1 + Math.min(0.8, k / 12), `오늘 최다 처치는 ${topK.nickname}, ${k}명`, [topK.userId]);
    }
    for (const p of parts) {
      const k = killsOf(p.userId);
      if (k === 0) continue;
      const before = statsOf(h, p.userId).kills;
      const ms = KILL_MILESTONES.find((m) => before < m && before + k >= m);
      if (ms) { add('career_kills_ms', 'record', 2.5, `${p.nickname}, 통산 ${ms}번째 처치`, [p.userId]); break; }
    }
  }

  /* ── 관계·드라마 ── */
  if (y && second) {
    const ySet = new Set(y.podium.slice(0, 2));
    if (ySet.size === 2 && ySet.has(champ.userId) && ySet.has(second.userId))
      add('rematch', 'drama', 3, `어제 결승의 두 사람 ${cName}·${second.nickname}, 오늘도 결승에서 만남`, [champ.userId, second.userId]);
  }
  if (y) {
    // 천적 탈출(10-04 신규) — 이틀 이상 연속으로 자신을 쓰러뜨린 상대를 오늘 꺾음. 복수(하루)의 긴 판.
    let escaped = false;
    for (const [kid, victims] of kills) {
      const k = byId.get(kid)!;
      const sk = h.sameKillerStreak.get(k.userId);
      const v = sk && sk.days >= 2 ? victims.find((vv) => vv.userId === sk.killer) : undefined;
      if (v && sk) {
        add('nemesis_broken', 'drama', 3.2, `${sk.days}일 연속 자신을 쓰러뜨린 ${josa(v.nickname, '을', '를')} 드디어 꺾은 ${k.nickname}`, [k.userId, v.userId]);
        escaped = true;
        break;
      }
    }
    for (const [kid, victims] of kills) {
      if (escaped) break;
      const k = byId.get(kid)!;
      const v = victims.find((vv) => y.killerOf.get(k.userId) === vv.userId);
      if (v) { add('revenge', 'drama', 2, `어제 자신을 꺾은 ${josa(v.nickname, '을', '를')} 오늘 쓰러뜨린 ${k.nickname}`, [k.userId, v.userId]); break; }
    }
    // 라이벌·천적은 가장 긴 연속 1건만(같은 종류 후보 중복 방지).
    let rival: { k: HeadlineParticipant; v: HeadlineParticipant; s: number } | null = null;
    let nemesis: { k: HeadlineParticipant; v: HeadlineParticipant; days: number } | null = null;
    for (const [kid, victims] of kills) {
      const k = byId.get(kid)!;
      for (const v of victims) {
        const s = (h.pairStreak.get(pairKey(k.userId, v.userId)) ?? 0) + 1;
        if (s >= 3 && (!rival || s > rival.s)) rival = { k, v, s };
        const sk = h.sameKillerStreak.get(v.userId);
        if (sk && sk.killer === k.userId && sk.days + 1 >= 3 && (!nemesis || sk.days + 1 > nemesis.days)) nemesis = { k, v, days: sk.days + 1 };
      }
    }
    if (rival) add('rivals', 'drama', 2.5 + Math.min(1, 0.2 * rival.s), `${josa(rival.k.nickname, '과', '와')} ${rival.v.nickname} ${rival.s}일째 맞대결, 오늘은 ${rival.k.nickname}의 승`, [rival.k.userId, rival.v.userId]);
    if (nemesis) add('same_killer_streak', 'drama', 2.5, `천적 ${nemesis.k.nickname}, ${nemesis.days}일 연속 ${josa(nemesis.v.nickname, '을', '를')} 쓰러뜨림`, [nemesis.v.userId, nemesis.k.userId]);
  }

  /* ── 길드 ── */
  if (champ.isGuildLeader && champ.guildName) add('master_crowned', 'guild', 1, `${champ.guildName} 길드장 ${cName} 우승`, [champ.userId]);
  if (second && third && champ.guildName && champ.guildName === second.guildName && champ.guildName === third.guildName)
    add('podium_guild_sweep', 'guild', 3, `시상대 3자리 모두 ${champ.guildName}`, [champ.userId, second.userId, third.userId]);
  if (champ.guildName && recordsReady && (h.guildWins.get(champ.guildName) ?? 0) === 0 && (h.guildEntries.get(champ.guildName) ?? 0) >= MIN_BATTLES_FOR_RECORDS)
    add('guild_first_win', 'guild', 2.5, `${cName}, 길드 ${champ.guildName}의 첫 챔피언`, [champ.userId]);

  /* ── 신규·성장 ── */
  for (const p of byRank) {
    if (p.rank > 10) break;
    const s = statsOf(h, p.userId);
    if (s.entries === 0 && p.rank > 1) {
      if (p.rank <= 3) add('debut_podium', 'growth', 3, `${p.nickname}, 첫 참가에 ${p.rank}위`, [p.userId]);
      else add('debut_top10', 'growth', 2, `${p.nickname}, 첫 참가에 ${p.rank}위`, [p.userId]);
      break;
    }
  }
  for (const p of byRank) {
    if (p.rank > 10) break;
    const s = statsOf(h, p.userId);
    if (s.entries > 0 && p.accountAgeDays != null && p.accountAgeDays <= 7) { add('newbie_top10', 'growth', 2, `가입 ${p.accountAgeDays + 1}일차 ${p.nickname}, ${p.rank}위`, [p.userId]); break; }
  }

  /* ── 10-04 신규: 꾸준함·이정표 ── */
  {
    // 연속 Top10 — 가장 긴 1명. 우승자는 우승 줄이 따로 있어 제외.
    let best: { p: HeadlineParticipant; days: number } | null = null;
    for (const p of byRank) {
      if (p.rank > 10) break;
      if (p.rank === 1) continue;
      const days = (yesterdayIsPrev ? h.top10Streak.get(p.userId) ?? 0 : 0) + 1;
      if (days >= 3 && (!best || days > best.days)) best = { p, days };
    }
    if (best) add('top10_streak', 'record', 2.4 + Math.min(0.8, best.days * 0.08), `${best.p.nickname}, ${best.days}일 연속 Top10(오늘 ${best.p.rank}위)`, [best.p.userId]);
  }
  for (const p of byRank) {
    if (p.rank > 3) break;
    const before = statsOf(h, p.userId).podiums;
    if (PODIUM_MILESTONES.includes(before + 1)) { add('podium_milestone', 'record', 2.5, `${p.nickname}, 통산 ${before + 1}번째 시상대(${p.rank}위)`, [p.userId]); break; }
  }
  for (const p of byRank) {
    if (p.rank > 10) break;
    if (p.rank === 1) continue;
    const s = statsOf(h, p.userId);
    if (s.entries >= 5 && s.bestRank != null && p.rank < s.bestRank) {
      add('personal_best', 'growth', 2.4 + (p.rank <= 3 ? 0.3 : 0), `${p.nickname}, ${s.entries + 1}번째 참가에서 개인 최고 ${p.rank}위`, [p.userId]);
      break;
    }
  }

  return { candidates: out, picks: pickHeadlines(out, h) };
}

/** 자동 선택 — 점수순 탐욕. 같은 주인공·같은 분류 중복 금지, 어제 쓴 종류 감점, 3개 기본·희귀(≥3)면 4개. */
export function pickHeadlines(cands: readonly Headline[], h: HeadlineHistory): Headline[] {
  // 어제 쓴 종류 −0.7, 어제 주인공이 또 나오면 −0.5(기록·통산은 어제 주인공이라도 그대로 — 기록은 기록이니까).
  const scored = cands
    .map((c) => ({
      c,
      s:
        c.score -
        (h.usedYesterdayCodes.has(c.code) ? 0.7 : 0) -
        (c.category !== 'record' && c.subjects.some((u) => h.usedYesterdaySubjects.has(u)) ? 0.5 : 0),
    }))
    .sort((a, b) => b.s - a.s);
  const picks: Headline[] = [];
  const usedSubjects = new Set<string>();
  const usedCats = new Set<HeadlineCategory>();
  const usedCodes = new Set<string>();
  const tryPick = (relaxCat: boolean) => {
    for (const { c, s } of scored) {
      if (picks.includes(c) || usedCodes.has(c.code)) continue;
      if (picks.length >= 4) break;
      if (picks.length >= 3 && s < 3) break;
      if (c.subjects.some((u) => usedSubjects.has(u))) continue;
      if (!relaxCat && usedCats.has(c.category)) continue;
      picks.push(c);
      c.subjects.forEach((u) => usedSubjects.add(u));
      usedCats.add(c.category);
      usedCodes.add(c.code);
    }
  };
  tryPick(false);
  if (picks.length < 3) tryPick(true);
  return picks;
}

/** 오늘 배틀을 이력에 더한다(다음 날 생성용). DB 누적표 갱신과 같은 규칙 — 하루치만 증분. */
export function applyBattleToHistory(h: HeadlineHistory, b: HeadlineBattle, parts: readonly HeadlineParticipant[], picks: readonly Headline[]): void {
  const byId = new Map(parts.map((p) => [p.userId, p]));
  const killsCount = new Map<string, number>();
  for (const p of parts) if (p.killerUserId && byId.has(p.killerUserId)) killsCount.set(p.killerUserId, (killsCount.get(p.killerUserId) ?? 0) + 1);
  const wasYesterday = h.yesterday?.date === prevDay(b.date);
  const guildsToday = new Set<string>();
  for (const p of parts) {
    const s = statsOf(h, p.userId);
    const k = killsCount.get(p.userId) ?? 0;
    const next: UserStats = {
      ...s,
      entries: s.entries + 1,
      kills: s.kills + k,
      attacks: s.attacks + p.attackCount,
      defenses: s.defenses + p.defenseCount,
      bestRank: s.bestRank == null ? p.rank : Math.min(s.bestRank, p.rank),
      podiums: s.podiums + (p.rank <= 3 ? 1 : 0),
      seconds: s.seconds + (p.rank === 2 ? 1 : 0),
    };
    if (p.rank === 1) {
      next.wins = s.wins + 1;
      next.winStreak = wasYesterday && h.yesterday!.championUserId === p.userId ? s.winStreak + 1 : 1;
      next.lastWinDate = b.date;
    }
    h.stats.set(p.userId, next);
    h.records.maxAttacks = Math.max(h.records.maxAttacks, p.attackCount);
    h.records.maxDefenses = Math.max(h.records.maxDefenses, p.defenseCount);
    h.records.maxKills = Math.max(h.records.maxKills, k);
    if (p.guildName) guildsToday.add(p.guildName);
  }
  for (const g of guildsToday) h.guildEntries.set(g, (h.guildEntries.get(g) ?? 0) + 1);
  const champ = byId.get(b.championUserId);
  if (champ?.guildName) h.guildWins.set(champ.guildName, (h.guildWins.get(champ.guildName) ?? 0) + 1);

  const pairNext = new Map<string, number>();
  const skNext = new Map<string, { killer: string; days: number }>();
  const killerOf = new Map<string, string>();
  for (const p of parts) {
    if (!p.killerUserId || !byId.has(p.killerUserId)) continue;
    killerOf.set(p.userId, p.killerUserId);
    const key = pairKey(p.userId, p.killerUserId);
    pairNext.set(key, (wasYesterday ? h.pairStreak.get(key) ?? 0 : 0) + 1);
    const prev = wasYesterday ? h.sameKillerStreak.get(p.userId) : undefined;
    skNext.set(p.userId, { killer: p.killerUserId, days: prev && prev.killer === p.killerUserId ? prev.days + 1 : 1 });
  }
  h.pairStreak = pairNext;
  h.sameKillerStreak = skNext;
  const t10 = new Map<string, number>();
  for (const p of parts) if (p.rank <= 10) t10.set(p.userId, (wasYesterday ? h.top10Streak.get(p.userId) ?? 0 : 0) + 1);
  h.top10Streak = t10;
  const podium = [...parts].sort((a, c) => a.rank - c.rank).slice(0, 3).map((p) => p.userId);
  h.yesterday = { date: b.date, championUserId: b.championUserId, ranks: new Map(parts.map((p) => [p.userId, p.rank])), killerOf, podium };
  h.usedYesterdayCodes = new Set(picks.map((p) => p.code));
  h.usedYesterdaySubjects = new Set(picks.flatMap((p) => p.subjects));
  h.battlesBefore += 1;
}
