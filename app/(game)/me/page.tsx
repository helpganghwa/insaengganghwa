import Link from 'next/link';
import { sql } from 'drizzle-orm';

import { getSessionUserId } from '@/lib/auth/session';
import { getActiveServerId } from '@/lib/game/servers';
import { db } from '@/lib/db/client';
import { withTimeout } from '@/lib/db/with-timeout';
import { type Slot } from '@/lib/db/schema/equipment';
import { CharacterStage } from '@/components/CharacterStage';
import { GuildBadge } from '@/components/GuildBadge';
import { combatPowerFromOwned } from '@/lib/game/equipment/combat-power';
import { liberatedItemRanks } from '@/lib/game/codex/ranking';
import { getCatalogMap, completeCatalog } from '@/lib/game/catalog';

import { BoastLauncher } from '@/components/BoastModal';
import { TranscendSprite } from '@/components/TranscendSprite';
import { rarityBorderStyle, hasRarityBorder, TranscendTag } from '@/components/RarityFrame';

import { NicknameEditor } from './NicknameEditor';
import { ReferralSection } from './ReferralSection';
import { INVITE_DIAMOND_PER_REFERRAL, INVITE_BOX_PER_REFERRAL } from '@/lib/game/referral/stats';

const SLOT_LABEL: Record<Slot, string> = { weapon: '무기', armor: '방어구', accessory: '장신구' };
const SLOT_EMOJI: Record<Slot, string> = { weapon: '⚔️', armor: '🛡️', accessory: '💍' };
const MENU = [
  { href: '/friends', icon: '👥', label: '친구' },
  { href: '/me/profiles', icon: '✨', label: '아바타 관리' },
  { href: '/checkin', icon: '⚡', label: '출석 캘린더' },
  { href: '/me/codex', icon: '📖', label: '도감' },
  { href: '/leaderboard', icon: '🏆', label: '랭킹' },
  { href: '/me/settings', icon: '⚙️', label: '설정' },
];

export default async function ProfilePage() {
  const userId = await getSessionUserId();
  const serverId = await getActiveServerId();
  if (!userId) return null;

  // 프로필·장비·아바타·추천수·친구요청수를 **단일 SQL 1왕복**으로(json 동봉). 장비는 보유
  // 전 인스턴스를 한 번만 스캔해 착용분(equippedSlot)을 JS에서 분기(이전: 착용/전체 2회 스캔).
  // liberatedItemRanks(캐시 쿼리)·getCatalogMap(캐시)만 병렬 → 7 DB왕복 → 2.
  // 콜드/hang 시 빈 결과로 degrade(가드, CLAUDE §11.4).
  type MeRow = {
    nickname: string | null;
    public_code: string | null;
    diamond: string | null;
    nickname_changed_count: number | null;
    active_profile_id: string | null;
    guild_emblem_url: string | null;
    guild_name: string | null;
    referral_count: number;
    friend_req_count: number;
    equipment: {
      catalogItemId: number;
      enhanceLevel: number;
      transcendLevel: number;
      equippedSlot: string | null;
    }[];
    avatars: { id: string; rotations: unknown; activeDirection: string }[];
  };
  const _r = await withTimeout(
    Promise.all([
      db.execute(sql`
        select
          p.nickname, p.public_code, c.diamond::text as diamond,
          p.nickname_changed_count, p.active_profile_id,
          g.emblem_url as guild_emblem_url, g.name as guild_name,
          (select count(*)::int from referral_attributions where referrer_user_id = ${userId}::uuid) as referral_count,
          (select count(*)::int from friend_links where status = 'pending' and addressee_id = ${userId}::uuid and server_id = ${serverId}) as friend_req_count,
          coalesce((select json_agg(json_build_object(
              'catalogItemId', catalog_item_id, 'enhanceLevel', enhance_level,
              'transcendLevel', transcend_level, 'equippedSlot', equipped_slot))
            from user_equipment where user_id = ${userId}::uuid), '[]'::json) as equipment,
          coalesce((select json_agg(json_build_object(
              'id', id, 'rotations', rotations, 'activeDirection', active_direction) order by created_at desc)
            from user_profiles where user_id = ${userId}::uuid and hidden_at is null), '[]'::json) as avatars
        from profiles p
          left join characters c on c.user_id = p.id and c.server_id = ${serverId}
          left join guild_members gm on gm.user_id = p.id and gm.server_id = ${serverId}
          left join guilds g on g.id = gm.guild_id
        where p.id = ${userId}::uuid limit 1
      `) as unknown as Promise<MeRow[]>,
      liberatedItemRanks(userId),
      getCatalogMap(),
    ]),
    3500,
    'me.page',
  ).catch(() => null);
  const row = _r?.[0]?.[0] ?? null;
  const libRanks = _r?.[1] ?? new Map<number, number>();
  const catMap = _r?.[2] ?? new Map();

  const allEquipment = row?.equipment ?? [];
  const equippedRaw = allEquipment.filter((e) => e.equippedSlot != null);
  const myProfiles = row?.avatars ?? [];
  const refN = row?.referral_count ?? 0;
  const referralStats = {
    totalReferrals: refN,
    totalDiamondEarned: refN * INVITE_DIAMOND_PER_REFERRAL,
    totalBoxEarned: refN * INVITE_BOX_PER_REFERRAL,
  };
  const friendReqCount = row?.friend_req_count ?? 0;
  await completeCatalog(catMap, equippedRaw.map((e) => e.catalogItemId));

  const nickname = row?.nickname ?? '플레이어';
  const publicCode = row?.public_code ?? '';
  const total = combatPowerFromOwned(allEquipment);
  // 캐시 메타로 착용 아이템에 slot/code/name 결합.
  const equipped = equippedRaw.flatMap((e) => {
    const cat = catMap.get(e.catalogItemId);
    return cat ? [{ ...e, slot: cat.slot, code: cat.code, name: cat.name }] : [];
  });
  const bySlot = new Map(equipped.map((e) => [e.slot, e]));

  const activeProfileId = row?.active_profile_id ?? null;
  const activeProfile = myProfiles.find((p) => p.id === activeProfileId) ?? null;
  const dirImg = (p: { rotations: unknown; activeDirection: string }) =>
    (p.rotations as Record<string, string>)[p.activeDirection];

  return (
    <div className="space-y-4 px-4 py-6">
      {/* 내 정보 카드 — 좌: 닉네임/캐릭터/전투력 · 우: 장비 3종 */}
      <section className="rounded-xl border border-zinc-800 bg-gradient-to-b from-zinc-900 to-zinc-950 p-3">
        <div className="flex items-stretch gap-2">
          {/* 좌(4) — 머리 위 닉네임 + 캐릭터 */}
          <div className="flex basis-2/5 flex-col items-center gap-1">
            <NicknameEditor
              current={nickname}
              changedCount={row?.nickname_changed_count ?? 0}
              diamond={row?.diamond ?? '0'}
              className="relative z-10 text-white text-xs font-normal"
            />
            <GuildBadge
              emblemUrl={row?.guild_emblem_url ?? null}
              name={row?.guild_name ?? null}
              size={14}
              pinEmblemRight
              className="z-10 max-w-full text-[11px] text-white/70"
            />
            {activeProfile ? (
              <Link
                href={`/u/${encodeURIComponent(publicCode)}`}
                aria-label="내 프로필 상세"
                className="block"
              >
                <CharacterStage
                  charSrc={dirImg(activeProfile)}
                  scale={2.0}
                  offsetY={10}
                  className="aspect-[3/4] h-44 overflow-visible"
                />
              </Link>
            ) : (
              <Link
                href="/me/create"
                className="flex aspect-[3/4] h-44 flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-white/25 text-white/60"
              >
                <span className="text-2xl" aria-hidden>✨</span>
                <span className="text-[11px]">생성</span>
              </Link>
            )}
          </div>

          {/* 우(6) — 장비 3종, 좌 높이에 맞춰 stretch */}
          <div className="flex basis-3/5 flex-col gap-1.5">
            {(['weapon', 'armor', 'accessory'] as Slot[]).map((s) => {
              const it = bySlot.get(s);
              if (!it) {
                return (
                  <Link
                    key={s}
                    href={`/inventory?slot=${s}`}
                    className="flex flex-1 items-center gap-2 rounded-xl border border-dashed border-white/15 bg-white/[0.02] px-2 text-white/45"
                  >
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white/5 text-lg" aria-hidden>
                      {SLOT_EMOJI[s]}
                    </span>
                    <span className="text-[12px]">{SLOT_LABEL[s]} 장착</span>
                  </Link>
                );
              }
              return (
                <div
                  key={s}
                  style={rarityBorderStyle(it.transcendLevel)}
                  className={`flex flex-1 items-center gap-2 rounded-xl border bg-white/5 px-2 ${
                    hasRarityBorder(it.transcendLevel) ? '' : 'border-white/10'
                  }`}
                >
                  <div className="shrink-0">
                    <TranscendSprite
                      code={it.code}
                      slot={s}
                      level={it.transcendLevel}
                      championRank={libRanks.get(it.catalogItemId) ?? null}
                      size={42}
                      frameless
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="line-clamp-2 break-keep text-[12px] leading-tight text-white/85">{it.name}</div>
                    <div className="text-[12px] font-bold tabular-nums text-white">
                      +{it.enhanceLevel}
                      <TranscendTag level={it.transcendLevel} className="ml-1" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <BoastLauncher
        nickname={nickname}
        publicCode={publicCode}
        total={total}
        profileImg={activeProfile ? dirImg(activeProfile) : null}
        guildEmblemUrl={row?.guild_emblem_url ?? null}
        guildName={row?.guild_name ?? null}
        pieces={equipped.map((e) => ({
          slot: e.slot,
          code: e.code,
          name: e.name,
          enhanceLevel: e.enhanceLevel,
          transcendLevel: e.transcendLevel,
          championRank: libRanks.get(e.catalogItemId) ?? null,
          catalogItemId: e.catalogItemId,
        }))}
      />

      <ReferralSection
        totalReferrals={referralStats.totalReferrals}
        totalDiamondEarned={referralStats.totalDiamondEarned}
        totalBoxEarned={referralStats.totalBoxEarned}
      />

      <nav className="space-y-2">
        {MENU.map((m) => (
          <Link
            key={m.href}
            href={m.href}
            className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950"
          >
            <span className="flex items-center gap-3">
              <span aria-hidden className="text-xl">
                {m.icon}
              </span>
              <span className="text-sm font-medium">{m.label}</span>
              {m.href === '/friends' && friendReqCount > 0 ? (
                <span
                  aria-label={`친구 요청 ${friendReqCount}건`}
                  className="inline-flex min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white tabular-nums"
                >
                  {friendReqCount > 99 ? '99+' : friendReqCount}
                </span>
              ) : null}
            </span>
            <span className="text-zinc-400">›</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
