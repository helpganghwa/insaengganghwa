/**
 * 0141 소급(구역) — 기존 연대기의 구역 마커에 구역 id를 부착한다.
 *
 * `{z|이름}` -> `{z|이름|구역id}`. 구역은 '장소'라 개명되면 과거 기록도 현재 이름으로 보여야
 * 지도와 어긋나지 않으므로, id만 달아두면 렌더가 현재 이름으로 해소한다. 리플레이 연출 트리거도
 * 이름 대신 id로 걸려 개명에 끊기지 않는다.
 *
 * 개명 별칭(RENAMED)은 마이그레이션으로 이름이 바뀐 구역의 옛 이름 -> 현재 이름 매핑이다.
 * 이걸 넣지 않으면 옛 기록의 구역 마커가 id를 못 얻어 그 날 연출이 통째로 빠진다.
 *
 * 사용: bun run scripts/backfill-chronicle-zone-ids.ts [PROD_DATABASE_URL] [--dry]
 */
import postgres from 'postgres';

/** 옛 이름 -> 현재 이름. 0135: temple 지역 '잊힌 신전'이 지역명과 겹쳐 '설원 신전'으로 개명. */
const RENAMED: Record<string, string> = { '잊힌 신전': '설원 신전' };

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const envKey = args.find((a) => !a.startsWith('--')) ?? 'DATABASE_URL';
const url = process.env[envKey];
if (!url) throw new Error(`${envKey} 미설정`);
console.log(`[backfill] 대상 = ${envKey}${dry ? ' (dry-run)' : ''}`);

const sql = postgres(url, { max: 2, prepare: false });

const zoneRows = (await sql`select id, server_id, name from zones`) as unknown as {
  id: number;
  server_id: number;
  name: string;
}[];
/** 서버별 이름 -> id. */
const idsByServer = new Map<number, Map<string, number>>();
for (const z of zoneRows) {
  let m = idsByServer.get(z.server_id);
  if (!m) {
    m = new Map<string, number>();
    idsByServer.set(z.server_id, m);
  }
  m.set(z.name, Number(z.id));
}
console.log(`[backfill] 구역 ${zoneRows.length}개 / 서버 ${idsByServer.size}개`);

const rows = (await sql`
  select server_id, kst_day::text d, today_text, headline
    from world_chronicle order by server_id, kst_day
`) as unknown as { server_id: number; d: string; today_text: string; headline: string }[];
console.log(`[backfill] 연대기 ${rows.length}행`);

let touched = 0;
let changedRows = 0;
const unresolved = new Map<string, number>();
const renamedHits = new Map<string, number>();

for (const r of rows) {
  const byName = idsByServer.get(r.server_id) ?? new Map<string, number>();

  const enrich = (s: string) =>
    s.replace(/\{z\|([^}|]+)\}/g, (mm, raw: string) => {
      const name = raw.trim();
      let id = byName.get(name);
      if (id == null) {
        const cur = RENAMED[name];
        if (cur) {
          id = byName.get(cur);
          if (id != null) renamedHits.set(name, (renamedHits.get(name) ?? 0) + 1);
        }
      }
      if (id == null) {
        unresolved.set(name, (unresolved.get(name) ?? 0) + 1);
        return mm; // 사라진 구역 — 이름만 남긴다(연출 없음, 표시만)
      }
      return `{z|${name}|${id}}`;
    });

  const today = enrich(r.today_text);
  const headline = enrich(r.headline);
  const changed = today !== r.today_text || headline !== r.headline;

  if (changed && !dry) {
    await sql`
      update world_chronicle set today_text = ${today}, headline = ${headline}
       where server_id = ${r.server_id} and kst_day = ${r.d}::date
    `;
  }
  touched++;
  if (changed) changedRows++;
}

console.log(`\n[backfill] ${touched}행 검사 · ${changedRows}행 갱신${dry ? ' (미저장)' : ''}`);
if (renamedHits.size > 0) {
  console.log('[backfill] 개명 별칭으로 해소:');
  for (const [n, c] of renamedHits) console.log(`  ${n} -> ${RENAMED[n]} × ${c}`);
}
if (unresolved.size > 0) {
  console.log('[backfill] ⚠ id 미해결(사라진 구역 — RENAMED에 별칭 추가 필요할 수 있음):');
  for (const [n, c] of unresolved) console.log(`  ${n} × ${c}`);
}

await sql.end();
