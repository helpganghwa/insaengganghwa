import { and, desc, eq, inArray } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { avatarReturnRequests } from '@/lib/db/schema/avatar';
import { characters } from '@/lib/db/schema/server';
import { profiles } from '@/lib/db/schema/profiles';

import { AdminReturnActions } from './AdminReturnActions';
import { ServerBadge } from '../ServerBadge';

const REASON_LABEL: Record<string, string> = {
  equipment_mismatch: '장비 미반영',
  quality: '결과 불만족',
  etc: '기타',
};

function fmt(d: Date): string {
  return d.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false });
}

/** 아바타 반환 검토 큐 — 아바타는 이미 회수됨, 지급액(전액/절반)만 판정한다. */
export default async function AdminAvatarReturnsPage() {
  // 진입 가드는 (admin)/layout.tsx 일원화.
  const pendingRows = await db
    .select({
      id: avatarReturnRequests.id,
      userId: avatarReturnRequests.userId,
      serverId: avatarReturnRequests.serverId,
      reason: avatarReturnRequests.reason,
      spriteUrl: avatarReturnRequests.spriteUrl,
      equipmentSnapshot: avatarReturnRequests.equipmentSnapshot,
      paidDiamond: avatarReturnRequests.paidDiamond,
      createdAt: avatarReturnRequests.createdAt,
      code: profiles.publicCode,
    })
    .from(avatarReturnRequests)
    .innerJoin(profiles, eq(profiles.id, avatarReturnRequests.userId))
    .where(eq(avatarReturnRequests.status, 'pending'))
    .orderBy(avatarReturnRequests.createdAt);

  // 닉네임 — 해당 서버 캐릭터.
  const keys = pendingRows.map((r) => r.userId);
  const nicks = keys.length
    ? await db
        .select({ userId: characters.userId, serverId: characters.serverId, nickname: characters.nickname })
        .from(characters)
        .where(inArray(characters.userId, keys))
    : [];
  const nickOf = (u: string, s: number) =>
    nicks.find((n) => n.userId === u && n.serverId === s)?.nickname ?? '(닉네임 없음)';

  const recent = await db
    .select({
      id: avatarReturnRequests.id,
      status: avatarReturnRequests.status,
      refundDiamond: avatarReturnRequests.refundDiamond,
      decidedAt: avatarReturnRequests.decidedAt,
      spriteUrl: avatarReturnRequests.spriteUrl,
      serverId: avatarReturnRequests.serverId,
    })
    .from(avatarReturnRequests)
    .where(and(inArray(avatarReturnRequests.status, ['paid_full', 'paid_half'])))
    .orderBy(desc(avatarReturnRequests.decidedAt))
    .limit(20);

  return (
    <div className="space-y-6 p-4">
      <h1 className="text-lg font-bold text-white">아바타 반환 검토 ({pendingRows.length})</h1>
      <p className="text-xs text-zinc-400">
        아바타는 신청 시 이미 회수되었습니다. 스냅샷을 보고 <b>전액</b>(생성 결과 하자 — 장비 미반영·심각한 품질 문제)
        또는 <b>절반</b>(단순 변심 등)을 판정하면 우편으로 지급됩니다. 기준 금액은 실지불액입니다.
      </p>

      {pendingRows.length === 0 ? (
        <div className="rounded-lg border border-zinc-800 p-6 text-center text-sm text-zinc-500">대기 중인 반환 신청이 없습니다.</div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {pendingRows.map((r) => {
            const eq3 = (r.equipmentSnapshot ?? {}) as Record<string, string>;
            return (
              <div key={String(r.id)} className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                <div className="flex gap-3">
                  <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded bg-zinc-900">
                    {r.spriteUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.spriteUrl} alt="반환 아바타" className="h-full w-full object-contain" style={{ imageRendering: 'pixelated' }} />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1 text-xs text-zinc-300">
                    <div className="flex items-center gap-1.5 font-bold text-white">
                      {nickOf(r.userId, r.serverId)} <ServerBadge serverId={r.serverId} />
                    </div>
                    <div className="text-zinc-500">{r.code}</div>
                    <div className="mt-1">
                      사유: <b>{REASON_LABEL[r.reason] ?? r.reason}</b>
                    </div>
                    <div>지불: 💎{Number(r.paidDiamond).toLocaleString('ko-KR')}</div>
                    <div className="truncate text-zinc-500">
                      {[eq3.weaponKey, eq3.armorKey, eq3.accessoryKey].filter(Boolean).join(' · ') || '장비 정보 없음'}
                    </div>
                    <div className="text-zinc-600">{fmt(r.createdAt)}</div>
                  </div>
                </div>
                <div className="mt-2">
                  <AdminReturnActions requestId={String(r.id)} paid={Number(r.paidDiamond)} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div>
        <h2 className="mb-2 text-sm font-bold text-zinc-300">최근 처리 20건</h2>
        <div className="flex flex-wrap gap-2">
          {recent.map((r) => (
            <div key={String(r.id)} className="flex items-center gap-2 rounded border border-zinc-800 px-2 py-1 text-[11px] text-zinc-400">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={r.spriteUrl} alt="" className="h-8 w-8 object-contain" style={{ imageRendering: 'pixelated' }} />
              <span>{r.status === 'paid_full' ? '전액' : '절반'} 💎{Number(r.refundDiamond ?? 0).toLocaleString('ko-KR')}</span>
              <span className="text-zinc-600">{r.decidedAt ? fmt(r.decidedAt) : ''}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
