/**
 * 연대기 전수 검증 — 1일부터 N일까지 연속 재생해도 틀린 표기·누락 연출이 없는지 확인한다.
 *
 * 검사 항목
 *  1) {z|이름}  — 존재하지 않는 구역명(구역 개명 후 옛 기록이 지도와 어긋남 → 색·연출 유실)
 *  2) {g|이름|id} — id 누락(2필드 잔존) / 해산 센티널(0) / 현존 id의 현재 이름과 표기 불일치
 *  3) {u|닉|코드} — 코드 없는 2필드 / 존재하지 않는 publicCode(탈퇴)
 *  4) guild_refs  — 미채움 / 그날 등장 길드 미포함(리플레이가 실시간 폴백으로 떨어짐)
 *  5) 마커 밖 평문에 남은 구역명(참고 — 비유 표현이면 오탐)
 *
 * 사용: bun run scripts/audit-chronicle.ts [PROD_DATABASE_URL]
 */
import postgres from 'postgres';

const envKey = process.argv[2] ?? 'DATABASE_URL';
const url = process.env[envKey];
if (!url) throw new Error(`${envKey} 미설정`);
console.log(`[audit] 대상 = ${envKey}\n`);

const sql = postgres(url, { max: 2, prepare: false });

const zoneRows = (await sql`select id, server_id, name from zones`) as unknown as {
  id: number;
  server_id: number;
  name: string;
}[];
const zoneNameById = new Map<number, string>(zoneRows.map((z) => [Number(z.id), z.name]));
const zoneByServer = new Map<number, Set<string>>();
for (const z of zoneRows) {
  if (!zoneByServer.has(z.server_id)) zoneByServer.set(z.server_id, new Set());
  zoneByServer.get(z.server_id)!.add(z.name);
}

const guildRows = (await sql`select id, server_id, name from guilds`) as unknown as {
  id: string;
  server_id: number;
  name: string;
}[];
const guildNameById = new Map<number, string>(guildRows.map((g) => [Number(g.id), g.name]));

const codeRows = (await sql`select public_code from profiles where public_code is not null`) as unknown as {
  public_code: string;
}[];
const codes = new Set(codeRows.map((c) => c.public_code));

const rows = (await sql`
  select server_id, kst_day::text d, today_text, headline, guild_refs
    from world_chronicle order by server_id, kst_day
`) as unknown as {
  server_id: number;
  d: string;
  today_text: string;
  headline: string;
  guild_refs: { id: number; name: string }[] | null;
}[];

type Issue = { day: string; kind: string; detail: string };
const issues: Issue[] = [];
const TOKEN = /\{([guz])\|([^}|]+)(?:\|([^}]*))?\}/g;

for (const r of rows) {
  const text = `${r.today_text}\n${r.headline}`;
  const zones = zoneByServer.get(r.server_id) ?? new Set<string>();
  const refIds = new Set((r.guild_refs ?? []).map((x) => x.id));
  const seenGuildIds = new Set<number>();

  for (const m of text.matchAll(TOKEN)) {
    const [, kind, name, third] = m as unknown as [string, string, string, string | undefined];
    if (kind === 'z') {
      if (third === undefined) {
        issues.push({ day: r.d, kind: 'zone-no-id', detail: name });
      } else {
        const zid = Number(third);
        const cur = zoneNameById.get(zid);
        if (!Number.isInteger(zid) || cur === undefined) {
          issues.push({ day: r.d, kind: 'zone-id-gone', detail: `${name}|${third}` });
        }
        // 표기 != 현재 이름은 정상(개명 — 렌더가 현재 이름으로 해소한다).
      }
      if (third === undefined && !zones.has(name)) {
        issues.push({ day: r.d, kind: 'zone-missing', detail: name });
      }
    } else if (kind === 'g') {
      if (third === undefined) {
        issues.push({ day: r.d, kind: 'guild-no-id', detail: name });
        continue;
      }
      const gid = Number(third);
      if (!Number.isInteger(gid)) {
        issues.push({ day: r.d, kind: 'guild-bad-id', detail: `${name}|${third}` });
        continue;
      }
      if (gid === 0) continue; // 해산 센티널 — 의도된 값
      seenGuildIds.add(gid);
      const cur = guildNameById.get(gid);
      if (cur === undefined) {
        // 해산 후 id가 사라진 경우 — 표기는 그날 이름이 남아 정확하다(정보성).
        issues.push({ day: r.d, kind: 'guild-gone', detail: `${name}(id=${gid})` });
      } else if (cur !== name) {
        issues.push({ day: r.d, kind: 'guild-name-drift', detail: `${name} → 현재 ${cur}(id=${gid})` });
      }
      if (!refIds.has(gid)) {
        issues.push({ day: r.d, kind: 'ref-missing', detail: `${name}(id=${gid})` });
      }
    } else if (kind === 'u') {
      if (!third) issues.push({ day: r.d, kind: 'user-no-code', detail: name });
      else if (!codes.has(third)) issues.push({ day: r.d, kind: 'user-code-gone', detail: `${name}(${third})` });
    }
  }

  if (r.guild_refs == null) issues.push({ day: r.d, kind: 'refs-null', detail: '스냅샷 미채움' });

  // 마커 밖 평문에 구역명이 남았는지(마킹 누락) — 길드명은 지역명·일반어와 겹칠 수 있어 구역만.
  const plain = text.split(/\{[guz]\|[^}]+\}/g).join('');
  for (const zn of zones) {
    if (zn.length >= 2 && plain.includes(zn)) {
      issues.push({ day: r.d, kind: 'zone-unmarked(참고)', detail: zn });
    }
  }
}

console.log(`검사 연대기 ${rows.length}행 · 구역 ${zoneRows.length} · 길드 ${guildRows.length}\n`);
if (issues.length === 0) {
  console.log('✅ 문제 없음 — 전 기록일이 정합.');
} else {
  const byKind = new Map<string, Issue[]>();
  for (const i of issues) {
    if (!byKind.has(i.kind)) byKind.set(i.kind, []);
    byKind.get(i.kind)!.push(i);
  }
  for (const [kind, list] of byKind) {
    console.log(`■ ${kind} — ${list.length}건`);
    for (const i of list.slice(0, 12)) console.log(`   ${i.day}  ${i.detail}`);
    if (list.length > 12) console.log(`   … 외 ${list.length - 12}건`);
    console.log('');
  }
}

await sql.end();
