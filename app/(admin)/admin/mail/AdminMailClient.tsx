'use client';

import { useEffect, useRef, useState, useTransition } from 'react';

import {
  sendMailToUserAction,
  broadcastMailAction,
  scheduleBroadcastAction,
  cancelScheduledMailAction,
  getBroadcastRecipientCountAction,
  type MailPayload,
} from './actions';

type Mode = 'one' | 'broadcast';

/**
 * /admin/mail — 운영자 우편 발송 UI.
 * - 단건(닉네임 or userId) / 전체 broadcast 토글.
 * - 첨부: 다이아·슬롯별 보급권. 입력값은 서버에서 다시 clamp(1e9/1e4).
 * - 보내기 전 본문/제목/수신 대상 확인 UI(2-step). broadcast는 인원 큰 작업이라
 *   재확인 입력(수신자 수 또는 'BROADCAST') 요구.
 */
export function AdminMailClient({
  scheduled,
}: {
  scheduled: { id: string; title: string; scheduledAtKst: string; push: boolean }[];
}) {
  const bcKeyRef = useRef<string | null>(null);
  const [mode, setMode] = useState<Mode>('one');
  const [toKind, setToKind] = useState<'nickname' | 'code' | 'userId'>('nickname');
  const [to, setTo] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [diamond, setDiamond] = useState('');
  const [pushOn, setPushOn] = useState(true); // 앱 알림 동반 발송(admin 카테고리, 구독자만 수신)
  const [scheduleAt, setScheduleAt] = useState(''); // 예약 전송(KST datetime-local) — 빈값=즉시(0123)
  const [bw, setBw] = useState('');
  const [ba, setBa] = useState('');
  const [bc, setBc] = useState('');
  const [confirmBcast, setConfirmBcast] = useState('');
  const [bcastCount, setBcastCount] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  const [flash, setFlash] = useState<{ ok: boolean; msg: string } | null>(null);

  // 전체 발송 모드 진입 시 대상 인원 조회(발송 전 미리보기).
  useEffect(() => {
    if (mode !== 'broadcast') return;
    let alive = true;
    getBroadcastRecipientCountAction()
      .then((r) => {
        if (alive) setBcastCount(r.count);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [mode]);

  const payload: MailPayload = {
    diamond: Number(diamond) || 0,
    boxes: {
      weapon: Number(bw) || 0,
      armor: Number(ba) || 0,
      accessory: Number(bc) || 0,
    },
  };

  const reset = () => {
    setTo('');
    setTitle('');
    setBody('');
    setDiamond('');
    setBw('');
    setBa('');
    setBc('');
    setConfirmBcast('');
  };

  const submit = () =>
    startTransition(async () => {
      setFlash(null);
      if (!title.trim()) {
        setFlash({ ok: false, msg: '제목을 입력하세요.' });
        return;
      }
      if (mode === 'one') {
        if (!to.trim()) {
          setFlash({ ok: false, msg: '수신자를 입력하세요.' });
          return;
        }
        const r = await sendMailToUserAction({
          ...(toKind === 'nickname'
            ? { toNickname: to }
            : toKind === 'code'
              ? { toCode: to }
              : { toUserId: to }),
          title,
          body,
          payload,
          push: pushOn,
        });
        if (r.status === 'error') setFlash({ ok: false, msg: r.message });
        else {
          setFlash({ ok: true, msg: '발송 완료' });
          reset();
        }
      } else {
        if (confirmBcast !== 'BROADCAST') {
          setFlash({ ok: false, msg: '확인 칸에 "BROADCAST"를 입력하세요.' });
          return;
        }
        if (scheduleAt) {
          // 예약 전송(0123) — 즉시 발송 대신 예약 등록, 크론이 도래 시 발송.
          const r = await scheduleBroadcastAction({ title, body, payload, push: pushOn, scheduledAtKst: scheduleAt });
          if (r.status === 'error') setFlash({ ok: false, msg: r.message });
          else {
            setFlash({ ok: true, msg: '예약 등록 완료 — 예약 시각에 자동 발송됩니다' });
            setScheduleAt('');
            reset();
          }
          return;
        }
        // 멱등키(0110) — 전송 실패 재시도는 같은 키 재사용(전 유저 이중 발송 방지).
        bcKeyRef.current ??= crypto.randomUUID();
        const r = await broadcastMailAction({ title, body, payload, idemKey: bcKeyRef.current, push: pushOn });
        if (r.status === 'success') bcKeyRef.current = null;
        if (r.status === 'error') setFlash({ ok: false, msg: r.message });
        else {
          setFlash({ ok: true, msg: `${r.count}명에게 발송 완료` });
          reset();
        }
      }
    });

  return (
    <main className="mx-auto max-w-md p-4 text-sm">
      <h1 className="mb-3 text-lg font-bold">📮 우편 발송 (운영자)</h1>

      {/* 모드 토글 */}
      <div className="mb-3 flex gap-1 rounded-lg border border-zinc-300 p-1 dark:border-zinc-700">
        {(['one', 'broadcast'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`flex-1 rounded px-2 py-1.5 text-xs font-semibold ${
              mode === m
                ? 'bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900'
                : 'text-zinc-600 dark:text-zinc-400'
            }`}
          >
            {m === 'one' ? '단건 발송' : '전체 발송'}
          </button>
        ))}
      </div>

      {/* 수신자 (단건만) */}
      {mode === 'one' ? (
        <section className="mb-3 space-y-1.5">
          <label className="text-[11px] font-semibold text-zinc-500">수신자</label>
          <div className="flex gap-1.5">
            <select
              value={toKind}
              onChange={(e) => setToKind(e.target.value as 'nickname' | 'code' | 'userId')}
              className="rounded border border-zinc-300 bg-transparent px-2 py-1.5 text-base dark:border-zinc-700"
            >
              <option value="nickname">닉네임</option>
              <option value="code">코드</option>
              <option value="userId">userId</option>
            </select>
            <input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder={toKind === 'nickname' ? '닉네임' : toKind === 'code' ? '#UY1GToa9' : 'uuid'}
              className="flex-1 rounded border border-zinc-300 bg-transparent px-2 py-1.5 text-base dark:border-zinc-700"
            />
          </div>
        </section>
      ) : (
        <section className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-[11px] text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          ⚠ 전체 발송: 현재 가입자{' '}
          <strong className="tabular-nums">
            {bcastCount === null ? '조회 중…' : `${bcastCount.toLocaleString()}명`}
          </strong>
          에게 같은 우편을 발송합니다. 청크 500/배치.
        </section>
      )}

      {/* 제목 · 본문 */}
      <section className="mb-3 space-y-1.5">
        <label className="text-[11px] font-semibold text-zinc-500">제목 (100자)</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value.slice(0, 100))}
          placeholder="예: [점검 보상] 잠시 점검에 협조해주셔서 감사합니다"
          className="w-full rounded border border-zinc-300 bg-transparent px-2 py-1.5 text-base dark:border-zinc-700"
        />
      </section>
      <section className="mb-3 space-y-1.5">
        <label className="text-[11px] font-semibold text-zinc-500">본문 (1000자)</label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value.slice(0, 1000))}
          rows={4}
          placeholder="본문 (선택)"
          className="w-full rounded border border-zinc-300 bg-transparent px-2 py-1.5 text-base dark:border-zinc-700"
        />
      </section>

      {/* 첨부 */}
      <section className="mb-3 space-y-1.5">
        <label className="text-[11px] font-semibold text-zinc-500">첨부</label>
        <div className="grid grid-cols-4 gap-1.5">
          <NumInput value={diamond} onChange={setDiamond} label="💎" />
          <NumInput value={bw} onChange={setBw} label="무기" />
          <NumInput value={ba} onChange={setBa} label="방어" />
          <NumInput value={bc} onChange={setBc} label="장신" />
        </div>
        <p className="text-[10px] text-zinc-500">서버 clamp: 💎 ≤ 10억 / 보급권 ≤ 1만</p>
      </section>

      {/* broadcast 확인 */}
      {mode === 'broadcast' ? (
        <section className="mb-3 space-y-1.5">
          <label className="text-[11px] font-semibold text-zinc-500">예약 전송 (KST · 비우면 즉시 발송)</label>
          <input
            type="datetime-local"
            value={scheduleAt}
            onChange={(e) => setScheduleAt(e.target.value)}
            className="w-full rounded border border-zinc-300 bg-transparent px-2 py-1.5 text-base dark:border-zinc-700"
          />
          {scheduled.length > 0 ? (
            <div className="rounded border border-zinc-200 p-2 dark:border-zinc-800">
              <p className="mb-1 text-[10px] font-semibold text-zinc-500">대기 중인 예약 {scheduled.length}건</p>
              {scheduled.map((sm) => (
                <div key={sm.id} className="flex items-center justify-between gap-2 py-0.5 text-[11px]">
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-mono text-zinc-500">{sm.scheduledAtKst}</span> {sm.title}
                    {sm.push ? ' 🔔' : ''}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      startTransition(async () => {
                        const r = await cancelScheduledMailAction(sm.id);
                        setFlash(r.status === 'success' ? { ok: true, msg: '예약 취소됨' } : { ok: false, msg: r.message });
                      })
                    }
                    className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold text-red-500"
                  >
                    취소
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          <label className="text-[11px] font-semibold text-red-600">
            발송 확정 — &quot;BROADCAST&quot; 입력
          </label>
          <input
            value={confirmBcast}
            onChange={(e) => setConfirmBcast(e.target.value)}
            placeholder="BROADCAST"
            className="w-full rounded border border-red-400 bg-transparent px-2 py-1.5 text-base"
          />
        </section>
      ) : null}

      {flash ? (
        <p
          className={`mb-2 rounded px-2 py-1.5 text-[11px] ${
            flash.ok
              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
              : 'bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300'
          }`}
        >
          {flash.msg}
        </p>
      ) : null}

      {/* 앱 알림 동반 발송(선택) — 우편은 항상, 푸시는 체크 시(구독자만 실제 수신). */}
      <label className="mb-2 flex items-center gap-2 text-[13px] text-zinc-600 dark:text-zinc-300">
        <input
          type="checkbox"
          checked={pushOn}
          onChange={(e) => setPushOn(e.target.checked)}
          className="h-4 w-4 accent-amber-600"
        />
        앱 알림도 발송 (푸시 구독자만 수신)
      </label>
      <button
        type="button"
        disabled={pending}
        onClick={submit}
        className="w-full rounded-full bg-zinc-900 px-3 py-2.5 text-sm font-bold text-white disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900"
      >
        {pending ? '발송 중…' : mode === 'one' ? '발송' : '전체 발송'}
      </button>
    </main>
  );
}

function NumInput({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-[10px] text-zinc-500">{label}</span>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ''))}
        placeholder="0"
        className="w-full rounded border border-zinc-300 bg-transparent px-1.5 py-1 text-right text-base tabular-nums dark:border-zinc-700"
      />
    </label>
  );
}
