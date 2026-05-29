import { ImageResponse } from 'next/og';

import {
  RAID_BOSSES,
  RAID_BOSS_CODES,
  type RaidBoss,
} from '@/lib/game/raid/bosses';
import { getBossSprite } from '@/lib/game/raid/boss-sprites';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// 레이드 화면(BOSS_BG_CLASS)과 같은 톤의 배경색 — satori 인라인용 hex 그라데이션.
const BOSS_BG_HEX: Record<RaidBoss, string> = {
  slime_king: 'linear-gradient(160deg,#064e3b,#166534 55%,#022c22)',
  orc_chief: 'linear-gradient(160deg,#450a0a,#292524 55%,#09090b)',
  stone_golem: 'linear-gradient(160deg,#57534e,#292524 55%,#18181b)',
  dragon_west: 'linear-gradient(160deg,#7c2d12,#7f1d1d 55%,#09090b)',
  fallen_angel: 'linear-gradient(160deg,#2e1065,#581c87 55%,#09090b)',
};

export async function GET(
  req: Request,
  { params }: { params: Promise<{ bossCode: string }> },
) {
  const { bossCode } = await params;
  const code = ((RAID_BOSS_CODES as string[]).includes(bossCode)
    ? bossCode
    : 'slime_king') as RaidBoss;
  const boss = RAID_BOSSES[code];
  const sprite = getBossSprite(code);
  const origin = new URL(req.url).origin;
  const bgUrl = sprite?.bg ? `${origin}${sprite.bg}` : null;
  const staticUrl = sprite?.static ? `${origin}${sprite.static}` : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          position: 'relative',
          alignItems: 'center',
          justifyContent: 'center',
          background: BOSS_BG_HEX[code],
        }}
      >
        {/* 배경 이미지 — 레이드 화면처럼 배경색 위에 깔고 어둠 오버레이로 보스 부각 */}
        {bgUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={bgUrl}
            width={1200}
            height={630}
            alt=""
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              opacity: 0.55,
            }}
          />
        ) : null}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            background: 'radial-gradient(circle at 50% 42%, transparent, rgba(0,0,0,0.72))',
          }}
        />
        {/* 정적 보스 스프라이트 — 중앙 */}
        {staticUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={staticUrl}
            width={460}
            height={460}
            alt=""
            style={{ position: 'relative', width: 460, height: 460, objectFit: 'contain' }}
          />
        ) : null}
        <div
          style={{
            position: 'absolute',
            bottom: 46,
            left: 0,
            width: '100%',
            display: 'flex',
            justifyContent: 'center',
            fontSize: 70,
            fontWeight: 800,
            color: '#fde68a',
          }}
        >
          ⚔️ {boss.name} 레이드
        </div>
      </div>
    ),
    { ...size },
  );
}
