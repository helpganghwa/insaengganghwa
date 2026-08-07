import { NextResponse } from 'next/server';

import { sendWhisperCore } from '@/lib/game/chat/whisper';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 귓속말 전송(0155) — 채팅 전송과 같은 이유로 서버 액션이 아닌 순수 JSON 라우트다.
 * 액션이면 응답에 현재 라우트(layout 포함) 재렌더가 동봉돼 전송마다 loadLayoutData가 따라붙는데,
 * 대화 화면은 낙관 렌더+브로드캐스트로 갱신되므로 revalidate가 필요 없다.
 * 세션·밴·킬스위치·제재·리밋·필터·차단 검증은 전부 sendWhisperCore 안.
 */
export async function POST(req: Request) {
  let peerUserId = '';
  let body = '';
  try {
    const b = (await req.json()) as { peerUserId?: unknown; body?: unknown };
    peerUserId = typeof b.peerUserId === 'string' ? b.peerUserId : '';
    body = typeof b.body === 'string' ? b.body : '';
  } catch {
    return NextResponse.json({ status: 'error', message: '잘못된 요청입니다.' }, { status: 400 });
  }
  return NextResponse.json(await sendWhisperCore(peerUserId, body));
}
