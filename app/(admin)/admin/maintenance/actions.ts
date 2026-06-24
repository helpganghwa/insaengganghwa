'use server';

import { revalidatePath } from 'next/cache';

import { requireAdmin } from '@/lib/auth/require-admin';
import { setSystemMode, type SystemModeValue } from '@/lib/game/system-mode';

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
