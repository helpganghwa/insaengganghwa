'use client';

import { ModalShell } from '@/components/ModalShell';
import { ModalLayout, ModalButton } from '@/components/ModalLayout';
import { LastSeen } from '@/components/LastSeen';
import { REGION_META } from '@/lib/game/guild/region-meta';
import { guildCapacity } from '@/lib/game/guild/balance';

import { GuildIntroBlock } from './GuildInfoBlocks';
import { JoinPolicyBadge, KakaoOpenchatBadge, fmtNum, type GuildRow } from './guild-row';

/**
 * 길드 정보 팝업 — 목록·랭킹 어느 화면에서 눌러도 같은 내용이 뜬다.
 *
 * 종전엔 GuildList 안에만 있어 랭킹 화면을 따로 만들면 팝업이 갈라질 수밖에 없었다.
 * 표시 방법을 한 곳에 두어 두 화면이 어긋나지 않게 한다(2026-07-30).
 */
export function GuildInfoModal({ guild, onClose }: { guild: GuildRow; onClose: () => void }) {
  const cap = guildCapacity(guild.level);
  const full = guild.memberCount >= cap;
  return (
    <ModalShell onClose={onClose} label={`${guild.name} 길드 정보`}>
      <ModalLayout
        icon={
          guild.emblemUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={guild.emblemUrl}
              alt=""
              aria-hidden
              className="mx-auto h-11 w-11 object-contain"
              style={{ imageRendering: 'pixelated' }}
            />
          ) : (
            '🛡️'
          )
        }
        title={
          <span className="inline-flex items-center gap-1.5">
            {guild.name}
            <JoinPolicyBadge policy={guild.joinPolicy} />
            {guild.hasOpenchat ? <KakaoOpenchatBadge /> : null}
          </span>
        }
        subtitle={
          <>
            Lv.{guild.level} ·{' '}
            <span className={full ? 'font-bold text-zinc-500' : undefined}>
              {guild.memberCount}/{cap}명
            </span>{' '}
            · 전투력{' '}
            <span className="font-bold text-amber-600 dark:text-amber-400">
              {fmtNum(guild.combat)}
            </span>
          </>
        }
        footer={
          <ModalButton tone="neutral" onClick={onClose}>
            닫기
          </ModalButton>
        }
      >
        {/* 길드장 — 가입 판단의 핵심(승인·운영을 할 사람이 살아 있는가). */}
        {guild.leaderNickname ? (
          <div className="mb-3 flex items-center justify-between gap-2 rounded-lg bg-zinc-50 px-2.5 py-2 dark:bg-zinc-900">
            <span className="min-w-0 truncate text-[12px]">
              <span className="text-zinc-400">길드장</span>{' '}
              <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                {guild.leaderNickname}
              </span>
            </span>
            {guild.leaderLastSeenAt ? (
              <LastSeen at={guild.leaderLastSeenAt} plain className="shrink-0 text-[11px]" />
            ) : null}
          </div>
        ) : null}

        <div>
          <p className="text-[11px] font-bold text-zinc-400">점령 구역 ({guild.zones.length})</p>
          {guild.zones.length > 0 ? (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {guild.zones.map((z) => (
                <span
                  key={z.name}
                  className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${REGION_META[z.region].chip}`}
                >
                  {z.name}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-1 text-[12px] text-zinc-400">점령 중인 구역이 없습니다.</p>
          )}
        </div>
        <div className="mt-3 border-t border-zinc-100 pt-3 dark:border-zinc-900">
          <GuildIntroBlock intro={guild.intro} />
        </div>
      </ModalLayout>
    </ModalShell>
  );
}
