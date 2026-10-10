'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';

import { worldBossTraitDef } from '@/lib/game/guild/balance';
import type { AdminWorldBossBoard, SpawnOverlap } from '@/lib/game/world-boss/admin';

import { ServerBadge } from '../ServerBadge';
import { cancelWorldBossAction, spawnWorldBossAction } from './actions';
import { AdminZoneMap } from './AdminZoneMap';

const REGION_KO: Record<string, string> = { kingdom: '왕국', marsh: '늪지', volcano: '화산', snow: '설원', academy: '학원', desert: '사막' };
const STATUS_KO: Record<string, { label: string; cls: string }> = {
  active: { label: '출현 중', cls: 'bg-orange-700/80 text-orange-50' },
  scheduled: { label: '예정', cls: 'bg-sky-800/80 text-sky-100' },
  left: { label: '종료', cls: 'bg-zinc-700 text-zinc-300' },
};
const ERROR_KO: Record<string, string> = {
  ZONE_BUSY: '그 구역엔 이미 출현 중이거나 예정인 보스가 있어요.',
  ZONE_NOT_FOUND: '구역을 찾을 수 없어요.',
  PAST: '지난 시각이에요. 즉시 소환하거나 앞 시각으로 잡아 주세요.',
  TOO_FAR: '30일 안쪽으로만 예약할 수 있어요.',
  BAD_SERVER: '운영 중인 서버가 아니에요.',
  BAD_TIME: '시각 형식이 올바르지 않아요.',
};

/** ISO → 'MM-DD HH:mm'(KST). */
function kst(iso: string): string {
  const d = new Date(iso);
  const p = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return `${g('month')}-${g('day')} ${g('hour')}:${g('minute')}`;
}

/** 지금 + 1시간을 datetime-local(KST) 기본값으로 — 분은 00으로 맞춘다. */
function defaultAtLocal(): string {
  const d = new Date(Date.now() + 3_600_000 + 9 * 3_600_000);
  d.setUTCMinutes(0, 0, 0);
  return d.toISOString().slice(0, 16);
}

export function WorldBossAdminClient({ board, mapSrc }: { board: AdminWorldBossBoard; mapSrc: string }) {
  const router = useRouter();
  const [serverId, setServerId] = useState(board[0]?.serverId ?? 1);
  const [zoneId, setZoneId] = useState<number | ''>('');
  const [mode, setMode] = useState<'now' | 'at'>('now');
  const [atLocal, setAtLocal] = useState(defaultAtLocal);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const server = useMemo(() => board.find((s) => s.serverId === serverId) ?? board[0], [board, serverId]);
  const zone = server?.zones.find((z) => z.id === zoneId);
  const liveCount = server?.bosses.filter((b) => b.status !== 'left').length ?? 0;

  const submit = (allowOverlap: boolean) => {
    if (zoneId === '') return setMsg({ tone: 'err', text: '구역을 골라 주세요.' });
    start(async () => {
      const r = await spawnWorldBossAction({ serverId, zoneId, mode, atLocal, allowOverlap });
      if (r.ok) {
        setMsg({ tone: 'ok', text: r.status === 'active' ? `${r.zoneName}에 소환했어요 — 지금 출현, ${kst(r.leaveAt)} 종료.` : `${r.zoneName}에 예약했어요 — ${kst(r.spawnAt)} 출현, ${kst(r.leaveAt)} 종료.` });
        setZoneId('');
        router.refresh();
        return;
      }
      if (r.code === 'OVERLAP') {
        // 동시에 2마리 — 한 번 더 묻고 진행(10-11 사용자).
        const lines = r.overlapping.map((o: SpawnOverlap) => `· ${o.zoneName} — ${STATUS_KO[o.status]?.label ?? o.status}, ${kst(o.spawnAt)} ~ ${kst(o.leaveAt)}`).join('\n');
        const n = r.overlapping.length;
        if (window.confirm(`이미 출현 중·예정인 보스가 ${n}마리 있어요.\n\n${lines}\n\n머무는 시간이 겹쳐 동시에 ${n + 1}마리가 돼요. 그래도 소환할까요?`)) submit(true);
        else setMsg({ tone: 'err', text: '소환하지 않았어요.' });
        return;
      }
      setMsg({ tone: 'err', text: ERROR_KO[r.code] ?? r.code });
    });
  };

  const cancel = (bossId: string, zoneName: string, spawnAt: string) => {
    if (!window.confirm(`${zoneName} ${kst(spawnAt)} 예약을 취소할까요?`)) return;
    start(async () => {
      const r = await cancelWorldBossAction({ serverId, bossId });
      setMsg(r.ok ? { tone: 'ok', text: `${zoneName} 예약을 취소했어요.` } : { tone: 'err', text: '취소하지 못했어요. 이미 출현했거나 지워진 보스예요.' });
      router.refresh();
    });
  };

  const field = 'w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100';
  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
        <h2 className="text-sm font-bold text-zinc-200">소환</h2>
        <label className="block text-xs text-zinc-400">
          서버
          <select
            className={`${field} mt-1`}
            value={serverId}
            onChange={(e) => {
              setServerId(Number(e.target.value));
              setZoneId('');
            }}
          >
            {board.map((s) => (
              <option key={s.serverId} value={s.serverId}>
                srv{s.serverId}
              </option>
            ))}
          </select>
        </label>
        {/* 세계지도에서 고르기(10-11 사용자) — 구역 이름·점령 길드 문양·보스 유무를 보고 누른다. 아래 선택 상자는 같은 값을 보여 주는 보조. */}
        <div className="text-xs text-zinc-400">
          구역 — 지도에서 누르세요
          <div className="mt-1">
            <AdminZoneMap mapSrc={mapSrc} zones={server?.zones ?? []} selectedId={zoneId === '' ? null : zoneId} onSelect={(id) => setZoneId(id)} />
          </div>
          <p className="mt-1 text-[11px] text-zinc-500">🔥 = 보스가 있는 구역(선택 불가) · 문양 = 점령 길드 · 테두리 색 = 지역</p>
        </div>
        <label className="block text-xs text-zinc-400">
          고른 구역
          <select className={`${field} mt-1`} value={zoneId} onChange={(e) => setZoneId(e.target.value === '' ? '' : Number(e.target.value))}>
            <option value="">구역을 고르세요</option>
            {server?.zones.map((z) => (
              <option key={z.id} value={z.id} disabled={z.busy}>
                [{REGION_KO[z.region] ?? z.region}] {z.name} · {z.ownerName ?? '주인 없음'}
                {z.busy ? ' · 보스 있음' : ''}
              </option>
            ))}
          </select>
        </label>
        {zone && !zone.ownerName && (
          <p className="rounded-lg border border-amber-700/60 bg-amber-950/30 px-3 py-2 text-xs text-amber-200">
            주인 없는 구역이에요. 원정대는 구역 주인 길드원만 만들 수 있어서, 누가 점령하기 전엔 아무도 싸울 수 없어요.
          </p>
        )}
        <div className="flex gap-2 text-xs">
          {(['now', 'at'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`flex-1 rounded-lg border px-3 py-2 font-bold ${mode === m ? 'border-orange-500 bg-orange-600/20 text-orange-200' : 'border-zinc-700 bg-zinc-900 text-zinc-400'}`}
            >
              {m === 'now' ? '즉시 소환' : '예약 소환'}
            </button>
          ))}
        </div>
        {mode === 'at' && (
          <label className="block text-xs text-zinc-400">
            출현 시각(KST)
            <input type="datetime-local" className={`${field} mt-1`} value={atLocal} onChange={(e) => setAtLocal(e.target.value)} />
            <span className="mt-1 block text-[11px] text-zinc-500">그 시각부터 48시간 머물러요.</span>
          </label>
        )}
        {liveCount > 0 && (
          <p className="text-[11px] text-zinc-500">
            srv{serverId}에 출현 중·예정인 보스 {liveCount}마리. 머무는 시간이 겹치면 소환 전에 한 번 더 물어요.
          </p>
        )}
        <button
          type="button"
          disabled={pending || zoneId === ''}
          onClick={() => submit(false)}
          className="w-full rounded-lg bg-orange-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
        >
          {pending ? '처리 중…' : mode === 'now' ? '지금 소환' : '예약'}
        </button>
        {msg && <p className={`text-xs ${msg.tone === 'ok' ? 'text-emerald-300' : 'text-red-300'}`}>{msg.text}</p>}
      </section>

      {board.map((s) => (
        <section key={s.serverId} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-bold text-zinc-200">
            <ServerBadge serverId={s.serverId} /> 보스 목록 <span className="text-[11px] font-normal text-zinc-500">출현 중·예정 전부 + 최근 종료 5</span>
          </h2>
          {s.bosses.length === 0 ? (
            <p className="text-xs text-zinc-500">없음</p>
          ) : (
            <ul className="divide-y divide-zinc-800 text-xs">
              {s.bosses.map((b) => (
                <li key={b.id} className="flex items-center gap-2 py-2">
                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${STATUS_KO[b.status]?.cls ?? ''}`}>{STATUS_KO[b.status]?.label ?? b.status}</span>
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block truncate text-zinc-100">
                      {b.zoneName} <span className="text-zinc-500">· {b.ownerName ?? '주인 없음'}</span>
                      {b.traits.length > 0 && <span className="text-zinc-500"> · {b.traits.map((t) => worldBossTraitDef(t)?.name ?? t).join(' · ')}</span>}
                    </span>
                    <span className="block text-zinc-500">
                      {kst(b.spawnAt)} ~ {kst(b.leaveAt)} · {b.stage}페이즈 · #{b.id}
                    </span>
                  </span>
                  {b.status === 'scheduled' && (
                    <button type="button" disabled={pending} onClick={() => cancel(b.id, b.zoneName, b.spawnAt)} className="shrink-0 rounded border border-red-700/70 px-2 py-1 text-[11px] font-bold text-red-300 disabled:opacity-50">
                      예약 취소
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
