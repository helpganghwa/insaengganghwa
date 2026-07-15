import Link from 'next/link';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';

import { PublicFooter } from '@/components/PublicFooter';

import { signInWithKakao, signInWithCredentials } from '@/lib/auth/actions';
import { getSessionUserId } from '@/lib/auth/session';
import { isCbtPaidHidden } from '@/lib/auth/test-accounts';
import { listServersPublic, latestOpenServerId } from '@/lib/game/server-select';
import { Suspense } from 'react';
import { EnhanceStatsCard, EnhanceStatsFallback } from '@/components/EnhanceStatsCard';
import { ServerPicker } from './ServerPicker';

/**
 * 로그인 에러 표시 문구 — 내부 코드(oauth_failed 등)를 유저 친화 한글로 매핑. actions.ts가
 * 이미 한글 메시지를 넘긴 경우(한글 포함)는 그대로 노출하고, 매핑에 없는 미지의 코드는
 * 원문 대신 일반 안내로 대체(내부 코드 유출 방지).
 */
function loginErrorMessage(raw: string): string {
  const MAP: Record<string, string> = {
    oauth_failed: '로그인에 실패했어요. 잠시 후 다시 시도해 주세요.',
  };
  if (MAP[raw]) return MAP[raw];
  if (/[가-힣]/.test(raw)) return raw; // 이미 한글 안내 메시지
  return '로그인에 실패했어요. 잠시 후 다시 시도해 주세요.';
}

/** 로그인 화면 서버 기본 선택 — 공유된 서버 > 직전 접속 서버(srv 잔존) > 최신 open 서버. */
async function defaultServerId(open: { id: number; status: string }[]): Promise<number> {
  const jar = await cookies();
  const cand = [Number(jar.get('pending_server')?.value), Number(jar.get('srv')?.value)];
  for (const c of cand) {
    if (Number.isInteger(c) && open.some((s) => s.id === c && s.status === 'open')) return c;
  }
  return latestOpenServerId();
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; test?: string }>;
}) {
  if (await getSessionUserId()) redirect('/'); // 로컬 JWT 검증 (CLAUDE §11.1)
  const { error, test } = await searchParams;
  // 서버 선택(SERVER.md §3) — 접속 가능한 서버가 1개라도 있으면 셀렉터 노출(0개일 때만 숨김).
  // 변경은 로그아웃 후 여기서.
  const servers = await listServersPublic().catch(() => [] as { id: number; name: string; status: string }[]);
  const showServers = servers.length >= 1;
  const defaultSrv = showServers ? await defaultServerId(servers) : 1;
  const recommendedId = showServers ? await latestOpenServerId() : 1;
  // 심사용 ID/PW 로그인 — ?test=true면 상시 노출(env 게이트 없음, 출시 후 재심의 지속 대응).
  // 원클릭 버튼(비번 우회)은 폐지 — 링크가 유출돼도 아이디/비밀번호를 알아야만 로그인 가능.
  const reviewLogin = test === 'true';

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[390px] flex-col bg-[#17110c] text-zinc-200">
      {/* 풀블리드 히어로 — 타이틀'인생강화'·부제'강화는 인생이다' 포함(생성 배경). 하단이 #17110c로
          페이드(베이킹)돼 아래 콘텐츠와 seamless. 파일 없으면 다크 플레이스홀더. */}
      <div
        role="img"
        aria-label="인생강화 — 강화는 인생이다"
        className="aspect-[1344/768] w-full bg-[#17110c] bg-cover bg-top"
        style={{ backgroundImage: 'url(/login-hero.webp)' }}
      />

      <main className="flex w-full flex-1 flex-col items-center px-6 pb-3 pt-4 text-center">
        {/* 서버 선택 — 로그인 버튼 위(위치 유지), 영역·크기만 축소(컴팩트). 기본 서버가 쿠키에 선점돼 안 눌러도 정상 로그인. */}
        {showServers ? (
          <div className="mb-4 w-full">
            <ServerPicker servers={servers} defaultSrv={defaultSrv} recommendedId={recommendedId} />
          </div>
        ) : null}

        {/* 카카오 로그인 — 공식 가이드 준수(#FEE500 / 라벨 "카카오 로그인" / 심볼·텍스트 #000(85%) / radius 12px, 심볼 미변형).
            심사용(?test=true)에선 카카오 버튼을 숨기고 아래 ID/PW 폼만 노출(심사관 동선 단순화). */}
        {reviewLogin ? null : (
          <form action={signInWithKakao} className="w-full">
            <button
              type="submit"
              aria-label="카카오 로그인"
              className="flex w-full items-center justify-center gap-2 rounded-[12px] bg-[#FEE500] py-3.5 transition active:scale-[0.99] hover:brightness-95"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/kakao/kakao_symbol.png" alt="" aria-hidden className="h-[18px] w-auto" />
              <span className="text-[15px] font-bold text-black/85">카카오 로그인</span>
            </button>
          </form>
        )}

        {/* 소셜 증명 — 로그인 버튼 아래, 프로필 페이지와 동일 통계 카드(공유 컴포넌트) */}
        <div className="mt-5 w-full">
          <Suspense fallback={<EnhanceStatsFallback />}>
            <EnhanceStatsCard />
          </Suspense>
        </div>

        {/* 게임 소개 — 검색·AI 크롤러가 읽는 유일한 공개 설명(SEO 검수 A1, 2026-07-15).
            스크롤 아래 배치라 로그인 전환 동선 무영향. h1은 사이트 전체에서 이 페이지가 대문. */}
        <section className="mt-8 w-full text-left">
          <h1 className="text-[17px] font-extrabold leading-snug text-zinc-100">
            인생강화 — 기다릴수록 강해지는 방치형 강화 RPG
          </h1>
          <p className="mt-2 text-[12.5px] leading-relaxed text-zinc-400">
            장비를 강화 슬롯에 올려두면 시간이 흐를수록 성공 확률이 올라갑니다. 조급하게 두드릴지,
            끝까지 기다릴지 — 선택은 당신의 몫. 설치 없이 웹에서 바로, 무료로 시작하세요.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {[
              ['⏳', '시간이 무기', '기다릴수록 오르는 성공 확률, 자면서도 성장'],
              ['📦', '수집과 초월', '100종+ 장비, 중복 수집으로 자동 초월'],
              ['⚔️', '함께 겨루기', '레이드 · 매일 아침 대난투 · 길드 점령전'],
              ['🆓', '가볍게 시작', '설치 없음, 카카오 3초 로그인, 무료'],
            ].map(([icon, t, d]) => (
              <div key={t} className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
                <div className="text-base" aria-hidden>
                  {icon}
                </div>
                <h2 className="mt-1 text-[12px] font-bold text-zinc-200">{t}</h2>
                <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-500">{d}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-zinc-500">
            <Link href="/probability" className="underline">
              강화 확률 공시
            </Link>
            {' · '}
            <Link href="/pricing" className="underline">
              상품 안내
            </Link>
          </p>
        </section>

        {/* 심사용 ID/PW 로그인 — 포트원·게임위 심사관이 카카오 없이 로그인. env로만 노출/차단. */}
        {reviewLogin ? (
          <form action={signInWithCredentials} className="w-full space-y-2 text-left">
            <input
              type="email"
              name="email"
              autoComplete="username"
              placeholder="아이디(이메일)"
              className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-base dark:border-zinc-700 dark:bg-zinc-900"
            />
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              placeholder="비밀번호"
              className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-base dark:border-zinc-700 dark:bg-zinc-900"
            />
            <button
              type="submit"
              className="block w-full rounded-xl bg-zinc-800 py-3 text-sm font-bold text-white transition active:scale-[0.99] hover:bg-zinc-700 dark:bg-zinc-200 dark:text-zinc-900 dark:hover:bg-white"
            >
              로그인
            </button>
          </form>
        ) : null}

        {error ? (
          error === 'cancelled' ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">로그인이 취소되었어요. 다시 시도해 주세요.</p>
          ) : (
            <p className="text-sm text-red-600 dark:text-red-400">{loginErrorMessage(error)}</p>
          )
        ) : null}
        {/* 서브듀드 — CBT 기간 데이터 초기화 사전 고지(작게·저대비, 문구는 원문 유지). 정식 오픈(env off) 시 자동 미노출. */}
        {isCbtPaidHidden() ? (
          <div className="mt-4 w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 text-left text-[11px] leading-relaxed text-zinc-500">
            <p className="font-semibold text-zinc-400">비공개 테스트(CBT) 안내</p>
            <p className="mt-1">
              지금은 CBT 기간으로, 테스트 종료 시 게임 데이터가 초기화될 수 있습니다. 테스트에 참여해 주신
              분들께는 정식 오픈 때 감사 보상이 지급됩니다.
            </p>
          </div>
        ) : null}
        <p className="mt-5 text-[11px] leading-relaxed text-zinc-500">
          로그인 시{' '}
          <Link href="/legal/terms" className="underline">
            이용약관
          </Link>{' '}
          및{' '}
          <Link href="/legal/privacy" className="underline">
            개인정보처리방침
          </Link>
          에 동의하는 것으로 간주됩니다.
        </p>
      </main>
      <PublicFooter />
    </div>
  );
}
