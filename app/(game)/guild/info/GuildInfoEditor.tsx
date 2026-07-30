'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { BackTitle } from '@/components/BackNav';
import { useResourceToast } from '@/components/ResourceToast';
import { ZoomSafeInput, ZoomSafeTextarea } from '@/components/ui/ZoomSafeField';
import { GUILD_INTRO_MAX_LEN, GUILD_NOTICE_MAX_LEN } from '@/lib/game/guild/balance';

import { setGuildNoticeAction, setGuildIntroAction, setGuildOpenchatAction } from '../actions';
import { guildErrMsg } from '../errors-msg';
import { GuildIntroBlock, GuildNoticeBlock, GuildOpenchatButton } from '../GuildInfoBlocks';

const OPENCHAT_MAX_LEN = 80;

type Field = 'notice' | 'intro' | 'openchat';

/**
 * 길드 정보(I-1 확정안) — 카드 3개 + 하단 고정 저장바.
 *
 *  - 저장 버튼을 하나로 모은다(종전 6개: [비우기][저장] × 3). [비우기]는 없애고
 *    "필드를 비우고 저장"으로 통일 — 오픈채팅 안내가 이미 그 방식이었다.
 *  - 미리보기는 실제 화면과 **같은 컴포넌트**(GuildInfoBlocks)를 쓴다. 따로 그리면
 *    실제 렌더가 바뀔 때 어긋나므로 표시 방법을 한 곳에만 둔다.
 *  - 세 값의 권한이 각각 따로다 — 권한 없는 필드는 읽기 전용이고 저장 집계에서도 뺀다.
 */
export function GuildInfoEditor({
  guildName,
  can,
  initial,
}: {
  guildName: string;
  can: Record<Field, boolean>;
  initial: Record<Field, string>;
}) {
  const router = useRouter();
  const { showHeaderToast, showError } = useResourceToast();
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(initial);

  const dirty = (f: Field) => can[f] && draft[f] !== saved[f];
  const dirtyFields = (['notice', 'intro', 'openchat'] as Field[]).filter(dirty);

  const revert = () => setDraft(saved);

  const save = () => {
    if (dirtyFields.length === 0 || pending) return;
    const next = { ...draft };
    start(async () => {
      // 필드별 서버 액션을 순차 호출 — 하나가 실패하면 그 필드만 되돌리고 어느 것이 실패했는지 알린다.
      const failed: string[] = [];
      const okFields: Field[] = [];
      for (const f of dirtyFields) {
        const call =
          f === 'notice'
            ? setGuildNoticeAction(next.notice)
            : f === 'intro'
              ? setGuildIntroAction(next.intro)
              : setGuildOpenchatAction(next.openchat);
        const r = await call.catch(() => null);
        if (!r || r.status !== 'success') {
          failed.push(
            `${LABEL[f]}${r?.code ? ` (${guildErrMsg(r.code)})` : ''}`,
          );
        } else {
          okFields.push(f);
        }
      }
      // 성공한 필드만 저장 기준을 옮긴다 — 실패한 필드는 계속 '변경됨'으로 남아 재시도가 자연스럽다.
      setSaved((s) => {
        const merged = { ...s };
        for (const f of okFields) merged[f] = next[f];
        return merged;
      });
      if (failed.length > 0) {
        showError(`${failed.join(' · ')} 저장에 실패했어요.`);
      } else {
        showHeaderToast({ title: '길드 정보 저장' });
      }
      router.refresh();
    });
  };

  return (
    <div className="px-4 py-5 pb-32">
      <BackTitle
        fallback="/guild/settings"
        className="px-0.5"
        kicker={`${guildName} · 공지 · 소개 · 오픈채팅`}
        title="길드 정보"
      />

      {/* 공지 — 길드 홈에 노출 */}
      <section className="mt-3 rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[12px] font-semibold text-zinc-600 dark:text-zinc-300">공지</span>
          <span className="text-[10px] tabular-nums text-zinc-400">
            {draft.notice.length}/{GUILD_NOTICE_MAX_LEN}
          </span>
        </div>
        <ZoomSafeTextarea
          value={draft.notice}
          onChange={(e) => setDraft((d) => ({ ...d, notice: e.target.value.slice(0, GUILD_NOTICE_MAX_LEN) }))}
          placeholder="길드원에게 보일 공지를 입력하세요"
          readOnly={!can.notice}
          wrapClassName="mt-1.5 h-[64px] w-full"
          className="rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-2 outline-none focus:border-zinc-400 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-500"
        />
        <Preview label="길드 홈에 이렇게 보입니다">
          {draft.notice.trim() ? (
            <GuildNoticeBlock notice={draft.notice} />
          ) : (
            <p className="text-[11px] text-zinc-400">공지가 없으면 홈에 표시되지 않습니다.</p>
          )}
        </Preview>
        {!can.notice && <NoPerm what="공지" />}
      </section>

      {/* 소개 — 길드 목록·랭킹 팝업에 노출 */}
      <section className="mt-2.5 rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[12px] font-semibold text-zinc-600 dark:text-zinc-300">소개</span>
          <span className="text-[10px] tabular-nums text-zinc-400">
            {draft.intro.length}/{GUILD_INTRO_MAX_LEN}
          </span>
        </div>
        <ZoomSafeTextarea
          value={draft.intro}
          onChange={(e) => setDraft((d) => ({ ...d, intro: e.target.value.slice(0, GUILD_INTRO_MAX_LEN) }))}
          placeholder="가입을 고민하는 사람에게 보일 한 줄"
          readOnly={!can.intro}
          wrapClassName="mt-1.5 h-[54px] w-full"
          className="rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-2 outline-none focus:border-zinc-400 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-500"
        />
        <Preview label="길드 목록·랭킹 팝업에 이렇게 보입니다">
          <GuildIntroBlock intro={draft.intro} />
        </Preview>
        {!can.intro && <NoPerm what="소개" />}
      </section>

      {/* 오픈채팅 — 길드 홈 입장 버튼 */}
      <section className="mt-2.5 rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
        <span className="text-[12px] font-semibold text-zinc-600 dark:text-zinc-300">
          카카오 오픈채팅
        </span>
        <ZoomSafeInput
          type="url"
          inputMode="url"
          value={draft.openchat}
          onChange={(e) => setDraft((d) => ({ ...d, openchat: e.target.value.slice(0, OPENCHAT_MAX_LEN) }))}
          placeholder="https://open.kakao.com/o/…"
          readOnly={!can.openchat}
          wrapClassName="mt-1.5 h-9 w-full"
          className="rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 outline-none focus:border-zinc-400 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-500"
        />
        <Preview label="길드 홈에 입장 버튼이 생깁니다">
          {draft.openchat.trim() ? (
            <GuildOpenchatButton url={draft.openchat} asLink={false} />
          ) : (
            <p className="text-[11px] text-zinc-400">비우고 저장하면 버튼이 사라집니다.</p>
          )}
        </Preview>
        {!can.openchat && <NoPerm what="오픈채팅 설정" />}
      </section>

      {/* 하단 고정 저장바 — 스크롤해도 붙어 있어 미저장 상태를 놓치지 않는다.
          ⚠ 하단 GNB가 `sticky bottom-0 z-30`이라 같은 z·같은 bottom이면 가려진다(2026-07-30 제보).
          GNB 높이(h-14=3.5rem) + 안전영역만큼 띄우고 z를 한 단계 올린다. */}
      {dirtyFields.length > 0 && (
        <div
          className="fixed inset-x-0 z-40 border-t border-amber-500/40 bg-white/95 px-4 py-2.5 backdrop-blur dark:bg-black/90"
          style={{ bottom: 'calc(3.5rem + env(safe-area-inset-bottom))' }}
        >
          <div className="mx-auto flex max-w-[430px] items-center justify-between gap-2">
            <span className="text-[12px] font-bold text-amber-600 dark:text-amber-400">
              변경한 항목 {dirtyFields.length}개
            </span>
            <span className="flex gap-1.5">
              <button
                type="button"
                onClick={revert}
                disabled={pending}
                className="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-zinc-500 disabled:opacity-50"
              >
                되돌리기
              </button>
              <button
                type="button"
                onClick={save}
                disabled={pending}
                className="rounded-lg bg-amber-600 px-4 py-1.5 text-[12px] font-bold text-white disabled:opacity-50"
              >
                저장
              </button>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

const LABEL: Record<Field, string> = { notice: '공지', intro: '소개', openchat: '오픈채팅' };

/** 미리보기 껍데기 — 안쪽은 실제 표시 컴포넌트가 그린다. */
function Preview({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-2 rounded-r-lg border-l-2 border-amber-500/50 bg-amber-50/50 py-1.5 pl-2.5 pr-1.5 dark:bg-amber-500/[0.06]">
      <p className="mb-1 text-[9.5px] font-bold tracking-wide text-zinc-400">{label}</p>
      {children}
    </div>
  );
}

function NoPerm({ what }: { what: string }) {
  return (
    <p className="mt-1.5 text-[10.5px] text-zinc-400">
      {what} 권한이 없습니다 — 길드장이 열어주면 저장할 수 있어요.
    </p>
  );
}
