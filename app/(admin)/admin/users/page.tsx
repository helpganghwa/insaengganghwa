import Link from 'next/link';
import { and, desc, eq, isNotNull, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { profiles } from '@/lib/db/schema/profiles';
import { characters } from '@/lib/db/schema/server';
import { userEquipment, catalogItems } from '@/lib/db/schema/equipment';
import { userProfiles } from '@/lib/db/schema/avatar';
import { iapOrders } from '@/lib/db/schema/payment';
import { enhancementJobs } from '@/lib/db/schema/enhance';
import { GEM_TO_MS } from '@/lib/game/balance';
import { kstDateString } from '@/lib/kst';

import { UserModActions } from './UserModActions';
import { CompensateCancelButton } from './CompensateCancelButton';

/**
 * 유저 통합 상세 — 닉네임 검색 → 계정 360도 뷰(캐릭터·지갑·장착·결제·아바타·제재).
 * CS/분쟁 대응의 기본 도구: "다이아가 사라졌다" 문의 시 DB를 직접 뒤지지 않게 한다.
 * 제재는 신고 경유 없이도 이 화면에서 직접(선제 정지 — 결제 어뷰징·매크로).
 */
export const dynamic = 'force-dynamic';

const SLOT_LABEL: Record<string, string> = { weapon: '무기', armor: '방어구', accessory: '장신구' };

function fmtDate(d: Date | null): string {
  return d ? `${kstDateString(d)} ${d.toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false, hour: '2-digit', minute: '2-digit' })}` : '-';
}

/** 닉네임 부분일치 + 유저 코드(#publicCode) 정확일치 통합 검색(2026-07-13 요청). */
async function searchByNickname(q: string) {
  const code = q.replace(/^#/, ''); // '#UY1GToa9' 붙여넣기 지원
  return db
    .select({
      userId: characters.userId,
      serverId: characters.serverId,
      nickname: characters.nickname,
      publicCode: profiles.publicCode,
      bannedAt: profiles.bannedAt,
    })
    .from(characters)
    .innerJoin(profiles, eq(profiles.id, characters.userId))
    .where(
      sql`${characters.nickname} ilike ${'%' + q + '%'} or ${profiles.publicCode} ilike ${code}`,
    )
    .orderBy(characters.nickname)
    .limit(20);
}

async function loadDetail(userId: string) {
  const [profile] = await db
    .select({
      id: profiles.id,
      createdAt: profiles.createdAt,
      lastServerId: profiles.lastServerId,
      bannedAt: profiles.bannedAt,
      banReason: profiles.banReason,
      banUntil: profiles.banUntil,
      isAdmin: profiles.isAdmin,
    })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);
  if (!profile) return null;

  const [chars, equipped, orders, avatarAgg, cancelledJobs] = await Promise.all([
    db
      .select({
        serverId: characters.serverId,
        nickname: characters.nickname,
        diamond: characters.diamond,
        tutorialStep: characters.tutorialStep,
        lastSeenAt: characters.lastSeenAt,
        createdAt: characters.createdAt,
      })
      .from(characters)
      .where(eq(characters.userId, userId))
      .orderBy(characters.serverId),
    db
      .select({
        serverId: userEquipment.serverId,
        slot: userEquipment.equippedSlot,
        name: catalogItems.name,
        enhanceLevel: userEquipment.enhanceLevel,
        transcendLevel: userEquipment.transcendLevel,
        maxEnhanceLevel: userEquipment.maxEnhanceLevel,
      })
      .from(userEquipment)
      .innerJoin(catalogItems, eq(catalogItems.id, userEquipment.catalogItemId))
      .where(and(eq(userEquipment.userId, userId), isNotNull(userEquipment.equippedSlot))),
    db
      .select({
        id: iapOrders.id,
        productCode: iapOrders.productCode,
        amountKrw: iapOrders.amountKrw,
        status: iapOrders.status,
        paidAt: iapOrders.paidAt,
        createdAt: iapOrders.createdAt,
      })
      .from(iapOrders)
      .where(eq(iapOrders.userId, userId))
      .orderBy(desc(iapOrders.createdAt))
      .limit(5),
    db
      .select({
        n: sql<number>`count(*)::int`,
        reports: sql<number>`coalesce(sum(${userProfiles.reportCount}), 0)::int`,
      })
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId)),
    // 강화 취소 이력 — 버그 문의 피해 산정용(0102 이후 cancelled_at 보유분만 시간 측정 가능).
    db
      .select({
        id: enhancementJobs.id,
        slot: enhancementJobs.slot,
        slotLane: enhancementJobs.slotLane,
        fromLevel: enhancementJobs.fromLevel,
        startedAt: enhancementJobs.startedAt,
        cancelledAt: enhancementJobs.cancelledAt,
      })
      .from(enhancementJobs)
      .where(and(eq(enhancementJobs.userId, userId), eq(enhancementJobs.status, 'cancelled')))
      .orderBy(desc(enhancementJobs.createdAt))
      .limit(20),
  ]);
  // 피해 시간(진행 소실) = cancelled_at - started_at. 환산은 보석 단축 공식 환율(1분=1💎).
  const lostMs = cancelledJobs.reduce(
    (s, j) => s + (j.cancelledAt ? Math.max(0, j.cancelledAt.getTime() - j.startedAt.getTime()) : 0),
    0,
  );
  const compDiamond = Math.ceil(lostMs / GEM_TO_MS);
  return {
    profile, chars, equipped, orders,
    avatar: avatarAgg[0] ?? { n: 0, reports: 0 },
    cancelledJobs, lostMs, compDiamond,
  };
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; uid?: string }>;
}) {
  const { q, uid } = await searchParams;
  const results = q && !uid ? await searchByNickname(q.trim()) : [];
  const detail = uid ? await loadDetail(uid) : null;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-6">
      <h1 className="text-xl font-bold">유저 조회</h1>

      <form action="/admin/users" className="flex gap-2">
        <input
          name="q"
          defaultValue={q ?? ''}
          placeholder="닉네임(부분일치) 또는 코드(#UY1GToa9)"
          className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button type="submit" className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">
          검색
        </button>
      </form>

      {q && !detail && (
        <section className="flex flex-col gap-2">
          <p className="text-xs text-zinc-500">{results.length}건 (최대 20)</p>
          {results.map((r) => (
            <Link
              key={`${r.userId}:${r.serverId}`}
              href={`/admin/users?uid=${r.userId}`}
              className="flex items-center justify-between rounded-lg border border-zinc-200 px-3 py-2 text-sm hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
            >
              <span>
                {r.nickname}{' '}
                <span className="font-mono text-xs tabular-nums text-zinc-400">#{r.publicCode}</span>{' '}
                <span className="text-xs text-zinc-400">{r.serverId}서버</span>
              </span>
              {r.bannedAt && <span className="rounded bg-red-100 px-1.5 py-0.5 text-[11px] text-red-700 dark:bg-red-950 dark:text-red-300">정지됨</span>}
            </Link>
          ))}
        </section>
      )}

      {uid && !detail && <p className="text-sm text-red-500">유저를 찾을 수 없습니다: {uid}</p>}

      {detail && (
        <section className="flex flex-col gap-4">
          <div className="rounded-xl border border-zinc-200 p-4 text-sm dark:border-zinc-800">
            <div className="flex items-center justify-between">
              <p className="font-semibold">계정</p>
              {detail.profile.bannedAt ? (
                <span className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
                  정지 중{detail.profile.banUntil ? ` (~${fmtDate(detail.profile.banUntil)})` : ' (영구)'}
                </span>
              ) : (
                <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">정상</span>
              )}
            </div>
            <dl className="mt-2 grid grid-cols-[90px_1fr] gap-y-1 text-xs text-zinc-600 dark:text-zinc-300">
              <dt className="text-zinc-400">userId</dt>
              <dd className="break-all font-mono">{detail.profile.id}</dd>
              <dt className="text-zinc-400">가입일</dt>
              <dd>{fmtDate(detail.profile.createdAt)}</dd>
              <dt className="text-zinc-400">활성 서버</dt>
              <dd>{detail.profile.lastServerId ?? '-'}서버{detail.profile.isAdmin ? ' · 관리자' : ''}</dd>
              {detail.profile.banReason && (
                <>
                  <dt className="text-zinc-400">정지 사유</dt>
                  <dd>{detail.profile.banReason}</dd>
                </>
              )}
              <dt className="text-zinc-400">아바타</dt>
              <dd>
                {detail.avatar.n}개 보유 · 미처리 신고 {detail.avatar.reports}건
                {detail.avatar.reports > 0 && (
                  <Link href="/admin/reports" className="ml-1 underline">신고 페이지</Link>
                )}
              </dd>
            </dl>
          </div>

          {detail.chars.map((c) => {
            const gear = detail.equipped.filter((e) => e.serverId === c.serverId);
            return (
              <div key={c.serverId} className="rounded-xl border border-zinc-200 p-4 text-sm dark:border-zinc-800">
                <p className="font-semibold">
                  {c.serverId}서버 — {c.nickname}
                </p>
                <dl className="mt-2 grid grid-cols-[90px_1fr] gap-y-1 text-xs text-zinc-600 dark:text-zinc-300">
                  <dt className="text-zinc-400">다이아</dt>
                  <dd>💎 {c.diamond.toLocaleString('ko-KR')}</dd>
                  <dt className="text-zinc-400">마지막 활동</dt>
                  <dd>{fmtDate(c.lastSeenAt)}</dd>
                  <dt className="text-zinc-400">장착</dt>
                  <dd>
                    {gear.length === 0
                      ? '없음'
                      : gear.map((g) => (
                          <span key={`${g.serverId}:${g.slot}`} className="mr-2">
                            [{SLOT_LABEL[g.slot ?? ''] ?? g.slot}] {g.name} +{g.enhanceLevel}
                            {g.transcendLevel > 0 ? ` T${g.transcendLevel}` : ''}
                            <span className="text-zinc-400"> (최고 +{g.maxEnhanceLevel})</span>
                          </span>
                        ))}
                  </dd>
                </dl>
              </div>
            );
          })}

          <div className="rounded-xl border border-zinc-200 p-4 text-sm dark:border-zinc-800">
            <p className="font-semibold">최근 결제 {detail.orders.length}건</p>
            {detail.orders.length === 0 ? (
              <p className="mt-1 text-xs text-zinc-400">결제 이력 없음</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-300">
                {detail.orders.map((o) => (
                  <li key={String(o.id)}>
                    {fmtDate(o.paidAt ?? o.createdAt)} · {o.productCode} · ₩{o.amountKrw.toLocaleString('ko-KR')} ·{' '}
                    <span className={o.status === 'refunded' ? 'text-red-500' : ''}>{o.status}</span>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/admin/payments" className="mt-2 inline-block text-xs underline">
              결제 관리로
            </Link>
          </div>

          <div className="rounded-xl border border-zinc-200 p-4 text-sm dark:border-zinc-800">
            <p className="font-semibold">강화 취소 이력 {detail.cancelledJobs.length}건 (최근 20)</p>
            {detail.cancelledJobs.length === 0 ? (
              <p className="mt-1 text-xs text-zinc-400">취소 이력 없음</p>
            ) : (
              <>
                <ul className="mt-2 flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-300">
                  {detail.cancelledJobs.map((j) => (
                    <li key={String(j.id)}>
                      #{String(j.id)} · {SLOT_LABEL[j.slot] ?? j.slot}/{j.slotLane} · +{j.fromLevel} 시도 ·{' '}
                      {fmtDate(j.startedAt)} 시작 →{' '}
                      {j.cancelledAt
                        ? `${fmtDate(j.cancelledAt)} 취소 (진행 ${Math.round((j.cancelledAt.getTime() - j.startedAt.getTime()) / 60_000)}분 소실)`
                        : '취소 시각 미기록(0102 이전)'}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 rounded bg-amber-50 px-2 py-1 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                  피해 시간 합계(측정 가능분): <b>{Math.round(detail.lostMs / 60_000)}분</b> → 권장 보상{' '}
                  <b>💎{detail.compDiamond.toLocaleString('ko-KR')}</b> (보석 단축 환율 1분=1💎, §6.2)
                  — 유저 정상 취소가 섞일 수 있으니 문의 내용과 대조 후 우편 발송
                </p>
                <CompensateCancelButton userId={detail.profile.id} diamond={detail.compDiamond} />
              </>
            )}
          </div>

          <UserModActions userId={detail.profile.id} banned={!!detail.profile.bannedAt} />
        </section>
      )}
    </main>
  );
}
