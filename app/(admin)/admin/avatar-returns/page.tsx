import { desc, eq, inArray } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { avatarReturnRequests } from '@/lib/db/schema/avatar';
import { characters } from '@/lib/db/schema/server';
import { profiles } from '@/lib/db/schema/profiles';
import { CATALOG_ITEMS } from '@/lib/game/equipment/catalog';
import { spritePath } from '@/lib/game/equipment/sprite-manifest';
import { assetUrl } from '@/lib/asset-versions';

import { AdminReturnActions } from './AdminReturnActions';
import { AdminAvatarViewer } from '../profile-gen/AdminAvatarViewer';
import { ServerBadge } from '../ServerBadge';

const NAME_BY_CODE = new Map(CATALOG_ITEMS.map((c) => [c.key, c.nameKo]));
const eqName = (k?: string) => (k ? (NAME_BY_CODE.get(k) ?? k) : '-');

function fmt(d: Date): string {
  return d.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false });
}

type EqSnap = { weaponKey?: string; armorKey?: string; accessoryKey?: string };

/** 생성 장비 3종 — 아바타 검토 페이지와 동일 표기(스프라이트 + 이름). */
function EquipmentStrip({ eqs }: { eqs: EqSnap }) {
  const keys = [eqs.weaponKey, eqs.armorKey, eqs.accessoryKey];
  return (
    <div className="space-y-1 pt-0.5">
      <div className="flex gap-1.5">
        {keys.map((k, idx) => {
          const p = k ? spritePath(k) : null;
          return (
            <div
              key={idx}
              title={eqName(k)}
              className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md border border-zinc-800 bg-zinc-900/60"
            >
              {p ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={assetUrl(p)} alt={eqName(k)} className="absolute inset-0 h-full w-full object-contain" style={{ imageRendering: 'pixelated' }} />
              ) : (
                <span className="flex h-full items-center justify-center text-[9px] text-zinc-600">-</span>
              )}
            </div>
          );
        })}
      </div>
      <div className="text-[10px] leading-snug text-zinc-400">
        {keys.map((k, idx) => (
          <div key={idx} className="truncate">
            {['⚔️', '🛡️', '💍'][idx]} {eqName(k)}
          </div>
        ))}
      </div>
    </div>
  );
}

/** 아바타 반환 검토 큐 — 아바타는 이미 회수됨, 지급액(전액/절반)만 판정한다. */
export default async function AdminAvatarReturnsPage() {
  // 진입 가드는 (admin)/layout.tsx 일원화.
  const pendingRows = await db
    .select({
      id: avatarReturnRequests.id,
      userId: avatarReturnRequests.userId,
      serverId: avatarReturnRequests.serverId,
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
      equipmentSnapshot: avatarReturnRequests.equipmentSnapshot,
    })
    .from(avatarReturnRequests)
    .where(inArray(avatarReturnRequests.status, ['paid_full', 'paid_half', 'closed']))
    .orderBy(desc(avatarReturnRequests.decidedAt))
    .limit(20);

  return (
    <div className="space-y-6 p-4">
      <h1 className="text-lg font-bold text-white">아바타 반환 검토 ({pendingRows.length})</h1>
      <p className="text-xs text-zinc-400">
        아바타는 신청 시 이미 회수되었습니다. 스프라이트(클릭 확대)와 생성 장비를 보고 <b>전액</b>(생성 결과 하자 — 장비
        미반영·심각한 품질 문제) 또는 <b>절반</b>(그 외)을 판정하면 우편으로 지급됩니다. 기준 금액은 실지불액입니다.
      </p>

      {pendingRows.length === 0 ? (
        <div className="rounded-lg border border-zinc-800 p-6 text-center text-sm text-zinc-500">대기 중인 반환 신청이 없습니다.</div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {pendingRows.map((r) => {
            const eqs = (r.equipmentSnapshot ?? {}) as EqSnap;
            return (
              <div key={String(r.id)} className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                {/* 2분할 — 좌: 아바타 뷰어(확대) / 우: 정보 + 장비 */}
                <div className="flex gap-3">
                  <div className="w-[120px] shrink-0">
                    <AdminAvatarViewer rotations={r.spriteUrl ? { south: r.spriteUrl } : {}} />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1 text-xs text-zinc-300">
                    <div className="flex items-center gap-1.5 text-sm font-bold text-white">
                      <span className="truncate">{nickOf(r.userId, r.serverId)}</span> <ServerBadge serverId={r.serverId} />
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 text-[10px] text-zinc-500">
                      {r.code ? <span className="font-mono text-sky-400">#{r.code}</span> : null}
                      <span>지불 💎{Number(r.paidDiamond).toLocaleString('ko-KR')}</span>
                      <span>#{String(r.id)}</span>
                    </div>
                    <div className="text-[10px] text-zinc-500">{fmt(r.createdAt)}</div>
                    <EquipmentStrip eqs={eqs} />
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
          {recent.map((r) => {
            const eqs = (r.equipmentSnapshot ?? {}) as EqSnap;
            return (
              <div
                key={String(r.id)}
                title={[eqs.weaponKey, eqs.armorKey, eqs.accessoryKey].map((k) => eqName(k)).join(' · ')}
                className="flex items-center gap-2 rounded border border-zinc-800 px-2 py-1 text-[11px] text-zinc-400"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r.spriteUrl} alt="" className="h-8 w-8 object-contain" style={{ imageRendering: 'pixelated' }} />
                <span>{r.status === 'paid_full' ? '전액' : r.status === 'paid_half' ? '절반' : '종결(지급 없음)'} 💎{Number(r.refundDiamond ?? 0).toLocaleString('ko-KR')}</span>
                <span className="text-zinc-600">{r.decidedAt ? fmt(r.decidedAt) : ''}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
