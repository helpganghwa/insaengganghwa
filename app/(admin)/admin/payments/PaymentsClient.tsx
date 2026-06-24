'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { refundOrderAction } from './actions';

export type OrderRow = {
  id: string;
  serverId: number;
  product: string;
  krw: number;
  diamond: number;
  status: 'pending' | 'paid' | 'refunded';
  nickname: string | null;
  paidAt: string | null;
  createdAt: string;
};

const won = (n: number) => `₩${n.toLocaleString('ko-KR')}`;
const fmt = (iso: string) => iso.slice(0, 16).replace('T', ' ');

const STATUS_BADGE: Record<OrderRow['status'], { label: string; cls: string }> = {
  paid: { label: '결제완료', cls: 'bg-emerald-900/50 text-emerald-300 border-emerald-700/50' },
  refunded: { label: '환불됨', cls: 'bg-zinc-800 text-zinc-400 border-zinc-700' },
  pending: { label: '대기', cls: 'bg-amber-900/40 text-amber-300 border-amber-700/50' },
};

const ERR_MSG: Record<string, string> = {
  NOT_FOUND: '주문을 찾을 수 없습니다',
  NOT_REFUNDABLE: '환불 가능한 상태가 아닙니다',
  NOT_CANCELLED: '포트원에서 취소되지 않았습니다(결제 유지 중) — 콘솔 상태 확인',
  AMOUNT_MISMATCH: '금액 불일치',
  BAD_ID: '잘못된 주문',
  UNKNOWN: '오류가 발생했습니다',
};

export function PaymentsClient({
  orders: initial,
  date,
  prevDate,
  nextDate,
  today,
}: {
  orders: OrderRow[];
  date: string;
  prevDate: string;
  nextDate: string;
  today: string;
}) {
  const router = useRouter();
  const [orders, setOrders] = useState(initial);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const counts = orders.reduce(
    (a, o) => ((a[o.status] = (a[o.status] ?? 0) + 1), a),
    {} as Record<string, number>,
  );
  const refundable = orders.filter((o) => o.status === 'paid').length;

  const onRefund = (o: OrderRow) => {
    if (pendingId) return;
    if (!window.confirm(`환불할까요?\n\n${o.nickname ?? '?'} · ${o.product} · ${won(o.krw)}\n\n포트원 결제 취소 + 지급 재화(다이아·상자) 회수가 진행됩니다.`))
      return;
    setPendingId(o.id);
    setMsg(null);
    startTransition(async () => {
      const r = await refundOrderAction(o.id);
      setPendingId(null);
      if (r.status === 'success') {
        setOrders((prev) =>
          prev.map((x) => (x.id === o.id ? { ...x, status: 'refunded' as const } : x)),
        );
        setMsg(r.already ? '이미 환불된 건입니다.' : '환불 완료 — 재화를 회수했습니다.');
      } else {
        setMsg(`환불 실패: ${ERR_MSG[r.code] ?? r.code}`);
      }
    });
  };

  return (
    <div className="mx-auto w-full max-w-[860px] space-y-4 px-4 py-6 text-zinc-100">
      <div>
        <h1 className="text-xl font-bold">결제 내역 · 환불</h1>
        {/* 날짜 네비 — 전/다음날 + 날짜 선택. 오늘이면 다음날 비활성. */}
        <div className="mt-2 flex items-center gap-2">
          <Link
            href={`/admin/payments?date=${prevDate}`}
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-sm hover:bg-zinc-800"
          >
            ‹ 전날
          </Link>
          <input
            type="date"
            value={date}
            max={today}
            onChange={(e) => {
              if (e.target.value) router.push(`/admin/payments?date=${e.target.value}`);
            }}
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-sm tabular-nums"
          />
          {date < today ? (
            <Link
              href={`/admin/payments?date=${nextDate}`}
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-sm hover:bg-zinc-800"
            >
              다음날 ›
            </Link>
          ) : (
            <span className="rounded-lg border border-zinc-800 px-2.5 py-1 text-sm text-zinc-600">
              다음날 ›
            </span>
          )}
          {date !== today ? (
            <Link
              href="/admin/payments"
              className="ml-auto rounded-lg border border-amber-700/60 bg-amber-900/20 px-2.5 py-1 text-xs font-bold text-amber-300"
            >
              오늘
            </Link>
          ) : null}
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          {date} · 총 {orders.length}건 · 환불가능 {refundable} · 결제완료 {counts.paid ?? 0} · 환불{' '}
          {counts.refunded ?? 0} · 대기 {counts.pending ?? 0}
        </p>
      </div>

      {msg ? (
        <div className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm">{msg}</div>
      ) : null}

      {orders.length === 0 ? (
        <p className="py-12 text-center text-sm text-zinc-500">결제 내역이 없습니다.</p>
      ) : (
        <ul className="space-y-2">
          {orders.map((o) => {
            const badge = STATUS_BADGE[o.status];
            return (
              <li
                key={o.id}
                className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/50 px-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-bold">{o.nickname ?? '(알수없음)'}</span>
                    <span
                      className={`shrink-0 rounded border px-1.5 py-px text-[10px] font-bold ${badge.cls}`}
                    >
                      {badge.label}
                    </span>
                    {o.serverId !== 1 ? (
                      <span className="shrink-0 text-[10px] text-zinc-500">s{o.serverId}</span>
                    ) : null}
                  </div>
                  <div className="mt-0.5 truncate text-[11px] text-zinc-400">
                    {o.product} · {won(o.krw)}
                    {o.diamond > 0 ? ` · 💎${o.diamond.toLocaleString('ko-KR')}` : ''}
                  </div>
                  <div className="mt-0.5 text-[10px] tabular-nums text-zinc-600">
                    {fmt(o.paidAt ?? o.createdAt)}
                  </div>
                </div>
                {o.status === 'paid' ? (
                  <button
                    type="button"
                    onClick={() => onRefund(o)}
                    disabled={pendingId !== null}
                    className="shrink-0 rounded-lg border border-red-700/60 bg-red-900/30 px-3 py-1.5 text-xs font-bold text-red-300 transition hover:bg-red-900/50 disabled:opacity-40"
                  >
                    {pendingId === o.id ? '환불 중…' : '환불'}
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
