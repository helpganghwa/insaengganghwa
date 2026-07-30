'use client';

import { ModalShell } from '@/components/ModalShell';
import { ModalLayout, ModalButton } from '@/components/ModalLayout';
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
            {guild.leaderNickname ? (
              <>
                <br />
                <span className="text-zinc-400">길드장</span>{' '}
                <span className="font-medium text-zinc-600 dark:text-zinc-300">
                  {guild.leaderNickname}
                </span>
              </>
            ) : null}
          </>
        }
        footer={
          <ModalButton tone="neutral" onClick={onClose}>
            닫기
          </ModalButton>
        }
      >
        {/* 소개가 먼저 — 가입을 고민하는 사람은 이 길드가 어떤 곳인지부터 읽는다. */}
        <GuildIntroBlock intro={guild.intro} />
        <div className="mt-3 border-t border-zinc-100 pt-3 dark:border-zinc-900">
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
      </ModalLayout>
    </ModalShell>
  );
}
