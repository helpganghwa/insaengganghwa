/**
 * 공지 본문 lazy 조회 — 홈 목록이 요약(제목만)으로 내려가고(감사 C 오버패칭),
 * 상세 열람 시 여기서 본문을 받는다. 공개 정보(발행 공지)라 세션 불필요,
 * unstable_cache 30s + CDN s-maxage로 홈 공지 클릭 폭주에도 DB 왕복 억제.
 */
import { getPublishedAnnouncementBody } from '@/lib/game/announcement';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const idRaw = new URL(req.url).searchParams.get('id') ?? '';
  if (!/^\d{1,18}$/.test(idRaw)) return new Response('bad request', { status: 400 });
  // string 그대로 전달 — BigInt 인자는 unstable_cache 키 직렬화에서 throw(함수 주석 참조).
  const body = await getPublishedAnnouncementBody(idRaw).catch(() => null);
  if (body === null) return new Response('not found', { status: 404 });
  return Response.json(
    { body },
    { headers: { 'cache-control': 'public, s-maxage=30, stale-while-revalidate=60' } },
  );
}
