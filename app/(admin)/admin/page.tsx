import Link from 'next/link';

/**
 * 관리자 허브 — /admin. (admin) 레이아웃이 접근을 게이트하므로 여기선 메뉴만.
 * 각 운영 페이지로 진입하는 카드 링크. 새 admin 페이지 추가 시 MENU에 1줄 추가.
 */
export const dynamic = 'force-dynamic';

const MENU: { href: string; icon: string; title: string; desc: string; external?: boolean }[] = [
  {
    href: '/admin/profile-gen',
    icon: '🎨',
    title: '아바타 생성 검수',
    desc: '생성 성공·실패 내역 조회, 통과 회수+환불 / 실패 아바타 지급 (분쟁 처리)',
  },
  {
    href: '/admin/reports',
    icon: '🚩',
    title: '프로필 신고',
    desc: '신고 누적 프로필 확인 및 비공개 조치',
  },
  {
    href: '/admin/mail',
    icon: '📬',
    title: '운영자 우편 발송',
    desc: '유저에게 다이아·보급상자·공지 우편 발송',
  },
  {
    href: '/admin/payments',
    icon: '💳',
    title: '결제 내역 · 환불',
    desc: '결제건 조회, 결제완료 건 환불(포트원 취소 + 재화 회수)',
  },
];

export default function AdminHubPage() {
  return (
    <div className="mx-auto w-full max-w-[760px] space-y-4 px-4 py-6 text-zinc-100">
      <h1 className="text-xl font-bold">🛠️ 관리자 메뉴</h1>
      <p className="text-xs text-zinc-500">운영 페이지로 이동합니다.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {MENU.map((m) => {
          const inner = (
            <>
              <div className="text-2xl">{m.icon}</div>
              <div className="min-w-0">
                <div className="font-bold">{m.title}</div>
                <div className="mt-0.5 text-xs text-zinc-400">{m.desc}</div>
              </div>
            </>
          );
          const cls =
            'flex items-start gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4 transition hover:border-amber-600 hover:bg-zinc-900';
          return m.external ? (
            <a key={m.href} href={m.href} className={cls}>
              {inner}
            </a>
          ) : (
            <Link key={m.href} href={m.href} className={cls}>
              {inner}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
