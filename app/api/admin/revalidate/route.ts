import { revalidateTag } from 'next/cache';

import { getAdminStatus } from '@/lib/auth/require-admin';
import { isCronAuthorized } from '@/lib/auth/cron-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 캐시 태그 강제 무효화 — 카탈로그 전환 등 수동 스크립트 후속 절차.
 * 배경(2026-07-07 전수감사): tags:['catalog'] 등이 선언만 되고 revalidateTag 호출처가
 * 0곳이라, 카탈로그 전환 후 확률 공시 페이지가 최대 10분(TTL) 구 데이터를 노출하는
 * 공시-판정 불일치 창(§33)이 있었고 유일한 무효화 수단이 재배포였다.
 * 사용: POST /api/admin/revalidate?tag=catalog — 어드민 세션 또는 CRON_SECRET Bearer.
 *  예) curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://ganghwa.app/api/admin/revalidate?tag=catalog
 */
const ALLOWED_TAGS = ['catalog', 'announcements', 'world-feed'] as const;

export async function POST(req: Request) {
  const { isAdmin } = await getAdminStatus().catch(() => ({ isAdmin: false }));
  if (!isAdmin && !isCronAuthorized(req)) return new Response('forbidden', { status: 403 });

  const tag = new URL(req.url).searchParams.get('tag') ?? '';
  if (!(ALLOWED_TAGS as readonly string[]).includes(tag)) {
    return Response.json({ ok: false, error: 'UNKNOWN_TAG', allowed: ALLOWED_TAGS }, { status: 400 });
  }
  revalidateTag(tag, 'max');
  return Response.json({ ok: true, tag });
}
