import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, eq } from 'drizzle-orm';

import { getSessionUserId } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { userProfiles } from '@/lib/db/schema/avatar';
import { profiles } from '@/lib/db/schema/profiles';

import { ProfileDetail, type ProfileOptionsView } from './ProfileDetail';

export default async function ProfileDetailPage({
  params,
}: {
  params: Promise<{ profileId: string }>;
}) {
  const { profileId } = await params;
  const userId = await getSessionUserId();
  if (!userId) return null;

  const [row] = await db
    .select({
      id: userProfiles.id,
      rotations: userProfiles.rotations,
      activeDirection: userProfiles.activeDirection,
      options: userProfiles.options,
    })
    .from(userProfiles)
    .where(and(eq(userProfiles.id, profileId), eq(userProfiles.userId, userId)))
    .limit(1);
  if (!row) notFound();

  const [p] = await db
    .select({ activeProfileId: profiles.activeProfileId })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);

  return (
    <div className="space-y-4 px-4 py-6">
      <header className="flex items-center gap-2">
        <Link href="/me" aria-label="뒤로" className="text-zinc-400">
          ‹
        </Link>
        <h1 className="text-lg font-bold">프로필 상세</h1>
      </header>

      <ProfileDetail
        profileId={row.id}
        rotations={row.rotations as Record<string, string>}
        initialDirection={row.activeDirection}
        isActive={p?.activeProfileId === row.id}
        options={row.options as ProfileOptionsView}
      />
    </div>
  );
}
