import Link from 'next/link';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';

import { PublicFooter } from '@/components/PublicFooter';

import { signInWithKakao, signInWithCredentials } from '@/lib/auth/actions';
import { getSessionUserId } from '@/lib/auth/session';
import { isCbtPaidHidden } from '@/lib/auth/test-accounts';
import { getMaintenanceState } from '@/lib/game/system-mode';
import { CbtEndedNotice, OPEN_AT_ISO } from './CbtEndedNotice';
import { listServersPublic, latestOpenServerId } from '@/lib/game/server-select';
import { Suspense } from 'react';
import { EnhanceStatsCard, EnhanceStatsFallback } from '@/components/EnhanceStatsCard';
import { ServerPicker } from './ServerPicker';
import { ZoomSafeInput } from '@/components/ui/ZoomSafeField';

// 걸린 렌더의 상한(2026-07-31) — 풀 포화 시 postgres.js가 쿼리를 **기한 없이 큐에 세워**
// 페이지 스트림이 안 끝나고 300s에 강제 종료되던 것(7일 128건)을 60s로 단축. 근본 원인
// (풀러 포화)의 완충일 뿐이며, 해소는 Supabase Pool Size 상향 + 핫패스 쿼리 통합이 맡는다.
export const maxDuration = 60;

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
  // 스테이징(preview)은 항상 노출 — PWA는 주소창이 없어 ?test=true를 붙일 수 없다(검수 동선).
  const reviewLogin = test === 'true' || process.env.VERCEL_ENV === 'preview';
  // CBT 종료 모드(0144) — 일반 화면은 로그인 수단 없이 종료 안내·카운트다운만.
  // ?test=true는 ID/PW(심사) + 카카오(어드민 전용 — 콜백에서 검증)를 함께 노출.
  const maint = await getMaintenanceState().catch(() => null);
  // 시간 게이트(무인 오픈, 2026-08-21) — 서버는 8/24 10:30에 자동 live가 되지만(완충 30분),
  // 화면은 OPEN_AT_ISO(11:00) 전까지 종료 화면을 유지해 "11시 정각 오픈" 약속을 지킨다.
  // 카운트다운 0에서 CbtEndedNotice가 자동 새로고침 → 이 조건이 false가 되며 로그인 화면 착지.
  // 오픈 이후에는 영구 false라 잔여 영향 없음. ?test=true 우회는 기존 분기 그대로.
  const preOpen = Date.now() < Date.parse(OPEN_AT_ISO);
  const cbtEnded = (maint?.active === true && maint.mode === 'cbt_ended') || preOpen;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[390px] flex-col bg-[#17110c] text-zinc-200">
      {/* 풀블리드 히어로 — 타이틀'인생강화'·부제'강화는 인생이다' 포함(생성 배경). 하단이 #17110c로
          페이드(베이킹)돼 아래 콘텐츠와 seamless. 파일 없으면 다크 플레이스홀더. */}
      {cbtEnded && !reviewLogin ? null : (
        <div
          role="img"
          aria-label="인생강화 — 강화는 인생이다"
          className="aspect-[1344/768] w-full bg-[#17110c] bg-cover bg-top"
          style={{ backgroundImage: 'url(/login-hero.webp)' }}
        />
      )}

      {/* CBT 종료(0144, E-1) — main을 통째로 대체한다. main을 남기면 flex-1 잔여 높이가
          빈 검정으로 남아 "하단 공백"이 된다(2026-07-31 피드백) — 종료 섹션이 flex-1을
          이어받아 그 공간을 배경 이미지로 채운다. */}
      {cbtEnded && !reviewLogin ? (
        <CbtEndedNotice />
      ) : (
      <main className="flex w-full flex-1 flex-col items-center px-6 pb-3 pt-4 text-center">
        {/* 서버 선택 — 로그인 버튼 위(위치 유지), 영역·크기만 축소(컴팩트). 기본 서버가 쿠키에 선점돼 안 눌러도 정상 로그인. */}
        {showServers && !(cbtEnded && !reviewLogin) ? (
          <div className="mb-4 w-full">
            <ServerPicker servers={servers} defaultSrv={defaultSrv} recommendedId={recommendedId} />
          </div>
        ) : null}

        {cbtEnded && reviewLogin ? (
          <div className="mb-3 w-full space-y-2">
            <CbtEndedNotice compact />
            {/* 어드민용 카카오 — 콜백이 어드민 외 세션을 즉시 끊는다(auth/callback 0144 게이트). */}
            <form action={signInWithKakao} className="w-full">
              <button
                type="submit"
                aria-label="카카오 로그인(관리자)"
                className="flex w-full items-center justify-center gap-2 rounded-[12px] bg-[#FEE500] py-3 transition active:scale-[0.99] hover:brightness-95"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/kakao/kakao_symbol.png" alt="" aria-hidden className="h-[18px] w-auto" />
                <span className="text-[15px] font-bold text-black/85">카카오 로그인 (관리자)</span>
              </button>
            </form>
          </div>
        ) : null}

        {/* 카카오 로그인 — 공식 가이드 준수(#FEE500 / 라벨 "카카오 로그인" / 심볼·텍스트 #000(85%) / radius 12px, 심볼 미변형).
            심사용(?test=true)은 같은 자리에 ID/PW 폼 — 폼이 페이지 하단에 있어 심사관이
            스크롤로 찾아야 했다(2026-07-31 피드백). */}
        {cbtEnded && !reviewLogin ? null : reviewLogin ? (
          <form action={signInWithCredentials} className="w-full space-y-2 text-left">
            <ZoomSafeInput
              type="email"
              name="email"
              autoComplete="username"
              placeholder="아이디(이메일)"
              wrapClassName="h-[38px] w-full"
              className="rounded-xl border border-zinc-300 bg-white px-3 dark:border-zinc-700 dark:bg-zinc-900"
            />
            <ZoomSafeInput
              type="password"
              name="password"
              autoComplete="current-password"
              placeholder="비밀번호"
              wrapClassName="h-[38px] w-full"
              className="rounded-xl border border-zinc-300 bg-white px-3 dark:border-zinc-700 dark:bg-zinc-900"
            />
            <button
              type="submit"
              className="block w-full rounded-xl bg-zinc-800 py-3 text-sm font-bold text-white transition active:scale-[0.99] hover:bg-zinc-700 dark:bg-zinc-200 dark:text-zinc-900 dark:hover:bg-white"
            >
              로그인
            </button>
          </form>
        ) : (
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

        {/* 약관 동의 고지 — 로그인 버튼 바로 아래(동의 시점과 근접). 종료 일반 화면(수단 없음)엔 미노출. */}
        {cbtEnded && !reviewLogin ? null : (
        <p className="mt-2.5 text-[11px] leading-relaxed text-zinc-500">
          로그인 시{' '}
          <Link prefetch={false} href="/legal/terms" className="underline">
            이용약관
          </Link>{' '}
          및{' '}
          <Link prefetch={false} href="/legal/privacy" className="underline">
            개인정보처리방침
          </Link>
          에 동의하는 것으로 간주됩니다.
        </p>
        )}

        {/* 로그인 실패 안내 — 버튼·폼 바로 아래(하단에 있으면 실패 사유를 못 보고 재시도한다). */}
        {error ? (
          error === 'cancelled' ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">로그인이 취소되었어요. 다시 시도해 주세요.</p>
          ) : (
            <p className="text-sm text-red-600 dark:text-red-400">{loginErrorMessage(error)}</p>
          )
        ) : null}

        {/* 소셜 증명 — 로그인 버튼 아래, 프로필 페이지와 동일 통계 카드(공유 컴포넌트).
            종료 화면에선 결산 명판이 같은 역할이라 숨김(라이브 집계 중복 + wipe 후 0으로 보임). */}
        {cbtEnded && !reviewLogin ? null : (
          <div className="mt-5 w-full">
            <Suspense fallback={<EnhanceStatsFallback />}>
              <EnhanceStatsCard />
            </Suspense>
          </div>
        )}

        {/* 게임 소개 — 검색·AI 크롤러가 읽는 유일한 공개 설명(SEO 검수 A1, 2026-07-15).
            스크롤 아래 배치라 로그인 전환 동선 무영향. h1은 사이트 전체에서 이 페이지가 대문. */}
        {cbtEnded && !reviewLogin ? null : (
        <section className="mt-6 w-full text-left">
          <h1 className="text-[13.5px] font-extrabold leading-snug text-zinc-100">
            인생강화 — 기다릴수록 강해지는 방치형 강화 RPG
          </h1>
          <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-400">
            장비를 강화 슬롯에 올려두면 시간이 흐를수록 성공 확률이 올라갑니다. 조급하게 두드릴지,
            끝까지 기다릴지 — 선택은 당신의 몫. 설치 없이 웹에서 바로, 무료로 시작하세요.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-1.5">
            {[
              ['⏳', '시간이 무기', '기다릴수록 오르는 성공 확률'],
              ['📦', '수집과 초월', '100종+ 장비, 중복 수집 자동 초월'],
              ['⚔️', '함께 겨루기', '레이드 · 대난투 · 길드 점령전'],
              ['⚡', '가볍게 시작', '설치 없음, 카카오 3초, 무료'],
            ].map(([icon, t, d]) => (
              <div key={t} className="rounded-lg bg-white/[0.04] px-2.5 py-2">
                <h2 className="text-[11px] font-bold text-zinc-200">
                  <span aria-hidden>{icon}</span> {t}
                </h2>
                <p className="mt-0.5 text-[10px] leading-snug text-zinc-500">{d}</p>
              </div>
            ))}
          </div>
        </section>
        )}

        {/* 서브듀드 — CBT 기간 데이터 초기화 사전 고지(작게·저대비, 문구는 원문 유지). 정식 오픈(env off) 시 자동 미노출. */}
        {isCbtPaidHidden() && !cbtEnded ? (
          <div className="mt-4 w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 text-left text-[11px] leading-relaxed text-zinc-500">
            <p className="font-semibold text-zinc-400">비공개 테스트(CBT) 안내</p>
            <p className="mt-1">
              지금은 CBT 기간으로, 테스트 종료 시 게임 데이터가 초기화될 수 있습니다. 테스트에 참여해 주신
              분들께는 정식 오픈 때 감사 보상이 지급됩니다.
            </p>
          </div>
        ) : null}
      </main>
      )}
      <PublicFooter />
    </div>
  );
}
