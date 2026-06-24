import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { Geist, Geist_Mono } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  // 절대 URL — manifest·OG·icons가 절대 경로로 직렬화되어야 PWA 설치 정상.
  // 도메인은 NEXT_PUBLIC_SITE_URL로 주입(서비스 주체/도메인 이전 대응 — docs/MIGRATION.md).
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://ganghwa.app'),
  title: '인생강화 — insaengganghwa',
  description: '강화는 인생이다.',
  applicationName: 'insaengganghwa',
  formatDetection: { telephone: false },
  // PWA: app/manifest.ts가 자동으로 <link rel="manifest"> 주입.
  // 아이콘은 app/icon.png(favicon) + app/apple-icon.png(iOS)도 Next convention으로
  // 자동 주입되지만, 사이즈/타입 명시를 위해 metadata에도 두 번 선언(중복 무해).
  icons: {
    icon: [{ url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
    apple: [{ url: '/apple-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  // iOS 홈 화면 추가 시 standalone(상단 사파리 chrome 제거) + 스플래쉬 화면.
  // iOS는 manifest를 읽지 않으므로 apple-touch-startup-image link로 직접 지정.
  // 디바이스별 media query 매칭 필수(매칭 안 되면 백색 빈 화면).
  appleWebApp: {
    capable: true,
    title: '인생강화',
    statusBarStyle: 'black-translucent',
    startupImage: [
      // iPhone 14/15 Pro Max (6.7") — 1290x2796
      {
        url: '/icons/splash-1290x2796.png',
        media:
          '(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)',
      },
      // iPhone 14/15 (6.1") — 1179x2556
      {
        url: '/icons/splash-1179x2556.png',
        media:
          '(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)',
      },
      // iPhone 12/13/14 (6.1") — 1170x2532
      {
        url: '/icons/splash-1170x2532.png',
        media:
          '(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)',
      },
      // iPhone 8/SE 2-3 (4.7") — 750x1334
      {
        url: '/icons/splash-750x1334.png',
        media:
          '(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)',
      },
    ],
  },
};

// 고정 390 — 출력 메타는 정확히 `<meta name="viewport" content="width=390">`.
// width=390만 있으면 브라우저가 initial-scale=기기폭/390을 자동 계산해 390 레이아웃을
// 화면에 꽉 맞춤(작은 폰 축소·큰 폰 확대, 모든 화면 동일 비율·좌우 여백0·가로 스크롤0).
// ⚠ initial-scale/maximum-scale/user-scalable=no 중 하나라도 들어가면 이 자동 핏이
//   무력화되어 375서 15px 가로 스크롤(검증됨).
//
// ⚠⚠ `initialScale: undefined`는 절대 제거 금지(불필요해 보여도). Next는 viewport
//   export를 기본값 `{ width:'device-width', initialScale:1 }`과 스프레드 병합한 뒤
//   null/undefined가 아닌 필드만 직렬화한다. 즉 `{ width:390 }`만 두면 기본값의
//   initialScale:1 이 살아남아 출력이 `width=390, initial-scale=1` → 375 가로 스크롤
//   재발. `initialScale: undefined`로 기본값 1을 덮어써야 출력에서 빠진다. 이것이
//   metadata API로 순수 width=390을 내는 유일한 방법(리터럴 <meta>는 Next 주입분과
//   중복되어 불가). CLAUDE §5.2.
// SSR에서 User-Agent로 '넓은 모바일 기기'(폴더블·태블릿) 판별 → device-width(정상 크기).
// width=390은 모바일에서 화면폭에 맞춰 스케일업하므로 폴드/태블릿은 과확대됨. 데스크톱은
// 스케일업 안 하므로 영향 없음(그대로 width=390, 390 컬럼 중앙). 펼침/접힘은 UA로 불가라 구분 안 함.
// initialScale: undefined는 순수 width=390 출력에 필수(§5.2).
// ⚠ 최신 크롬 UA 감축(모델→'K')은 Sec-CH-UA-Model 힌트로 보완. ⚠ iPadOS 13+는 Mac UA로
//   위장해 SSR 감지 불가(이 경우 width=390 유지 → 과확대, 클라 감지가 필요하면 추후 보완).
const FOLDABLE_UA = /SM-F9\d{2}|SM-W(?:9|20|21|22|23|24)\d{2}|Pixel Fold|Oppo Find N|vivo X Fold/i;

function isWideMobile(ua: string, model: string): boolean {
  if (FOLDABLE_UA.test(ua) || FOLDABLE_UA.test(model)) return true; // 폴더블
  if (/\bAndroid\b/i.test(ua) && !/\bMobile\b/i.test(ua)) return true; // 안드로이드 태블릿(폰엔 Mobile)
  if (/\biPad\b/i.test(ua)) return true; // 구형 iPad(신형은 Mac UA → 미감지)
  return false;
}

export async function generateViewport(): Promise<Viewport> {
  const h = await headers();
  // UA(비감축) + Sec-CH-UA-Model 힌트(감축 시) 둘 다 확인.
  const ua = h.get('user-agent') ?? '';
  const model = h.get('sec-ch-ua-model') ?? '';
  const wide = isWideMobile(ua, model);
  return wide
    ? { themeColor: '#151518', width: 'device-width', initialScale: 1 }
    : { themeColor: '#151518', width: 390, initialScale: undefined };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // ⚠ html/body에 overflow-x(예: overflow-x-hidden) 절대 금지. overflow가 한 축에만
  //   걸리면 다른 축이 visible→auto로 계산돼 body가 스크롤 컨테이너가 되고,
  //   AppHeader(sticky top-0)·BottomNav(sticky bottom-0)가 실제 스크롤 안 하는
  //   컨테이너 기준이 되어 고정이 풀린다(검증됨). width=390 뷰포트라 가로 오버플로
  //   자체가 없어 가드 불필요. 특정 요소가 390 초과 시 그 요소를 고치고 여기 금지.
  return (
    <html
      lang="ko"
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full overscroll-none antialiased`}
    >
      <body className="flex min-h-full flex-col overscroll-none bg-zinc-950 text-zinc-50">
        {children}
        {/* Vercel Web Analytics — 트래픽·페이지뷰·Web Vitals(쿠키리스). 대시보드 Analytics 활성화 필요. */}
        <Analytics />
      </body>
    </html>
  );
}
