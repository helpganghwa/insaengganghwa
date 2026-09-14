import Link from 'next/link';
import { and, desc, eq } from 'drizzle-orm';

import { getSessionUserId } from '@/lib/auth/session';
import { PageHeader } from '@/components/ui/PageHeader';
import { PROFILE_MAX } from '@/lib/game/balance';
import { db } from '@/lib/db/client';
import { characters } from '@/lib/db/schema/server';
import { getActiveServerId } from '@/lib/game/servers';
import { withTimeout } from '@/lib/db/with-timeout';
import { userProfiles } from '@/lib/db/schema/avatar';
import { snapshotEquipment } from '@/lib/game/expedition/engine';

import { ProfileSelector } from './ProfileSelector';

const SLOT_ORDER = { weapon: 0, armor: 1, accessory: 2 } as const;

export default async function ProfileSelectPage() {
  const userId = await getSessionUserId();
  const serverId = await getActiveServerId();
  if (!userId) return null;

  // 콜드 DB 커넥션 hang 시 페이지 무한 대기 방지 — 실패 시 빈 결과로 degrade(2026-05-29).
  const _r = await withTimeout(
    Promise.all([
    db
      .select({
        id: userProfiles.id,
        rotations: userProfiles.rotations,
        options: userProfiles.options,
        equipmentSnapshot: userProfiles.equipmentSnapshot,
      })
      .from(userProfiles)
      .where(and(eq(userProfiles.userId, userId), eq(userProfiles.serverId, serverId)))
      .orderBy(desc(userProfiles.createdAt)),
    db
      .select({ activeProfileId: characters.activeProfileId })
      .from(characters)
      .where(and(eq(characters.userId, userId), eq(characters.serverId, serverId)))
      .limit(1),
    ]),
    3500,
    'me.profiles.page',
  ).catch(() => null);
  const list = _r?.[0] ?? [];
  const p = _r?.[1] ?? [];

  return (
    <>
      <div className="px-4 pb-3 pt-3">
        <PageHeader title="아바타 관리" fallback="/me" kicker={`${list.length} / ${PROFILE_MAX}`} />
      </div>
      <div className="space-y-4 px-4 pb-6">
      {list.length === 0 ? (
        <Link prefetch={false}
          href="/me/create"
          className="flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-zinc-300 py-10 text-center text-zinc-400 dark:border-zinc-700"
        >
          <span className="text-2xl" aria-hidden>
            ✨
          </span>
          <span className="text-xs">첫 아바타 만들기</span>
        </Link>
      ) : (
        <>
          <ProfileSelector
            profiles={list.map((r) => ({
              id: r.id,
              rotations: r.rotations as Record<string, string>,
              // 기본 아바타는 반환 버튼 미노출(2026-09-01) — 서버 가드(DEFAULT_AVATAR)와 이중.
              isDefault: (r.options as { isDefault?: boolean } | null)?.isDefault === true,
              // 생성 당시 착용 장비(2026-09-14, 문의 약속) — 스냅샷은 카탈로그 키만 담고 있어 정적 카탈로그로
              // 이름·부위를 푼다(DB 왕복 없음). 강화 수치는 일부러 넣지 않는다: 스냅샷에 없어서 '지금' 레벨이
              // 되는데, 그러면 "만들 때 +37이었나"로 읽힌다(시안 검토 결정). 기본 아바타는 빈 배열 → 줄 숨김.
              // 부위 순서는 게임 전체와 같게 무기·방어구·장신구로 고정 — 스냅샷 키 순서(armor가 먼저)를 그대로
              // 두면 화면마다 순서가 달라 보인다(로컬 검증에서 확인).
              equipment: snapshotEquipment(r.equipmentSnapshot, new Map())
                .map((e) => ({ key: e.key, slot: e.slot, name: e.name }))
                .sort((a, b) => SLOT_ORDER[a.slot] - SLOT_ORDER[b.slot]),
            }))}
            activeProfileId={p[0]?.activeProfileId ?? null}
          />
          <Link prefetch={false}
            href="/me/create"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-3 text-sm font-bold text-white shadow-md transition active:scale-[0.99]"
          >
            <span aria-hidden>✨</span> 아바타 생성
          </Link>
        </>
      )}
      </div>
    </>
  );
}
