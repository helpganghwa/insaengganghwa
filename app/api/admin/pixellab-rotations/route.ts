import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';

import { requireAdmin } from '@/lib/auth/require-admin';
import { db } from '@/lib/db/client';
import { profileGenerationJobs } from '@/lib/db/schema/avatar';
import { pixellabKeyByIdx, keyIdxFromOptions } from '@/lib/game/profile/pixellab-keys';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 어드민 아바타 검수 — Pixellab 회전 이미지 지연 조회(2026-07-21).
 * 기존엔 검수 페이지가 렌더 전에 행마다 Pixellab API를 호출(최대 300건, 타임아웃 없음)해
 * 진입이 수 초~수십 초 걸렸다 → 목록은 즉시 뜨고 이미지는 행별로 이 라우트에서 로드.
 */
export async function GET(req: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const jobParam = new URL(req.url).searchParams.get('job');
  if (!jobParam || !/^\d+$/.test(jobParam)) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const [job] = await db
    .select({ charId: profileGenerationJobs.pixellabCharacterId, options: profileGenerationJobs.options })
    .from(profileGenerationJobs)
    .where(eq(profileGenerationJobs.id, BigInt(jobParam)))
    .limit(1);
  if (!job?.charId || !process.env.PIXELLAB_API_KEY) return NextResponse.json({ rotations: {} });
  const key = pixellabKeyByIdx(keyIdxFromOptions(job.options));
  try {
    const r = await fetch(`https://api.pixellab.ai/v2/characters/${job.charId}`, {
      headers: { authorization: `Bearer ${key}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return NextResponse.json({ rotations: {} });
    const j = (await r.json()) as { rotation_urls?: Record<string, string | null> };
    const rotations: Record<string, string> = {};
    for (const [k, v] of Object.entries(j.rotation_urls ?? {})) if (v) rotations[k.replace(/-/g, '_')] = v;
    return NextResponse.json({ rotations });
  } catch {
    return NextResponse.json({ rotations: {} });
  }
}
