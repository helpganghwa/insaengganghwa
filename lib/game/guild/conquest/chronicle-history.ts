/**
 * 연대기 사실표용 소유 이력(2026-09-17) — 점령전 결과·방치 중립화·해산을 날짜순으로 다시 재생해
 * "그날 전에 어땠는지"를 코드가 확정한다. 순수 함수(테스트 tests/guild/chronicle-history.test.ts).
 *
 * 왜: 사실표가 '전투 직전 상태'만 알아서 모델이 이력을 지어냈다(09-17 실오류).
 *  - 지역 석권: 오늘 깨지는 석권까지 "이미 성립"으로 넘겨 "슬라임 늪과 드래곤 화산을 차례로 지배, 세 번째 완성"이 나왔다.
 *    실제로는 화산 석권은 전날 깨졌고 늪 석권은 그날 깨졌으며, 왕국은 보름 가까이 쥐었다가 엿새 만에 되찾은 것이었다.
 *  - 복귀: 하루 비었다 돌아온 길드를 "오랫동안 영토를 갖지 못했던"으로 썼다.
 *  - 보유 기간: 엿새 동안 쥐고 있던 구역까지 "어제 차지했던 곳"으로 묶었다.
 *
 * 이력은 DB의 현재 소유와 어긋날 수 있다(수동 복원·초기 데이터). 그래서 호출부는 **전투 직전 상태가
 * 이력 재생 결과와 일치하는 구역·길드에만** 이력 사실을 싣는다(어긋나면 그 사실은 빼고 지어내지 않게).
 */

/** 하루 단위 소유 변화 — 같은 날에는 중립화(해산·방치)를 먼저, 점령전 승자를 나중에 반영한다. */
export type OwnershipEvent = { day: string; zone: string; guild: string | null; kind: 'neutral' | 'battle' };

/** 날짜별 스냅샷(그날 공개 뒤 상태). 변화가 있던 날만 담기고, 그 사이는 앞 스냅샷이 이어진다. */
export type OwnershipSnapshot = { day: string; owners: Map<string, string | null> };

export function replayOwnership(events: OwnershipEvent[]): OwnershipSnapshot[] {
  const byDay = new Map<string, OwnershipEvent[]>();
  for (const e of events) byDay.set(e.day, [...(byDay.get(e.day) ?? []), e]);
  const days = [...byDay.keys()].sort();
  const cur = new Map<string, string | null>();
  const out: OwnershipSnapshot[] = [];
  for (const day of days) {
    const evs = byDay.get(day)!;
    for (const e of evs) if (e.kind === 'neutral') cur.set(e.zone, null);
    for (const e of evs) if (e.kind === 'battle' && e.guild) cur.set(e.zone, e.guild);
    out.push({ day, owners: new Map(cur) });
  }
  return out;
}

/** 두 KST 날짜(YYYY-MM-DD) 사이 일수(b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** 그 날짜 **전날까지**의 마지막 스냅샷(오늘 전투 직전 상태). 없으면 빈 상태. */
export function ownersBefore(snaps: OwnershipSnapshot[], day: string): Map<string, string | null> {
  let last: OwnershipSnapshot | null = null;
  for (const s of snaps) if (s.day < day) last = s;
  return last ? last.owners : new Map();
}

export type SweepPeriod = { region: string; guild: string; from: string; /** 깨진 날(없으면 진행 중). */ brokenOn: string | null };

/**
 * 지역 석권 구간 — 한 길드가 그 지역 구역을 전부 쥐고 있던 날들의 연속 구간.
 * regionZones: 지역 → 구역 이름들. until: 이 날짜 이전 스냅샷까지만 본다(오늘 제외 = 과거 이력).
 */
export function sweepPeriods(snaps: OwnershipSnapshot[], regionZones: Map<string, string[]>, until: string): SweepPeriod[] {
  const out: SweepPeriod[] = [];
  for (const [region, zones] of regionZones) {
    let open: SweepPeriod | null = null;
    for (const s of snaps) {
      if (s.day >= until) break;
      const owners = new Set(zones.map((z) => s.owners.get(z) ?? null));
      const g = owners.size === 1 ? [...owners][0]! : null;
      if (open && open.guild !== g) {
        open.brokenOn = s.day;
        out.push(open);
        open = null;
      }
      if (!open && g) open = { region, guild: g, from: s.day, brokenOn: null };
    }
    if (open) out.push(open);
  }
  return out;
}

/** 길드가 마지막으로 영토를 잃어 0곳이 된 날(그 전날까지는 1곳 이상). 이력에 없으면 null. */
export function lastWipeDay(snaps: OwnershipSnapshot[], guild: string, until: string): string | null {
  let had = false;
  let wipedOn: string | null = null;
  for (const s of snaps) {
    if (s.day >= until) break;
    const n = [...s.owners.values()].filter((o) => o === guild).length;
    if (n > 0) {
      had = true;
      wipedOn = null;
    } else if (had && wipedOn === null) {
      wipedOn = s.day;
    }
  }
  return wipedOn;
}

/** 구역을 그 길드가 끊김 없이 쥐기 시작한 날(오늘 전 스냅샷 기준). 전날 주인이 그 길드가 아니면 null. */
export function holdingSince(snaps: OwnershipSnapshot[], zone: string, guild: string, until: string): string | null {
  let since: string | null = null;
  for (const s of snaps) {
    if (s.day >= until) break;
    if (s.owners.get(zone) === guild) since ??= s.day;
    else since = null;
  }
  return since;
}

/** 'YYYY-MM-DD' → '9월 11일'. */
export function koDate(day: string): string {
  const [, m, d] = day.split('-');
  return `${Number(m)}월 ${Number(d)}일`;
}
