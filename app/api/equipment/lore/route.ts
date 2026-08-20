/**
 * 장비 로어 lazy 조회 — 인벤토리가 보유 전 종 로어 전문(45~60KB)을 RSC로 싣던 것을
 * 상세 시트 열람 시 1건 조회로(감사 C 오버패칭). 로어는 정적 상수지만 CATALOG_ITEMS가
 * art 프롬프트까지 물고 있어 클라 번들 직행은 금지(lore.ts 주석) — 라우트로만 노출.
 * 배포마다 바뀔 수 있어 immutable 대신 1시간 CDN 캐시.
 */
import { loreByCode } from '@/lib/game/equipment/lore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const code = new URL(req.url).searchParams.get('code') ?? '';
  if (!/^[a-z0-9_-]{1,80}$/.test(code)) return new Response('bad request', { status: 400 });
  const lore = loreByCode(code);
  return Response.json(
    { lore },
    { headers: { 'cache-control': 'public, s-maxage=3600, stale-while-revalidate=86400' } },
  );
}
