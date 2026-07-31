'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { ModalShell } from '@/components/ModalShell';
import { ModalLayout, ModalButton } from '@/components/ModalLayout';
import { useResourceToast } from '@/components/ResourceToast';
import { assetUrl } from '@/lib/asset-versions';
import { GUILD_MAX_VICE } from '@/lib/game/guild/balance';
import {
  GUILD_PERM,
  GUILD_PERM_CONFIRM,
  GUILD_PERM_META,
  GUILD_PERM_ORDER,
  type GuildPermKey,
} from '@/lib/game/guild/permissions';

import { GuildPageHeader } from '../GuildPageHeader';
import { setVicePermissionsAction } from '../actions';
import { guildErrMsg } from '../errors-msg';

type Vice = { userId: string; nickname: string; permissions: number; avatar: string | null };

/**
 * 부길드장 권한 화면(P-1 확정안) — 한 사람을 고르고 아홉 개 토글.
 *
 *  - 토글은 **즉시 적용**(저장 버튼 없음). 낙관적 반영 후 실패하면 되돌린다.
 *  - 되돌릴 수 없거나 재화가 나가는 권한(GUILD_PERM_CONFIRM)은 **켤 때만** 확인받는다.
 *    끄는 방향은 권한을 좁히는 쪽이라 막지 않는다.
 */
export function VicePermissionsBoard({
  guildName,
  vices,
  initialSelected = null,
}: {
  guildName: string;
  vices: Vice[];
  /** 진입 시 열어둘 대상(?u=) — 길드원 화면 ⋯에서 특정 인물로 들어올 때. */
  initialSelected?: string | null;
}) {
  const router = useRouter();
  // 성공 토스트는 쓰지 않는다 — 토글이 즉시 움직이는 것이 곧 피드백이다. 실패만 알린다.
  const { showError } = useResourceToast();
  const [pending, start] = useTransition();
  // 낙관적 권한 상태 — userId → 비트마스크.
  const [perms, setPerms] = useState<Record<string, number>>(() =>
    Object.fromEntries(vices.map((v) => [v.userId, v.permissions])),
  );
  const [selected, setSelected] = useState<string | null>(initialSelected ?? vices[0]?.userId ?? null);
  const [confirm, setConfirm] = useState<{ userId: string; key: GuildPermKey } | null>(null);

  const target = vices.find((v) => v.userId === selected) ?? null;
  const targetPerms = target ? (perms[target.userId] ?? 0) : 0;
  const countOf = (userId: string) => {
    const p = perms[userId] ?? 0;
    return GUILD_PERM_ORDER.filter((k) => (p & GUILD_PERM[k]) !== 0).length;
  };

  const apply = (userId: string, next: number) => {
    const before = perms[userId] ?? 0;
    setPerms((m) => ({ ...m, [userId]: next }));
    start(async () => {
      const r = await setVicePermissionsAction(userId, next).catch(() => null);
      if (!r || r.status !== 'success') {
        setPerms((m) => ({ ...m, [userId]: before })); // 실패 → 되돌림
        showError(r ? guildErrMsg(r.code) : '전송에 실패했어요. 다시 시도해 주세요.');
        return;
      }
      router.refresh();
    });
  };

  const toggle = (key: GuildPermKey) => {
    if (!target || pending) return;
    const on = (targetPerms & GUILD_PERM[key]) !== 0;
    if (!on && GUILD_PERM_CONFIRM.includes(key)) {
      setConfirm({ userId: target.userId, key });
      return;
    }
    apply(target.userId, on ? targetPerms & ~GUILD_PERM[key] : targetPerms | GUILD_PERM[key]);
  };

  if (vices.length === 0) {
    return (
      <div className="px-4 pb-4 pt-3">
        <GuildPageHeader fallback="/guild/settings" kicker={guildName} title="부길드장 권한" />
        <div className="mt-3 rounded-xl border border-zinc-200 bg-white p-6 text-center dark:border-zinc-800 dark:bg-zinc-950">
          <p className="text-[13px] font-bold">부길드장이 없어요</p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-zinc-500">
            길드원 화면에서 부길드장을 임명하면 여기서 권한을 정할 수 있습니다.
            <br />
            길드당 최대 {GUILD_MAX_VICE}명까지 임명할 수 있습니다.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 pb-4 pt-3">
      {/* 대상 — 헤더가 "누구의 권한인가"를 항상 말한다(개인별이라 혼동이 치명적). */}
      {target && (
        <GuildPageHeader
          fallback="/guild/settings"
          kicker={`${countOf(target.userId)} / ${GUILD_PERM_ORDER.length} 허용`}
          title={target.nickname}
          icon={
            target.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={assetUrl(target.avatar)}
                alt=""
                aria-hidden
                className="h-full w-full object-cover"
                style={{ imageRendering: 'pixelated' }}
              />
            ) : (
              <span className="text-base">🛠</span>
            )
          }
        />
      )}

      {/* 토글 아홉 개 */}
      <section className="mt-3 rounded-xl border border-sky-500/30 bg-sky-50/40 p-3 dark:border-sky-500/25 dark:bg-sky-950/15">
        <div className="mb-1 flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold">허용된 권한</h2>
          <span className="text-[10px] text-zinc-500">
            변경시 즉시 적용
          </span>
        </div>
        <ul>
          {GUILD_PERM_ORDER.map((key) => {
            const meta = GUILD_PERM_META[key];
            const on = (targetPerms & GUILD_PERM[key]) !== 0;
            return (
              <li
                key={key}
                className="flex items-center gap-2.5 border-b border-zinc-200/60 py-2.5 last:border-b-0 dark:border-zinc-800/60"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold">{meta.label}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={on}
                  aria-label={`${meta.label} ${on ? '허용됨' : '차단됨'}`}
                  onClick={() => toggle(key)}
                  disabled={pending}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-60 ${
                    on ? 'bg-sky-500' : 'bg-zinc-300 dark:bg-zinc-700'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                      on ? 'left-[22px]' : 'left-0.5'
                    }`}
                  />
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <p className="mt-2.5 px-0.5 text-[11px] leading-relaxed text-zinc-500">
        부길드장 임명 · 해제, 길드장 위임, 길드 해산, 부길드장 권한 설정은 길드장만 할 수 있습니다.
      </p>

      {/* 다른 부길드장으로 전환 — 목록을 아래에 두는 이유는 진입 시 대개 특정 인물을 고치러 오기 때문. */}
      {vices.length > 1 && (
        <section className="mt-4">
          <h2 className="mb-1.5 px-0.5 text-[11px] font-bold tracking-wide text-zinc-400">
            부길드장 {vices.length} / {GUILD_MAX_VICE}
          </h2>
          <ul className="rounded-xl border border-zinc-200 bg-white px-3 dark:border-zinc-800 dark:bg-zinc-950">
            {vices.map((v) => {
              const isSel = v.userId === selected;
              return (
                <li
                  key={v.userId}
                  className="border-b border-zinc-100 last:border-b-0 dark:border-zinc-900"
                >
                  <button
                    type="button"
                    onClick={() => setSelected(v.userId)}
                    className="flex w-full items-center gap-2 py-2.5 text-left active:opacity-70"
                  >
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-900">
                      {v.avatar ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={assetUrl(v.avatar)}
                          alt=""
                          aria-hidden
                          className="h-full w-full object-cover"
                          style={{ imageRendering: 'pixelated' }}
                        />
                      ) : (
                        <span className="text-[13px]">🛠</span>
                      )}
                    </div>
                    <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">
                      {v.nickname}
                    </span>
                    <span className="shrink-0 rounded-full bg-sky-500/15 px-1.5 py-0 text-[10px] font-bold tabular-nums text-sky-700 dark:text-sky-300">
                      {countOf(v.userId)} / {GUILD_PERM_ORDER.length}
                    </span>
                    <span className={`shrink-0 text-[13px] ${isSel ? 'text-sky-500' : 'text-zinc-300 dark:text-zinc-600'}`}>
                      {isSel ? '●' : '›'}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* 강한 권한 켜기 확인 — 무엇이 함께 따라오는지 한 문장으로. */}
      {confirm && (
        <ModalShell onClose={() => setConfirm(null)} label="권한 허용 확인">
          <ModalLayout
            title={`${GUILD_PERM_META[confirm.key].label} 권한을 줄까요?`}
            subtitle={
              <span className="font-bold text-sky-600 dark:text-sky-400">
                {vices.find((v) => v.userId === confirm.userId)?.nickname ?? '부길드장'}
              </span>
            }
            footer={
              <>
                <ModalButton tone="ghost" onClick={() => setConfirm(null)} disabled={pending}>
                  취소
                </ModalButton>
                <ModalButton
                  tone="info"
                  onClick={() => {
                    const c = confirm;
                    setConfirm(null);
                    apply(c.userId, (perms[c.userId] ?? 0) | GUILD_PERM[c.key]);
                  }}
                  disabled={pending}
                >
                  허용
                </ModalButton>
              </>
            }
          >
            <p className="text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-300">
              {CONFIRM_BODY[confirm.key]}
            </p>
            <p className="mt-2 text-[11.5px] text-zinc-500">언제든 다시 끌 수 있습니다.</p>
          </ModalLayout>
        </ModalShell>
      )}
    </div>
  );
}

/** 강한 권한을 켤 때 보여줄 한 문장 — 무엇이 함께 따라오는지만 말한다. */
const CONFIRM_BODY: Record<string, string> = {
  executor: '집행관으로 지정된 길드원은 그 구역의 세금을 수금할 수 있습니다. 집행관을 정하는 권한을 함께 주게 됩니다.',
  kick: '길드원을 내보낼 수 있게 됩니다. 추방은 되돌릴 수 없고, 추방된 길드원은 한동안 다시 가입할 수 없습니다.',
  taxDistribute: '길드가 모은 세금을 길드원에게 나눠 줄 수 있게 됩니다. 나간 다이아는 되돌릴 수 없습니다.',
  emblem: '길드 문양을 새로 만들거나 바꿀 수 있게 됩니다. 만들 때마다 길드장의 다이아가 아니라 본인의 다이아가 소모됩니다.',
};
