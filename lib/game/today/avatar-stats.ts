import 'server-only';

import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { kstStartOfDay } from '@/lib/kst';
import { CATALOG_ITEMS } from '@/lib/game/equipment/catalog';
import { REGION_FILTER_ORDER, catalogRegionUi } from '@/lib/game/equipment/region-ui';
import { avatarSlotLimit } from '@/lib/game/profile/slots';

/**
 * 나의 인생강화 '전체' 탭 아바타 카드(2026-11-19, 소규모 21 · #618 문의) — 생성에 성공한 아바타(반환한 것 포함)를 센다.
 * 정본은 profile_generation_jobs(성공한 생성 — 아래 SUCCEEDED): user_profiles는 반환하면 지워져 '만든 수'·외형·장비를 셀 수 없다.
 * 외형은 생성 때 **요청한** 값(options.v3Appearance)이라 그림과 다를 수 있다 — 화면도 '많이 나온'으로만 부른다.
 */
export type AvatarRegionCount = { key: string; label: string; color: string; n: number };
export type AvatarStats = {
  made: number;
  own: number;
  slots: number;
  /** 서버에서 아바타를 많이 만든 순위 — 하나도 없으면 null. */
  rank: number | null;
  female: number;
  male: number;
  topEye: { label: string; n: number } | null;
  topHair: { label: string; n: number } | null;
  /** 사용한 장비(3부위)의 지역별 개수 — 세계지도 순, 0개 지역은 뺀다. */
  regions: AvatarRegionCount[];
  topItem: { name: string; n: number } | null;
  kinds: number;
  catalogTotal: number;
  /** 아바타 콘테스트 우승·입상 횟수 — 콘테스트가 아직 없어 0(콘테스트 개발 때 결과 표에서 센다, 11-25 자리 먼저). */
  contestWins: number;
  contestPlaces: number;
};

// 생성 프롬프트의 색 단어(appearance-v3.ts 풀) → 화면 이름. 풀에 없는 값(옛 생성)은 세지 않는다.
const EYE_KO: Record<string, string> = {
  amber: '호박색', 'emerald-green': '에메랄드', 'sapphire-blue': '사파이어', violet: '보라',
  crimson: '진홍', teal: '청록', golden: '금색', 'steel-gray': '잿빛',
};
const HAIR_KO: Record<string, string> = {
  'platinum-blonde': '백금발', silver: '은발', pink: '분홍', lavender: '연보라', 'sky-blue': '하늘색', black: '흑발',
  auburn: '적갈색', white: '백발', 'mint-green': '민트', 'dark-blue': '남색', 'ash-brown': '회갈색', crimson: '진홍',
  platinum: '백금색', 'golden-blond': '금발', 'chestnut-brown': '밤색', 'deep-green': '짙은 초록', indigo: '쪽빛',
};

const CATALOG_BY_KEY = new Map(CATALOG_ITEMS.map((c) => [c.key, c]));

export type AvatarJobRow = {
  gender: string | null;
  eye: string | null;
  hair: string | null;
  keys: (string | null)[];
};

/** 오드아이는 'amber-and-teal heterochromatic (…)' — 두 색을 모두 센다. */
export function eyeColorsOf(raw: string | null): string[] {
  if (!raw) return [];
  return raw.split(' ')[0]!.split('-and-').filter((c) => c in EYE_KO);
}
/** 머리는 '{색} {모양}' — 색 단어는 하이픈으로만 이어져 첫 토막이 색이다. */
export function hairColorOf(raw: string | null): string | null {
  const c = raw?.split(' ')[0];
  return c && c in HAIR_KO ? c : null;
}

function top(counts: Map<string, number>, ko: Record<string, string>): { label: string; n: number } | null {
  let best: [string, number] | null = null;
  for (const e of counts) if (!best || e[1] > best[1]) best = e; // 같으면 먼저 나온 값(순서는 생성순)
  return best ? { label: ko[best[0]] ?? best[0], n: best[1] } : null;
}

/** 순수 집계 — 테스트와 로더가 같이 쓴다. */
export function summarizeAvatarJobs(rows: AvatarJobRow[]): Pick<AvatarStats, 'female' | 'male' | 'topEye' | 'topHair' | 'regions' | 'topItem' | 'kinds'> {
  const eyes = new Map<string, number>();
  const hairs = new Map<string, number>();
  const items = new Map<string, number>();
  const regionN = new Map<string, number>();
  let female = 0;
  let male = 0;
  for (const r of rows) {
    if (r.gender === 'female') female++;
    else if (r.gender === 'male') male++;
    for (const e of eyeColorsOf(r.eye)) eyes.set(e, (eyes.get(e) ?? 0) + 1);
    const h = hairColorOf(r.hair);
    if (h) hairs.set(h, (hairs.get(h) ?? 0) + 1);
    for (const k of r.keys) {
      const c = k ? CATALOG_BY_KEY.get(k) : undefined;
      if (!c) continue;
      items.set(k!, (items.get(k!) ?? 0) + 1);
      const ui = catalogRegionUi(c.region);
      regionN.set(ui.key, (regionN.get(ui.key) ?? 0) + 1);
    }
  }
  const regions: AvatarRegionCount[] = [];
  for (const r of REGION_FILTER_ORDER) {
    const ui = catalogRegionUi(r);
    const n = regionN.get(ui.key) ?? 0;
    if (n > 0 && !regions.some((x) => x.key === ui.key)) regions.push({ ...ui, n });
  }
  let topKey: [string, number] | null = null;
  for (const e of items) if (!topKey || e[1] > topKey[1]) topKey = e;
  return {
    female,
    male,
    topEye: top(eyes, EYE_KO),
    topHair: top(hairs, HAIR_KO),
    regions,
    topItem: topKey ? { name: CATALOG_BY_KEY.get(topKey[0])!.nameKo, n: topKey[1] } : null,
    kinds: items.size,
  };
}

/** 오늘 탭(KST 자정 이후)에서 쓰는 축소판 — 보유·순위·전체 장비 수처럼 '오늘'과 무관한 값은 세지 않는다. */
export async function getTodayAvatarStats(userId: string, serverId: number): Promise<Pick<AvatarStats, 'made' | 'female' | 'male' | 'topEye' | 'topHair' | 'regions' | 'topItem' | 'kinds'>> {
  // 오늘 = 오늘 완성된 것(23:5x 신청·자정 뒤 완성도 오늘 카드에) — 지급(grant)처럼 완성 시각이 없으면 신청 시각.
  const rows = await loadJobs(userId, serverId, sql`${kstStartOfDay().toISOString()}::timestamptz`, 'done');
  return { made: rows.length, ...summarizeAvatarJobs(rows) };
}

/**
 * 성공한 생성 = hasGeneratedCustomAvatar(lib/game/profile/queue.ts)와 같은 기준 — 정상 통과(운영자 회수 제외) 또는 운영자 지급.
 * 회수(reject)는 전액 환불한 '없던 생성'이라 세지 않고, AI 반려 뒤 지급(grant)은 센다.
 */
const SUCCEEDED = sql`((status = 'accepted' and admin_decision is distinct from 'reject') or admin_decision = 'grant')`;
const SUCCEEDED_J = sql`((j.status = 'accepted' and j.admin_decision is distinct from 'reject') or j.admin_decision = 'grant')`;

async function loadJobs(userId: string, serverId: number, since: ReturnType<typeof sql>, at: 'created' | 'done' = 'created'): Promise<AvatarJobRow[]> {
  const atCol = at === 'done' ? sql`coalesce(resolved_at, created_at)` : sql`created_at`;
  const jobs = await db.execute(sql`
    select options->>'gender' as gender,
           options->'v3Appearance'->>'eyeColor' as eye,
           options->'v3Appearance'->>'hair' as hair,
           equipment_snapshot->>'weaponKey' as w, equipment_snapshot->>'armorKey' as a, equipment_snapshot->>'accessoryKey' as x
    from profile_generation_jobs
    where user_id = ${userId}::uuid and server_id = ${serverId} and ${SUCCEEDED} and ${atCol} >= ${since}
    order by id
  `);
  return (jobs as unknown as { gender: string | null; eye: string | null; hair: string | null; w: string | null; a: string | null; x: string | null }[]).map(
    (r) => ({ gender: r.gender, eye: r.eye, hair: r.hair, keys: [r.w, r.a, r.x] }),
  );
}

export async function getAvatarStats(userId: string, serverId: number): Promise<AvatarStats> {
  // 캐릭터 생성 이후만(2서버 규칙 — 탈퇴·재가입으로 옛 기록이 되살아나지 않게).
  const since = sql`(select c.created_at from characters c where c.user_id = ${userId}::uuid and c.server_id = ${serverId})`;
  const [rows, own, rank, total, slots] = await Promise.all([
    loadJobs(userId, serverId, since),
    db.execute(sql`select count(*)::int as n from user_profiles where user_id = ${userId}::uuid and server_id = ${serverId}`),
    // 순위 = 나보다 많이 만든 사람 수 + 1. 서버 전체 집계지만 accepted 행은 수만 건이라 status 인덱스로 충분하다.
    db.execute(sql`
      with per as (
        select j.user_id, count(*) as n from profile_generation_jobs j
        join characters c on c.user_id = j.user_id and c.server_id = j.server_id
        where j.server_id = ${serverId} and ${SUCCEEDED_J} and j.created_at >= c.created_at
        group by j.user_id
      )
      select (select n from per where user_id = ${userId}::uuid)::int as mine,
             (select count(*) from per where n > coalesce((select n from per where user_id = ${userId}::uuid), 0))::int as ahead
    `),
    db.execute(sql`select count(*)::int as n from catalog_items where active`),
    avatarSlotLimit(userId, serverId),
  ]);
  const rk = (rank as unknown as { mine: number | null; ahead: number }[])[0];
  return {
    made: rows.length,
    own: Number((own as unknown as { n: number }[])[0]?.n ?? 0),
    slots,
    rank: rk?.mine ? Number(rk.ahead) + 1 : null,
    catalogTotal: Number((total as unknown as { n: number }[])[0]?.n ?? 0),
    contestWins: 0,
    contestPlaces: 0,
    ...summarizeAvatarJobs(rows),
  };
}
