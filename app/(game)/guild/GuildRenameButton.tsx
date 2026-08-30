'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { ModalShell } from '@/components/ModalShell';
import { ModalLayout, ModalButton } from '@/components/ModalLayout';
import { useResourceToast } from '@/components/ResourceToast';
import {
  GUILD_NAME_MAX_LEN,
  GUILD_NAME_MIN_LEN,
  GUILD_RENAME_AFTER_DAYS,
  GUILD_RENAME_COOLDOWN_DAYS,
} from '@/lib/game/guild/balance';

import { renameGuildAction } from './actions';
import { guildErrMsg } from './errors-msg';

const DAY = 86_400_000;

/**
 * 길드명 변경(2026-08-31) — 길드 홈 길드명 아래 작은 텍스트 링크(D안, 길드장만 노출). 탭 → 공용 모달.
 * 결성 7일 뒤 첫 변경, 이후 30일마다. 판정은 서버가 최종(rename.ts) — 여기선 표시·안내만.
 */
export function GuildRenameButton({
  name,
  createdAtIso,
  renamedAtIso,
}: {
  name: string;
  createdAtIso: string;
  renamedAtIso: string | null;
}) {
  const router = useRouter();
  const { showHeaderToast, showError } = useResourceToast();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const readyAt = Math.max(
    Date.parse(createdAtIso) + GUILD_RENAME_AFTER_DAYS * DAY,
    renamedAtIso ? Date.parse(renamedAtIso) + GUILD_RENAME_COOLDOWN_DAYS * DAY : 0,
  );
  const waitDays = Math.max(0, Math.ceil((readyAt - Date.now()) / DAY));

  const submit = () => {
    const n = newName.trim();
    if (!n || pending) return;
    setOpen(false);
    start(async () => {
      const r = await renameGuildAction(n);
      if (r.status !== 'success') return showError(guildErrMsg(r.code));
      setNewName('');
      showHeaderToast({ title: `길드 이름 변경 · ${r.after}` });
      router.refresh();
    });
  };

  return (
    <>
      {/* D안(2026-08-30) — 이름 아래 작은 텍스트 링크. 대기 중이면 회색 + 'N일 후'로 사유를 그 자리에서 보여준다. */}
      <button
        type="button"
        onClick={() => {
          if (waitDays > 0) return showError(renamedAtIso ? guildErrMsg('RENAME_COOLDOWN') : guildErrMsg('RENAME_TOO_EARLY'));
          setOpen(true);
        }}
        className={`mt-0.5 block text-[11px] leading-tight ${
          waitDays > 0
            ? 'text-zinc-400 dark:text-zinc-500'
            : 'text-amber-600 underline decoration-amber-600/60 underline-offset-2 dark:text-amber-400 dark:decoration-amber-400/60'
        }`}
      >
        {waitDays > 0 ? `이름 변경 · ${waitDays}일 후` : '이름 변경'}
      </button>
      {open ? (
        <ModalShell onClose={() => setOpen(false)} onSubmit={submit} label="길드 이름 변경">
          <ModalLayout
            title="길드 이름을 바꿀까요?"
            subtitle={
              <>
                <b className="font-bold">{name}</b>
                <span className="mx-1 text-zinc-400">→</span>
                <b className="font-bold text-amber-600 dark:text-amber-400">{newName.trim() || '새 이름'}</b>
              </>
            }
            footer={
              <>
                <ModalButton tone="primary" onClick={submit} disabled={pending || !newName.trim()}>
                  변경
                </ModalButton>
                <ModalButton tone="ghost" onClick={() => setOpen(false)}>
                  취소
                </ModalButton>
              </>
            }
          >
            {/* iOS 포커스 확대 방지 — 입력 글꼴은 16px로 두고 scale(.875)로 14px처럼 보이게(원점 좌측, 폭 보정). */}
            <div className="overflow-hidden">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                maxLength={GUILD_NAME_MAX_LEN}
                placeholder={`${GUILD_NAME_MIN_LEN}~${GUILD_NAME_MAX_LEN}자, 한글·영문·숫자`}
                className="block rounded-lg border border-zinc-300 bg-white px-3 py-2 outline-none focus:border-amber-500 dark:border-zinc-700 dark:bg-zinc-900"
                style={{ fontSize: 16, width: '114.2857%', transform: 'scale(0.875)', transformOrigin: 'left top', marginBottom: '-12.5%' }}
              />
            </div>
            <ul className="mt-2 space-y-0.5 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
              <li>· 결성 {GUILD_RENAME_AFTER_DAYS}일 뒤부터, 변경 후에는 {GUILD_RENAME_COOLDOWN_DAYS}일마다 바꿀 수 있습니다.</li>
              <li>· 이름은 전 서버를 통틀어 하나입니다.</li>
              <li>· 변경 기록은 길드 활동과 세계 역사에 남고, 이전 역사는 옛 이름으로 유지됩니다.</li>
            </ul>
          </ModalLayout>
        </ModalShell>
      ) : null}
    </>
  );
}
