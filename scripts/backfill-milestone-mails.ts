// 이정표 보상 우편 소급(2026-07-15 1회성) — 기능 배포 전 이미 달성된 이정표를 현재 기록
// 기준으로 정산해 유저·지표당 우편 1통(달성분 합산)으로 지급. 이후 새 돌파는 라이브 훅이 처리.
//   근거 데이터: leaderboard_ranks(sum/combat/raid/melee) · user_equipment(enhance max/transcend max)
//   멱등 가드: 동일 (user, 지표 제목 프리픽스) 우편 존재 시 스킵.
// 실행: bun run scripts/backfill-milestone-mails.ts --db=prod [--confirm]
import { config } from 'dotenv';
import postgres from 'postgres';

config({ path: '.env.local' });

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
const confirm = process.argv.includes('--confirm');
const target = arg('db');
const URL = target === 'prod' ? process.env.PROD_DATABASE_URL : target === 'staging' ? process.env.DATABASE_URL : undefined;
if (!URL) { console.error('--db=staging|prod 필요'); process.exit(1); }
const sql = postgres(URL, { prepare: false, max: 1 });

const fmt = (n: number) => n.toLocaleString('ko-KR');
const kor = (v: number) => v >= 100_000_000 && v % 100_000_000 === 0 ? `${v / 100_000_000}억`
  : v >= 10_000 && v % 10_000 === 0 ? `${fmt(v / 10_000)}만` : fmt(v);
const tier = <T,>(pairs: [number, T][], m: number): T => {
  let out = pairs[0]![1];
  for (const [th, v] of pairs) if (m >= th) out = v;
  return out;
};
const COMBAT_REWARD: [number, number][] = [[1e5, 1_000], [1e6, 5_000], [1e7, 20_000], [1e8, 100_000]];

// 지표별: 현재값 → 달성 이정표 목록·합산 보상·대표(최고) 문구.
function compute(metric: string, value: number): { top: number; diamond: number; boxes: number } | null {
  if (metric === 'enhance') {
    const top = Math.floor(value / 100) * 100;
    if (top < 100) return null;
    let d = 0;
    for (let m = 100; m <= top; m += 100) d += (m / 100) * 500;
    return { top, diamond: d, boxes: 0 };
  }
  if (metric === 'sum') {
    const top = Math.floor(value / 1000) * 1000;
    if (top < 1000) return null;
    return { top, diamond: (top / 1000) * 500, boxes: 0 };
  }
  if (metric === 'combat') {
    if (value < 1e5) return null;
    let top = 1e5, d = 0;
    for (let m = 1e5; m <= value; m *= 10) { top = m; d += tier(COMBAT_REWARD, m); }
    return { top, diamond: d, boxes: 0 };
  }
  if (metric === 'raid') {
    const top = Math.floor(value / 100) * 100;
    if (top < 100) return null;
    return { top, diamond: (top / 100) * 2_000, boxes: 0 };
  }
  if (metric === 'melee') {
    const top = Math.floor(value / 10) * 10;
    if (top < 10) return null;
    return { top, diamond: (top / 10) * 10_000, boxes: 0 };
  }
  if (metric === 'transcend') {
    if (value < 11) return null;
    return { top: value, diamond: 0, boxes: (value - 10) * 30 };
  }
  return null;
}

const TITLE: Record<string, (m: number) => string> = {
  enhance: (m) => `강화 +${fmt(m)} 달성`,
  sum: (m) => `합산 강화 +${fmt(m)} 달성`,
  combat: (m) => `전투력 ${kor(m)} 돌파`,
  raid: (m) => `레이드 처치 ${fmt(m)}회 달성`,
  melee: (m) => `대난투 통산 ${m}승 달성`,
  transcend: (m) => `초월 +${m} 달성`,
};
const BODY: Record<string, (m: number) => string> = {
  enhance: (m) => tier([[100, '망치질이 첫 번째 벽을 넘었습니다. 다음 백 번도 응원합니다.'], [200, '+200 — 이 높이를 아는 대장장이는 많지 않습니다.'], [300, '+300. 당신의 망치 소리가 서버의 기준이 됩니다.'], [400, '이 높이부터는 지도가 없습니다. 망치가 길을 만듭니다.']], m),
  sum: (m) => tier([[1000, '꾸준함이 형태를 갖추기 시작했습니다.'], [2000, '쌓인 망치질이 산이 되어 갑니다.'], [3000, '이쯤이면 습관이 아니라 신념입니다.'], [5000, '이 총합 앞에서는 긴 말이 필요 없습니다.'], [10000, '당신의 일지가 곧 이 서버 강화의 역사입니다.']], m),
  combat: (m) => tier([[1e5, '이름이 알려지기 시작했습니다.'], [1e6, '이제 아무도 당신을 가볍게 보지 못합니다.'], [1e7, '서버가 당신을 기준으로 움직입니다.'], [1e8, '전설은 이렇게 기록됩니다.']], m),
  raid: (m) => tier([[100, '보스들 사이에 소문이 돌기 시작했습니다.'], [200, '보스들이 당신의 이름을 알아봅니다.'], [300, '이제 보스들이 당신을 두려워합니다.']], m),
  melee: (m) => tier([[10, '왕좌가 낯설지 않은 얼굴입니다.'], [20, '대난투가 당신의 이름 앞에 조용해집니다.'], [30, '대난투 — 그 왕좌의 주인입니다.']], m),
  transcend: (m) => tier([[11, '평범함에서 또 한 걸음 멀어졌습니다.'], [13, '이 단계의 장비를 본 사람은 드뭅니다.'], [16, '장비가 전설의 영역에 들어섰습니다.']], m),
};
const RETRO_SUFFIX = ' 지금까지 도달한 이정표 보상을 모아 보내드립니다.';

try {
  // 지표별 현재 기록 수집
  const lb = await sql`select user_id::text uid, server_id, metric, value::bigint v
    from leaderboard_ranks where metric in ('sum','combat','raid','melee')`;
  const eq = await sql`select user_id::text uid, server_id,
      max(enhance_level)::int mx, max(transcend_level)::int tmx
    from user_equipment group by 1, 2`;
  type Grant = { uid: string; serverId: number; metric: string; value: number };
  const grants: Grant[] = [];
  for (const r of lb) grants.push({ uid: r.uid, serverId: r.server_id, metric: r.metric, value: Number(r.v) });
  for (const r of eq) {
    grants.push({ uid: r.uid, serverId: r.server_id, metric: 'enhance', value: r.mx });
    grants.push({ uid: r.uid, serverId: r.server_id, metric: 'transcend', value: r.tmx });
  }

  let planned = 0, skipped = 0, totalD = 0, totalB = 0;
  for (const g of grants) {
    const c = compute(g.metric, g.value);
    if (!c) continue;
    const title = TITLE[g.metric]!(c.top);
    // 멱등 — 같은 유저·같은 제목의 인생강화 우편이 있으면 스킵(재실행 안전)
    const [dup] = await sql`select 1 from mailbox
      where user_id = ${g.uid}::uuid and server_id = ${g.serverId}
        and sender_label = '인생강화' and title = ${title} limit 1`;
    if (dup) { skipped++; continue; }
    planned++; totalD += c.diamond; totalB += c.boxes;
    if (!confirm) continue;
    const payload = c.boxes > 0
      ? { boxes: { weapon: c.boxes / 3, armor: c.boxes / 3, accessory: c.boxes / 3 } }
      : { diamond: c.diamond };
    await sql`insert into mailbox (user_id, server_id, type, title, body, sender_label, payload)
      values (${g.uid}::uuid, ${g.serverId}, 'admin', ${title},
              ${BODY[g.metric]!(c.top) + RETRO_SUFFIX}, '인생강화', ${sql.json(payload)})`;
  }
  console.log(`[${target}] 대상 ${planned}통 (중복 스킵 ${skipped}) · 💎 ${fmt(totalD)} · 📦 ${fmt(totalB)}`);
  console.log(confirm ? '✅ 발송 완료' : '드라이런 — --confirm으로 발송');
} finally { await sql.end(); }
