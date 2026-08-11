'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, sql } from 'drizzle-orm';

import { requireAdmin } from '@/lib/auth/require-admin';
import { db } from '@/lib/db/client';
import { conquestBattles } from '@/lib/db/schema/guild';
import { adminActions } from '@/lib/db/schema/ops';
import { runConquest } from '@/lib/game/guild/conquest/run';
import { openServerIds } from '@/lib/game/server-list';
import { setSystemMode, type SystemModeValue } from '@/lib/game/system-mode';
import { kstDateString } from '@/lib/kst';

const MODES: SystemModeValue[] = ['live', 'read_only', 'maintenance', 'emergency_stop'];

/**
 * 점검 모드 전환 — 어드민. untilLocal = datetime-local 값(KST, 'YYYY-MM-DDThh:mm') 또는 ''(무기한).
 * 적용 즉시(이 인스턴스 캐시 갱신), 타 인스턴스는 캐시 TTL(20s) 내 반영.
 */
// datetime-local('YYYY-MM-DDThh:mm', TZ 없음)을 KST(+09:00)로 해석. 빈값=null.
function parseKstLocal(v: string): Date | null | 'invalid' {
  if (!v) return null;
  const d = new Date(`${v}:00+09:00`);
  return Number.isNaN(d.getTime()) ? 'invalid' : d;
}

export async function setMaintenanceAction(
  mode: string,
  startLocal: string,
  untilLocal: string,
  note: string,
): Promise<{ status: 'success' } | { status: 'error'; code: string }> {
  const adminId = await requireAdmin();
  if (!MODES.includes(mode as SystemModeValue)) return { status: 'error', code: 'BAD_MODE' };

  let from: Date | null = null;
  let until: Date | null = null;
  if (mode !== 'live') {
    const f = parseKstLocal(startLocal); // 시작 미지정=즉시(null)
    if (f === 'invalid') return { status: 'error', code: 'BAD_FROM' };
    from = f;
    const u = parseKstLocal(untilLocal); // 종료 미지정=무기한(null)
    if (u === 'invalid') return { status: 'error', code: 'BAD_UNTIL' };
    until = u;
    if (from && until && until.getTime() <= from.getTime()) {
      return { status: 'error', code: 'UNTIL_BEFORE_FROM' };
    }
  }

  await setSystemMode(mode as SystemModeValue, adminId, { from, until, note: note.trim() || null });
  revalidatePath('/admin/maintenance');
  return { status: 'success' };
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 점령전 재정산 — 어드민 수동 복구. 23시 cron(conquest-run)이 실패한 날은 conquest_battles에
 * **행 자체가 안 생겨** 자정 cron의 미공개 백스톱(published_at is null 스캔)에도 안 잡힌다.
 * cron은 battleDay를 실행 시각(오늘 KST)에서 파생하므로 과거 날짜 재실행 수단이 없어,
 * 그날 전투가 영구 유실된다 — 그 유일한 복구 경로가 이 액션이다.
 *
 * ⚠ 공개(revealConquest)는 하지 않는다. 여기서는 conquest_battles에 published_at=NULL로 **산출만**
 * 하고, 소유권 적용·결과 우편·연대기는 자정 cron(conquest-chronicle)의 기존 백스톱이 처리한다.
 * (reveal 자체는 published_at is null 필터로 멱등이라 이중 처리가 나지는 않는다. 부르지 않는
 *  이유는 **공개 시각 계약**이다 — 이 액션은 아무 시각에나 실행되는데 여기서 바로 플립하면
 *  "산출=23시·공개=자정"이 깨지고, 배치 잠금 창(23:00~00:59) 밖에서 소유권이 바뀌어 그 시각에
 *  진행 중인 배치가 stale ownership으로 검증되는 TOCTOU가 열린다.)
 *
 * 재실행은 안전(비파괴) — runConquest는 UNIQUE(zone_id, battle_kst_day) + onConflictDoNothing이라
 * 이미 산출된 구역은 덮어쓰지 않는다. 기존 행 수는 already로 돌려 화면에 표시만 한다.
 */
export async function rerunConquestAction(
  serverId: number,
  battleDay: string,
): Promise<{ status: 'success'; resolved: number; already: number } | { status: 'error'; code: string }> {
  const adminId = await requireAdmin();

  if (!DAY_RE.test(battleDay)) return { status: 'error', code: 'BAD_DAY' };
  // 형식만으론 2026-02-30 같은 실재하지 않는 날을 못 거른다 — KST 자정으로 되짚어 왕복 일치 확인.
  const asDate = new Date(`${battleDay}T00:00:00+09:00`);
  if (Number.isNaN(asDate.getTime()) || kstDateString(asDate) !== battleDay) {
    return { status: 'error', code: 'BAD_DAY' };
  }
  // 오늘은 허용 — 23시 정산이 실패한 당일 재시도가 주 용도. 미래만 차단.
  if (battleDay > kstDateString(new Date())) return { status: 'error', code: 'FUTURE_DAY' };
  // 과거 깊이도 **어제까지**로 닫는다 (2026-08-11). 기존 행은 onConflictDoNothing으로 보존되니 무해하지만,
  // 그날 전투 기록이 **없던** 구역에는 새 행이 생긴다 — 그 행을 자정 백스톱(published_at is null and
  // battle_kst_day <= kstDay)이 그대로 공개해 **현재 소유권을 오래된 승자로 되감을** 수 있다. 게다가
  // 배치는 그 날짜 값인데 전투력은 **현재** 값으로 계산돼 당시 결과와도 다르다. 위 문서화된 용도
  // (23시 정산이 실패한 당일 재시도)는 오늘·어제면 충분해, 닫아도 복구 수단을 해치지 않는다.
  if (battleDay < kstDateString(new Date(Date.now() - 24 * 60 * 60 * 1000))) {
    return { status: 'error', code: 'TOO_OLD_DAY' };
  }

  const openIds = await openServerIds();
  if (!openIds.includes(serverId)) return { status: 'error', code: 'BAD_SERVER' };

  const [existing] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(conquestBattles)
    .where(and(eq(conquestBattles.serverId, serverId), eq(conquestBattles.battleKstDay, battleDay)));
  const already = existing?.n ?? 0;

  const { resolved } = await runConquest(serverId, battleDay);

  // 운영 감사 — 소유권·보상에 영향을 주는 수동 개입이라 누가 어느 서버의 어느 날짜를
  // 되돌렸는지 남긴다(payment.refund.force와 동일한 admin_actions 원장).
  await db.insert(adminActions).values({
    adminUserId: adminId,
    action: 'conquest.rerun',
    targetType: 'conquest_battle_day',
    targetId: `${serverId}:${battleDay}`,
    payload: { serverId, battleDay, resolved, already },
  });

  revalidatePath('/admin/maintenance');
  return { status: 'success', resolved, already };
}
