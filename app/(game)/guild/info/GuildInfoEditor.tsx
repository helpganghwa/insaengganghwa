'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { useResourceToast } from '@/components/ResourceToast';
import { ZoomSafeInput, ZoomSafeTextarea } from '@/components/ui/ZoomSafeField';
import { GUILD_INTRO_MAX_LEN, GUILD_NOTICE_MAX_LEN } from '@/lib/game/guild/balance';

import { GuildPageHeader } from '../GuildPageHeader';
import { setGuildNoticeAction, setGuildIntroAction, setGuildOpenchatAction } from '../actions';
import { guildErrMsg } from '../errors-msg';

const OPENCHAT_MAX_LEN = 80;

type Field = 'notice' | 'intro' | 'openchat';

/**
 * 길드 정보(I-1 확정안) — 카드 3개 + 하단 고정 저장바.
 *
 *  - 저장 버튼을 하나로 모은다(종전 6개: [비우기][저장] × 3). [비우기]는 없애고
 *    "필드를 비우고 저장"으로 통일 — 오픈채팅 안내가 이미 그 방식이었다.
 *  - 미리보기는 두지 않는다(2026-07-30 사용자 결정) — 입력창이 내용만큼 늘어나
 *    쓰는 그대로 보이므로 같은 내용을 두 번 그릴 이유가 없다.
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
        // 실패 경로만 refresh(§11.7 예외) — 마지막 액션이 실패하면 앞선 성공분의 응답
        // 재렌더가 반영되지 않았을 수 있어 서버 상태로 재동기화한다.
        router.refresh();
      } else {
        showHeaderToast({ title: '길드 정보 저장' });
        // 전부 성공 시 refresh 불필요(2026-08-20, §11.7) — 마지막 액션의
        // revalidatePath('/guild/info') 응답 재렌더가 커버.
      }
    });
  };

  return (
    <div className="px-4 pb-4 pt-3">
      <GuildPageHeader
        fallback="/guild/settings"
        kicker={guildName}
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
          autoResize
          minHeight={64}
          wrapClassName="mt-1.5 w-full"
          className="rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-2 outline-none focus:border-zinc-400 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-500"
        />
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
          autoResize
          minHeight={54}
          wrapClassName="mt-1.5 w-full"
          className="rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-2 outline-none focus:border-zinc-400 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-500"
        />
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
        <p className="mt-1.5 text-[10.5px] text-zinc-400">비우고 저장하면 입장 버튼이 사라집니다.</p>
        {!can.openchat && <NoPerm what="오픈채팅 설정" />}
      </section>

      {/* 저장바 — 페이지 흐름의 맨 아래(2026-07-30). 화면에 고정하면 채팅 미니바·GNB와
          자리를 다투고 결국 무언가를 가린다. 내용이 짧아 스크롤 없이 닿는다. */}
      {dirtyFields.length > 0 && (
        <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-amber-500/40 bg-amber-50/60 px-3 py-2.5 dark:bg-amber-500/[0.07]">
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
      )}
    </div>
  );
}

const LABEL: Record<Field, string> = { notice: '공지', intro: '소개', openchat: '오픈채팅' };

function NoPerm({ what }: { what: string }) {
  return (
    <p className="mt-1.5 text-[10.5px] text-zinc-400">
      {what} 권한이 없습니다 — 길드장이 열어주면 저장할 수 있어요.
    </p>
  );
}
