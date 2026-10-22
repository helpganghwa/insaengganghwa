'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import {
  CHAT_MUTE_DEFAULT_DAYS,
  CHAT_MUTE_PERMANENT_DAYS,
  CHAT_MUTE_PRESETS,
  chatModMailProblem,
  chatMuteMailDraft,
  chatWarnMailDraft,
  parseMuteDays,
} from '@/lib/game/chat/mod-mail';
import { fmtKst } from './shared';
import {
  setChatHiddenAction,
  setWhisperHiddenAction,
  muteChatUserAction,
  setChatEnabledAction,
  warnChatUserAction,
  type ChatModKind,
} from './actions';

/** 어드민 채팅 조작 버튼(0125) — 숨김/해제·경고 우편·채팅 금지(기간 지정)·킬스위치. */

export function ChatToggle({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!window.confirm(enabled ? '전체 채팅을 끌까요? (전 유저 즉시 차단)' : '전체 채팅을 켤까요?')) return;
        start(async () => {
          await setChatEnabledAction(!enabled);
          router.refresh();
        });
      }}
      className={`rounded-lg px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50 ${
        enabled ? 'bg-red-600' : 'bg-emerald-600'
      }`}
    >
      {enabled ? '채팅 끄기' : '채팅 켜기'}
    </button>
  );
}

const BTN = 'rounded px-2 py-1 text-[10px] font-bold text-white disabled:opacity-50';
const FIELD = 'w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-[11px] text-zinc-100';
const CHIP = 'rounded border px-1.5 py-0.5 text-[10px] font-bold';

/**
 * 메시지 행 조작 — 숨김/해제 + 경고 우편 + 발신자 채팅 금지(2026-10-22 개편).
 * kind는 숨김이 어느 테이블을 대상으로 하는지만 가른다(chat_messages / whisper_messages).
 * 채팅 금지는 계정 단위(profiles.chat_muted_until)라 두 경우 모두 같은 액션을 쓴다.
 *
 * 경고·금지는 prompt 대신 행 아래 패널을 연다: 경고 우편은 초안을 고쳐 보내야 하고(요청),
 * 금지는 기간(기본 3일)·사유·안내 우편을 한 번에 정해야 해서 한 줄 prompt로는 부족하다.
 * 부모 행이 flex-wrap이라 패널은 basis-full로 다음 줄에 펼쳐진다.
 */
export function MessageActions({
  messageId,
  hidden,
  userId,
  kind = 'chat',
  body,
  createdAtIso,
  warnedAtIso,
  mutedUntilIso,
}: {
  messageId: string;
  hidden: boolean;
  userId: string;
  kind?: ChatModKind;
  /** 원문 — 우편 발췌용. */
  body: string;
  createdAtIso: string;
  /** 마지막 경고 발송 시각 — 있으면 버튼에 '다시'를 붙여 중복 발송을 의식하게 한다. */
  warnedAtIso: string | null;
  /** 금지 진행 중이면 해제 시각(만료는 null) — 해제 버튼 노출 조건. */
  mutedUntilIso: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [panel, setPanel] = useState<'warn' | 'mute' | null>(null);
  // 경고 우편 초안
  const [wTitle, setWTitle] = useState('');
  const [wBody, setWBody] = useState('');
  // 채팅 금지
  const [days, setDays] = useState(String(CHAT_MUTE_DEFAULT_DAYS));
  const [reason, setReason] = useState('');
  const [sendMail, setSendMail] = useState(true);
  const [mTitle, setMTitle] = useState('');
  const [mBody, setMBody] = useState('');
  // 어드민이 본문을 손댔으면 기간을 바꿔도 다시 쓰지 않는다(고친 글을 날리지 않게).
  const [mTouched, setMTouched] = useState(false);

  const run = (fn: () => Promise<{ status: string; message?: string }>, okMsg: string | null) =>
    start(async () => {
      const r = await fn();
      if (r.status === 'success') {
        setMsg(okMsg);
        setPanel(null);
      } else {
        setMsg(r.message ?? '실패');
      }
      router.refresh();
    });
  const toggleHidden = () =>
    kind === 'whisper'
      ? setWhisperHiddenAction(messageId, !hidden)
      : setChatHiddenAction(messageId, !hidden);

  const openWarn = () => {
    const d = chatWarnMailDraft(new Date(createdAtIso), body);
    setWTitle(d.title);
    setWBody(d.body);
    setMsg(null);
    setPanel('warn');
  };
  const muteDraft = (n: number) => chatMuteMailDraft({ days: n, from: new Date(), at: new Date(createdAtIso), body });
  const openMute = () => {
    const d = muteDraft(CHAT_MUTE_DEFAULT_DAYS);
    setDays(String(CHAT_MUTE_DEFAULT_DAYS));
    setReason('');
    setSendMail(true);
    setMTitle(d.title);
    setMBody(d.body);
    setMTouched(false);
    setMsg(null);
    setPanel('mute');
  };
  const changeDays = (v: string) => {
    setDays(v);
    const n = parseMuteDays(v);
    if (n !== null && !mTouched) {
      const d = muteDraft(n);
      setMTitle(d.title);
      setMBody(d.body);
    }
  };
  const submitWarn = () => {
    const problem = chatModMailProblem(wTitle, wBody);
    if (problem) return setMsg(problem);
    run(() => warnChatUserAction({ messageId, kind, title: wTitle, body: wBody }), '경고 우편을 보냈습니다.');
  };
  const submitMute = () => {
    const n = parseMuteDays(days);
    if (n === null) return setMsg('기간은 1~36500일 사이여야 합니다.');
    if (!reason.trim()) return setMsg('사유를 입력하세요.');
    if (sendMail) {
      const problem = chatModMailProblem(mTitle, mBody);
      if (problem) return setMsg(problem);
    }
    run(
      () => muteChatUserAction(userId, n, reason, sendMail ? { kind, messageId, title: mTitle, body: mBody } : undefined),
      `${n >= CHAT_MUTE_PERMANENT_DAYS ? '영구' : `${n}일`} 채팅 금지${sendMail ? ' + 안내 우편 발송' : ''}`,
    );
  };
  const parsedDays = parseMuteDays(days);

  return (
    <>
      <span className="ml-auto flex items-center gap-1.5">
        <button type="button" disabled={pending} onClick={() => run(toggleHidden, null)} className={`${BTN} bg-zinc-700`}>
          {hidden ? '해제' : '숨김'}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => (panel === 'warn' ? setPanel(null) : openWarn())}
          className={`${BTN} ${panel === 'warn' ? 'bg-amber-500' : 'bg-amber-600'}`}
        >
          {warnedAtIso ? '경고 다시' : '경고 우편'}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => (panel === 'mute' ? setPanel(null) : openMute())}
          className={`${BTN} ${panel === 'mute' ? 'bg-red-600' : 'bg-red-700'}`}
        >
          채팅 금지
        </button>
        {mutedUntilIso ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (!window.confirm('이 유저의 채팅 금지를 해제할까요?')) return;
              run(() => muteChatUserAction(userId, 0), '채팅 금지를 해제했습니다.');
            }}
            className={`${BTN} bg-zinc-500`}
          >
            금지 해제
          </button>
        ) : null}
        {msg ? <span className="text-[10px] text-amber-300">{msg}</span> : null}
      </span>

      {panel === 'warn' ? (
        <div className="mt-2 basis-full rounded-lg border border-amber-900/60 bg-zinc-950/60 p-3">
          <p className="mb-2 text-[11px] font-bold text-amber-300">
            경고 우편 초안 {warnedAtIso ? <span className="font-normal text-zinc-400">(이미 {fmtKst(new Date(warnedAtIso))} 발송함)</span> : null}
          </p>
          <input value={wTitle} onChange={(e) => setWTitle(e.target.value)} className={`${FIELD} mb-1.5`} placeholder="제목" />
          <textarea value={wBody} onChange={(e) => setWBody(e.target.value)} rows={6} className={FIELD} placeholder="본문" />
          <div className="mt-2 flex items-center gap-1.5">
            <button type="button" disabled={pending} onClick={submitWarn} className={`${BTN} bg-amber-600`}>
              보내기
            </button>
            <button type="button" disabled={pending} onClick={() => setPanel(null)} className={`${BTN} bg-zinc-700`}>
              취소
            </button>
          </div>
        </div>
      ) : null}

      {panel === 'mute' ? (
        <div className="mt-2 basis-full rounded-lg border border-red-900/60 bg-zinc-950/60 p-3">
          <p className="mb-2 text-[11px] font-bold text-red-300">채팅 금지</p>
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] text-zinc-400">기간</span>
            <input
              value={days}
              onChange={(e) => changeDays(e.target.value)}
              inputMode="numeric"
              className="w-16 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-right text-[11px] text-zinc-100"
            />
            <span className="text-[10px] text-zinc-400">일</span>
            {CHAT_MUTE_PRESETS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => changeDays(String(n))}
                className={`${CHIP} ${parsedDays === n ? 'border-red-500 text-red-300' : 'border-zinc-700 text-zinc-400'}`}
              >
                {n}일
              </button>
            ))}
            <button
              type="button"
              onClick={() => changeDays(String(CHAT_MUTE_PERMANENT_DAYS))}
              className={`${CHIP} ${parsedDays === CHAT_MUTE_PERMANENT_DAYS ? 'border-red-500 text-red-300' : 'border-zinc-700 text-zinc-400'}`}
            >
              영구
            </button>
          </div>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className={`${FIELD} mb-1.5`}
            placeholder="사유(감사 로그용, 유저에게 보이지 않음)"
          />
          <label className="mb-1.5 flex items-center gap-1.5 text-[11px] text-zinc-300">
            <input type="checkbox" checked={sendMail} onChange={(e) => setSendMail(e.target.checked)} />
            안내 우편 보내기
          </label>
          {sendMail ? (
            <>
              <input value={mTitle} onChange={(e) => setMTitle(e.target.value)} className={`${FIELD} mb-1.5`} placeholder="제목" />
              <textarea
                value={mBody}
                onChange={(e) => {
                  setMBody(e.target.value);
                  setMTouched(true);
                }}
                rows={6}
                className={FIELD}
                placeholder="본문"
              />
            </>
          ) : null}
          <div className="mt-2 flex items-center gap-1.5">
            <button type="button" disabled={pending} onClick={submitMute} className={`${BTN} bg-red-700`}>
              {parsedDays === null ? '금지 적용' : parsedDays >= CHAT_MUTE_PERMANENT_DAYS ? '영구 금지 적용' : `${parsedDays}일 금지 적용`}
            </button>
            <button type="button" disabled={pending} onClick={() => setPanel(null)} className={`${BTN} bg-zinc-700`}>
              취소
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
