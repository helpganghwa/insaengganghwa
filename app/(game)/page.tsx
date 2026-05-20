import Link from 'next/link';

import { vsrc } from '@/lib/asset-version';

/**
 * WIREFRAMES §1 — 홈 (메뉴 허브). 2×3 그리드 + 오늘의 보급.
 * 각 카드 = Pixellab 픽셀아트 배경(public/sprites/hub/*.png) + 하단 그라데이션
 * 텍스트(이름 + 한 줄 설명). 장비/강화 현황 정보 없음(강화 화면 전용).
 */
// 이미지 톤과 어울리는 카드 배경색 — 픽셀아트가 투명 영역 위에 떠 보이지 않도록.
const MENU = [
  { href: '/enhance', label: '강화', desc: '장비를 한계까지 단련', bg: '/sprites/hub/enhance.png', tint: '#3d1f0c' },
  { href: '/inventory', label: '인벤토리', desc: '보유 장비 관리', bg: '/sprites/hub/inventory.png', tint: '#3a2a1c' },
  { href: '/gacha', label: '보급', desc: '랜덤 장비 획득', bg: '/sprites/hub/gacha.png', tint: '#143a2a' },
  { href: '/raid', label: '레이드', desc: '보스 도전', bg: '/sprites/hub/raid.png', tint: '#3a1419' },
  { href: '/me', label: '프로필', desc: '내 정보·통계', bg: '/sprites/hub/profile.png', tint: '#1a2438' },
  { href: '/leaderboard', label: '랭킹', desc: '최강자 순위', bg: '/sprites/hub/ranking.png', tint: '#3d2a08' },
] as const;

export default function HomePage() {
  return (
    <div className="flex flex-col gap-4 px-4 py-4">
      <div className="grid grid-cols-2 gap-3">
        {MENU.map((m) => (
          <Link
            key={m.href}
            href={m.href}
            style={{ backgroundColor: m.tint }}
            className="relative flex aspect-[4/3] overflow-hidden rounded-2xl border border-zinc-800 transition active:scale-[0.98]"
          >
            {/* 픽셀아트 배경 — next/image 리샘플은 깨지므로 raw img + imageRendering:pixelated (CLAUDE §5.2). */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={vsrc(m.bg)}
              alt=""
              aria-hidden
              draggable={false}
              className="absolute inset-0 h-full w-full object-cover"
              style={{ imageRendering: 'pixelated' }}
            />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/55 to-transparent px-3 pb-2 pt-6">
              <div className="text-sm font-bold leading-tight text-white drop-shadow-sm">
                {m.label}
              </div>
              <div className="mt-0.5 text-[10px] leading-tight text-white/85">{m.desc}</div>
            </div>
          </Link>
        ))}
      </div>

      {/* 오늘의 보급 — 일일 무료 보급 상자 (수령 ledger는 후속: daily 클레임 테이블 필요) */}
      <Link
        href="/gacha"
        className="flex items-center justify-between rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/40"
      >
        <span className="flex flex-col">
          <span className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            🎁 오늘의 보급
          </span>
          <span className="text-xs text-amber-700/80 dark:text-amber-300/80">
            무기/방어구/장신구 보급 상자
          </span>
        </span>
        <span className="rounded-full bg-amber-500 px-3 py-1.5 text-xs font-bold text-amber-950">
          받으러 가기 →
        </span>
      </Link>
    </div>
  );
}
