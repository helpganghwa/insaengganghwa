'use client';

import { useState, useTransition } from 'react';

import { GUILD_NAME_MAX_LEN, GUILD_NAME_MIN_LEN } from '@/lib/game/guild/balance';

import { renameGuildAction } from './actions';

const ERROR_TEXT: Record<string, string> = {
  NO_CURRENT_NAME: '현재 길드 이름을 입력하세요.',
  GUILD_NOT_FOUND: '그 이름의 길드가 없습니다(띄어쓰기·오타 확인).',
  NAME_INVALID: `새 이름은 ${GUILD_NAME_MIN_LEN}~${GUILD_NAME_MAX_LEN}자여야 합니다.`,
  NAME_CHARSET: '새 이름은 한글·영문·숫자만 쓸 수 있습니다(공백·특수문자·이모지 불가).',
  PROFANITY: '새 이름에 비속어가 있습니다.',
  NAME_TAKEN: '이미 다른 길드가 쓰는 이름입니다.',
  SAME_NAME: '현재 이름과 같습니다.',
  MAIL_EMPTY: '우편 제목·본문을 채우거나 "우편 보내기"를 끄세요.',
};

const DEFAULT_TITLE = '길드 이름 변경 안내';

function defaultBody(from: string, to: string): string {
  return [
    '운영 검토에 따라 길드 이름이 변경되었습니다.',
    '',
    `이전: ${from}`,
    `변경: ${to || '길드+번호(기본 이름)'}`,
    '',
    '이름이 운영 기준에 맞지 않아 조정했습니다. 문의는 고객센터로 연락해 주세요.',
  ].join('\n');
}

/**
 * 길드 이름 변경(운영 도구) — 부적절한 길드명 신고가 들어와도 운영자가 손댈 수단이 없어 추가.
 * 우편 문구는 이름 두 칸에서 자동 생성하되, 운영자가 한 글자라도 고치면 그 뒤로는 덮어쓰지 않는다
 * (템플릿 그대로 보내기 / 사정 설명을 덧붙여 보내기 둘 다 흔하다).
 */
export function AdminGuildRename() {
  const [pending, start] = useTransition();
  const [currentName, setCurrentName] = useState('');
  const [newName, setNewName] = useState('');
  const [sendMail, setSendMail] = useState(true);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [titleTouched, setTitleTouched] = useState(false);
  const [bodyTouched, setBodyTouched] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const from = currentName.trim();
  const to = newName.trim();

  // 이름 입력이 바뀔 때만 문구를 다시 만든다(effect 아님) — 손댄 칸은 건드리지 않는다.
  const prefill = (nextFrom: string, nextTo: string) => {
    if (!nextFrom.trim()) return; // 아직 아무것도 안 채운 상태에선 빈 폼 유지.
    if (!titleTouched) setTitle(DEFAULT_TITLE);
    if (!bodyTouched) setBody(defaultBody(nextFrom.trim(), nextTo.trim()));
  };

  const submit = () => {
    if (!from) {
      setMsg({ ok: false, text: ERROR_TEXT.NO_CURRENT_NAME! });
      return;
    }
    const preview = to || '길드{번호}';
    if (!window.confirm(`"${from}" → "${preview}"로 변경합니다.${sendMail ? ' 길드장에게 우편도 발송합니다.' : ''} 계속할까요?`))
      return;
    setMsg(null);
    start(async () => {
      const r = await renameGuildAction({ currentName: from, newName: to, sendMail, mailTitle: title, mailBody: body });
      if (r.status !== 'success') {
        setMsg({ ok: false, text: ERROR_TEXT[r.code] ?? `실패: ${r.code}` });
        return;
      }
      setMsg({
        ok: true,
        text: `${r.from} → ${r.to} 변경 완료(우편 ${r.mailed ? '발송' : '미발송'})`,
      });
      setCurrentName('');
      setNewName('');
      setTitle('');
      setBody('');
      setTitleTouched(false);
      setBodyTouched(false);
    });
  };

  const btn = 'rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50';
  const field =
    'w-full rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-base dark:border-zinc-700 dark:bg-zinc-900';

  return (
    <div className="space-y-2 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="text-[11px] text-zinc-500">
        길드장에게 통보 후 희망 이름을 받아 적용합니다. 검증 기준은 길드 결성과 동일(
        {GUILD_NAME_MIN_LEN}~{GUILD_NAME_MAX_LEN}자 · 한글/영문/숫자).
      </div>

      <label className="block">
        <span className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">현재 길드 이름</span>
        <input
          value={currentName}
          onChange={(e) => {
            setCurrentName(e.target.value);
            prefill(e.target.value, newName);
          }}
          placeholder="정확히 일치해야 합니다"
          className={`mt-1 ${field}`}
        />
      </label>

      <label className="block">
        <span className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">새 이름</span>
        <input
          value={newName}
          onChange={(e) => {
            setNewName(e.target.value);
            prefill(currentName, e.target.value);
          }}
          maxLength={GUILD_NAME_MAX_LEN}
          placeholder="비우면 길드{id}로 초기화"
          className={`mt-1 ${field}`}
        />
      </label>

      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" checked={sendMail} onChange={(e) => setSendMail(e.target.checked)} />
        길드장에게 우편 보내기
      </label>

      {sendMail && (
        <div className="space-y-2">
          <input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setTitleTouched(true);
            }}
            maxLength={60}
            placeholder="우편 제목"
            className={field}
          />
          <textarea
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              setBodyTouched(true);
            }}
            rows={7}
            maxLength={1000}
            placeholder="우편 본문"
            className={field}
          />
          {(titleTouched || bodyTouched) && (
            <p className="text-[10px] text-zinc-400">직접 수정한 문구라 이름을 바꿔도 자동으로 덮어쓰지 않습니다.</p>
          )}
        </div>
      )}

      <button type="button" onClick={submit} disabled={pending} className={`${btn} w-full bg-amber-600 text-white`}>
        {pending ? '처리 중…' : '이름 변경 적용'}
      </button>

      {msg && (
        <p className={`text-[11px] ${msg.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>{msg.text}</p>
      )}
    </div>
  );
}
