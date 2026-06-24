'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';

import { BUSINESS_INFO } from '@/lib/legal/content';

const EMAIL = BUSINESS_INFO.email; // help@ganghwa.app

type Template = { id: string; label: string; desc: string; subject: string; note?: string };

// 문의 유형 템플릿 — 클릭 시 제목·본문(닉네임·코드 자동) 채운 mailto를 연다.
const TEMPLATES: Template[] = [
  {
    id: 'payment',
    label: '결제 · 환불 문의',
    desc: '결제 오류, 환불 요청',
    subject: '결제·환불 문의',
    note: '결제 일시와 상품명을 함께 적어주시면 빠르게 처리됩니다.',
  },
  {
    id: 'bug',
    label: '버그 · 오류 신고',
    desc: '게임 오류, 화면 깨짐',
    subject: '버그·오류 신고',
    note: '발생한 화면, 사용 기기/브라우저, 발생 시각을 적어주세요.',
  },
  {
    id: 'account',
    label: '계정 · 로그인 문의',
    desc: '로그인 불가, 계정 문제',
    subject: '계정·로그인 문의',
  },
  {
    id: 'etc',
    label: '건의 · 기타',
    desc: '제안, 기타 문의',
    subject: '건의·기타 문의',
  },
];

function buildMailto(t: Template, nickname: string, publicCode: string, serverName: string): string {
  const subject = `[인생강화] ${t.subject}`;
  const body = [
    `■ 문의 유형: ${t.label}`,
    `■ 닉네임: ${nickname} (#${publicCode})`,
    serverName ? `■ 서버: ${serverName}` : null,
    '',
    '■ 문의 내용:',
    '(여기에 작성해 주세요)',
    '',
    t.note ? `────────\n* ${t.note}` : null,
  ]
    .filter((x) => x !== null)
    .join('\n');
  return `mailto:${EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function SupportModal({
  nickname,
  publicCode,
  serverName,
}: {
  nickname: string;
  publicCode: string;
  serverName: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center px-3 py-2.5 text-left"
      >
        <span className="text-sm">고객센터 문의</span>
      </button>

      {open
        ? createPortal(
            <div
              className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
              onClick={() => setOpen(false)}
            >
              <div
                className="w-full max-w-[340px] rounded-2xl border border-zinc-200 bg-white p-4 shadow-xl dark:border-zinc-800 dark:bg-zinc-950"
                onClick={(e) => e.stopPropagation()}
              >
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-base font-bold">고객센터 문의</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="닫기"
                className="text-zinc-400 hover:text-zinc-600"
              >
                ✕
              </button>
            </div>
            <p className="text-[11px] leading-relaxed text-zinc-500">
              {nickname}{' '}
              <span className="tabular-nums text-zinc-400">(#{publicCode})</span> 님 · 유형을 고르면
              메일 앱이 열립니다. 내용을 작성해 보내주세요.
            </p>
            <p className="mt-0.5 text-[11px] text-zinc-400">{EMAIL}</p>

            <ul className="mt-3 space-y-2">
              {TEMPLATES.map((t) => (
                <li key={t.id}>
                  <a
                    href={buildMailto(t, nickname, publicCode, serverName)}
                    onClick={() => setOpen(false)}
                    className="block rounded-xl border border-zinc-200 bg-white px-3 py-2.5 transition active:scale-[0.99] hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                  >
                    <div className="text-sm font-bold">{t.label}</div>
                    <div className="mt-0.5 text-[11px] text-zinc-500">{t.desc}</div>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>,
            document.body,
          )
        : null}
    </>
  );
}
