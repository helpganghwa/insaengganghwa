/**
 * 프로필 e2e — actions.ts session 우회로 jobs INSERT → enqueue → 폴링 → 결과 확인.
 * 실행: bun --conditions=react-server run scripts/_test-profile-e2e.ts
 *
 * 1. 본인 장착 3슬롯 자동 조회 → composeDescription
 * 2. 다이아 escrow 차감 + jobs queued INSERT (actions.ts 동일 로직, session 빼고)
 * 3. enqueueOnePixellab() 직접 호출 → status=downloading
 * 4. pollAndProcessDownloading() 폴링 루프 (30s 간격, 12분 max)
 * 5. 결과: jobs status·우편함·user_profiles·storage 확인
 */
import { config } from 'dotenv';
import { and, eq, isNotNull, sql } from 'drizzle-orm';

config({ path: '.env.local' });

const USER_ID = 'e30b881b-0ad6-45cc-b468-a0b4073fbf3f';

const OPTS = {
  gender: 'female' as const,
  hairColor: 'pink' as const,
  hairStyle: 'long_loose' as const,
  expression: 'gentle_smile' as const,
  pose: 'standing_naturally' as const,
};

async function main() {
  const { db } = await import('../lib/db/client');
  const { profileGenerationJobs, userProfiles } = await import('../lib/db/schema/avatar');
  const { catalogItems, equipmentInstances } = await import('../lib/db/schema/equipment');
  const { profiles } = await import('../lib/db/schema/profiles');
  const { mailbox } = await import('../lib/db/schema/mailbox');
  const { PROFILE_GENERATION_DIAMOND } = await import('../lib/game/balance');
  const { composeEditDescription } = await import('../lib/game/profile/compose');
  const { enqueueOnePixellab, pollAndProcessDownloading } = await import('../lib/game/profile/pipeline');

  console.log('[e2e] step 1 — 본인 장착 + 다이아 확인');
  const equipped = await db
    .select({ slot: equipmentInstances.equippedSlot, code: catalogItems.code })
    .from(equipmentInstances)
    .innerJoin(catalogItems, eq(equipmentInstances.catalogItemId, catalogItems.id))
    .where(and(eq(equipmentInstances.userId, USER_ID), isNotNull(equipmentInstances.equippedSlot)));

  const bySlot = new Map(equipped.map((e) => [e.slot ?? '', e.code]));
  const weaponKey = bySlot.get('weapon');
  const armorKey = bySlot.get('armor');
  const accessoryKey = bySlot.get('accessory');
  if (!weaponKey || !armorKey || !accessoryKey) {
    console.error('  NO_EQUIPMENT', { weaponKey, armorKey, accessoryKey });
    process.exit(1);
  }
  console.log('  장착:', { weaponKey, armorKey, accessoryKey });

  const [profile] = await db.select({ diamond: profiles.diamond }).from(profiles).where(eq(profiles.id, USER_ID));
  console.log('  다이아 잔액:', profile?.diamond);

  console.log('\n[e2e] step 2 — jobs queued INSERT (escrow 차감 + 단일 tx)');
  const equipmentSnapshot = { weaponKey, armorKey, accessoryKey };
  const description = composeEditDescription(OPTS, equipmentSnapshot);
  console.log('  description length:', description.length);

  const jobId = await db.transaction(async (tx) => {
    const deducted = await tx
      .update(profiles)
      .set({ diamond: sql`${profiles.diamond} - ${PROFILE_GENERATION_DIAMOND}` })
      .where(and(eq(profiles.id, USER_ID), sql`${profiles.diamond} >= ${PROFILE_GENERATION_DIAMOND}`))
      .returning({ diamond: profiles.diamond });
    if (deducted.length === 0) throw new Error('INSUFFICIENT_DIAMOND');
    console.log('  escrow 차감 후 잔액:', deducted[0]!.diamond);

    const [job] = await tx
      .insert(profileGenerationJobs)
      .values({
        userId: USER_ID,
        descriptionPrompt: description,
        options: OPTS,
        equipmentSnapshot,
        diamondEscrow: BigInt(PROFILE_GENERATION_DIAMOND),
        status: 'queued',
      })
      .returning({ id: profileGenerationJobs.id });
    return job!.id;
  });
  console.log('  jobs id:', jobId);

  console.log('\n[e2e] step 3 — enqueueOnePixellab (status=queued → downloading)');
  const enqRes = await enqueueOnePixellab();
  console.log('  result:', enqRes);
  if (enqRes.kind !== 'enqueued') {
    console.error('  enqueue 실패 — abort');
    process.exit(1);
  }

  console.log('\n[e2e] step 4 — 폴링 루프 (30s 간격, 12분 max)');
  const start = Date.now();
  const MAX_MS = 12 * 60 * 1000;
  while (Date.now() - start < MAX_MS) {
    await new Promise((r) => setTimeout(r, 30_000));
    const [row] = await db
      .select({ status: profileGenerationJobs.status, resolvedAt: profileGenerationJobs.resolvedAt })
      .from(profileGenerationJobs)
      .where(eq(profileGenerationJobs.id, jobId));
    const elapsed = ((Date.now() - start) / 1000).toFixed(0) + 's';
    console.log(`  [${elapsed}] status=${row?.status}`);
    if (row?.status === 'downloading') {
      const r = await pollAndProcessDownloading(5);
      console.log(`    poll:`, r);
    }
    if (row && row.status !== 'queued' && row.status !== 'downloading' && row.status !== 'ai_reviewing') {
      console.log('\n[e2e] step 5 — 최종 검증');
      const [final] = await db
        .select()
        .from(profileGenerationJobs)
        .where(eq(profileGenerationJobs.id, jobId));
      console.log('  jobs final:', {
        status: final?.status,
        aiVerdict: final?.aiVerdict,
        rejectReason: final?.rejectReason?.slice(0, 200),
        userProfileId: final?.userProfileId,
        resolvedAt: final?.resolvedAt,
      });

      const [postProfile] = await db
        .select({ diamond: profiles.diamond, activeProfileId: profiles.activeProfileId })
        .from(profiles)
        .where(eq(profiles.id, USER_ID));
      console.log('  profile after:', postProfile);

      if (final?.userProfileId) {
        const [created] = await db
          .select({ rotations: userProfiles.rotations, activeDirection: userProfiles.activeDirection })
          .from(userProfiles)
          .where(eq(userProfiles.id, final.userProfileId));
        console.log('  user_profiles:', created);
      }

      const mails = await db
        .select({ type: mailbox.type, title: mailbox.title, body: mailbox.body })
        .from(mailbox)
        .where(and(eq(mailbox.userId, USER_ID), sql`${mailbox.type}::text LIKE 'profile_%'`))
        .orderBy(sql`${mailbox.id} DESC`)
        .limit(3);
      console.log('  mailbox recent:', mails);

      process.exit(0);
    }
  }
  console.error('\n[e2e] timeout 12분 초과');
  process.exit(1);
}

main().catch((e) => {
  console.error('[e2e] FATAL:', e);
  process.exit(1);
});
