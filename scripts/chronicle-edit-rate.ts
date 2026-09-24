/**
 * 연대기 운영자 수정량(2026-09-24, 0216) — AI 생성 원본(generated_text)과 게시본(today_text)을 비교해 날마다
 * 얼마나 고쳤는지 잰다. 프롬프트·모델·검증기 변경 전후를 수치로 비교하려는 도구(읽기 전용).
 *
 * 수정률 = 글자 단위 편집 거리 / 원본 길이(마커는 이름만 남기고 비교 — id 차이는 수정으로 치지 않는다).
 * 사용: DATABASE_URL=<DB> bun run scripts/chronicle-edit-rate.ts [일수=14] [서버=1]
 */
import postgres from 'postgres';

const days = Number(process.argv[2] ?? 14);
const serverId = Number(process.argv[3] ?? 1);
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL 필요');
  process.exit(1);
}

const plain = (s: string) => s.replace(/\{([guz])\|([^}|]+)(?:\|[^}]*)?\}/g, '$2').replace(/\s+/g, ' ').trim();

/** 글자 단위 편집 거리(두 줄 DP) — 본문 2천 자 안팎이라 충분히 빠르다. */
function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length]!;
}

const sql = postgres(url, { prepare: false, max: 1 });
// 읽기 전용 트랜잭션만 쓴다(세션 SET 금지 — 트랜잭션 풀러로 새어 실서비스 쓰기가 막힌 사고가 있었다).
const rows = await sql.begin('read only', (t) => t<{ d: string; gen: string; pub: string; gh: string | null; ph: string }[]>`
  select kst_day::text d, generated_text gen, today_text pub, generated_headline gh, headline ph
  from world_chronicle
  where server_id = ${serverId} and generated_text is not null and kst_day > (now() at time zone 'Asia/Seoul')::date - ${days}::int
  order by kst_day`);
await sql.end();

if (rows.length === 0) {
  console.log('생성 원본이 저장된 날이 없다(0216 적용 뒤 생성된 날부터 잰다).');
  process.exit(0);
}
let sum = 0;
for (const r of rows) {
  const g = plain(r.gen);
  const p = plain(r.pub);
  const rate = g.length ? editDistance(g, p) / g.length : 0;
  sum += rate;
  const hl = (r.gh ?? '') === r.ph ? '제목 그대로' : '제목 수정';
  console.log(`${r.d}  수정률 ${(rate * 100).toFixed(1)}%  (원본 ${g.length}자 → 게시 ${p.length}자)  ${hl}`);
}
console.log(`평균 수정률 ${((sum / rows.length) * 100).toFixed(1)}% · ${rows.length}일`);
