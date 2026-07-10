import type { MetadataRoute } from 'next';

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://ganghwa.app';

/**
 * robots — 공개 페이지 크롤 허용 + sitemap 링크. 인증 게이트 게임경로/API/어드민은 크롤 무의미
 * (로그인 리다이렉트·비공개)라 차단해 크롤 예산을 공개 콘텐츠(로그인·확률공시·가격·법적고지·프로필)에 집중.
 * userAgent '*' = 구글봇·네이버 Yeti·다음 등 전부 적용.
 * ⚠ '/raid'는 공개 '/raid-invite'와 프리픽스 충돌하므로 disallow에서 제외(그 경로는 어차피 로그인 리다이렉트).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/admin',
          '/auth/',
          '/me',
          '/inventory',
          '/enhance',
          '/shop',
          '/mail',
          '/checkin',
          '/battlepass',
          '/melee',
          '/guild',
          '/world',
          '/leaderboard',
        ],
      },
    ],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
