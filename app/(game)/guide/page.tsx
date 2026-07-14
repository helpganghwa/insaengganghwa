import Link from 'next/link';

import { GuideTickerToggle } from '@/components/GuideTicker';

/**
 * 게임 안내 — 전 콘텐츠 설명 페이지(2026-07-14, 페이지별 투어 대체).
 * GNB 위 GuideTicker 탭 진입(팁의 anchor로 스크롤) + /me 메뉴. 이미지는 [이미지 슬롯]
 * 표기 위치에 스크린샷이 준비되는 대로 단계 교체. 세부 수치는 확률 공시가 단일 진실.
 */
export const dynamic = 'force-static';

function Sec({
  id,
  icon,
  title,
  children,
}: {
  id: string;
  icon: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-4 rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
      <h2 className="text-[15px] font-bold">
        {icon} {title}
      </h2>
      <div className="mt-2 space-y-2 text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-300">
        {children}
      </div>
    </section>
  );
}

export default function GuidePage() {
  return (
    <div className="space-y-3 px-4 py-4 pb-24">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-extrabold">게임 안내</h1>
        <GuideTickerToggle />
      </div>
      <p className="text-[12px] text-zinc-500">
        인생강화의 모든 콘텐츠를 한 곳에서. 확률·비용 수치는{' '}
        <Link href="/probability" className="underline underline-offset-2">
          확률 공시
        </Link>
        에서 확인할 수 있어요.
      </p>

      <Sec id="enhance" icon="⚒️" title="강화">
        <p>
          장비를 강화 슬롯에 올리면 시간이 흐르며 <b>성공 확률이 점점 올라가요</b>. 최고 확률에
          도달한 뒤 수령하는 것이 가장 안전하고, 수령 전까지는 최고 확률이 그대로 유지되니 늦게
          받아도 손해가 없어요.
        </p>
        <p>
          결과는 성공·유지·하락 세 갈래예요. 수령하면 다음 단계 강화가 자동으로 이어집니다.
          강화 슬롯은 부위(무기·방어구·장신구)당 2개씩 총 6개 — 여러 장비를 동시에 돌리세요.
          급하면 보석으로 남은 시간을 단축할 수 있어요.
        </p>
      </Sec>

      <Sec id="supply" icon="📦" title="보급">
        <p>
          보급상자를 열어 새 장비를 얻어요. <b>이미 가진 장비가 나오면 자동으로 초월 재료</b>가
          되어 그 장비의 초월 진행도가 쌓입니다 — 중복은 낭비가 아니에요.
        </p>
        <p>보급상자는 일일 보급 우편·레이드·대난투·출석 등 곳곳에서 얻을 수 있어요.</p>
      </Sec>

      <Sec id="transcend" icon="✦" title="초월">
        <p>
          같은 장비를 중복으로 모으면 초월 단계가 올라요. 초월할수록 장비 테두리 등급이
          화려해지고(일반→신화) 전투력이 크게 상승합니다. 장비 옆 <b>✦숫자</b>가 초월 단계예요.
        </p>
      </Sec>

      <Sec id="combat" icon="💪" title="전투력">
        <p>
          전투력은 <b>보유한 모든 장비</b>의 강화·초월을 합산한 값이에요. 장착 중인 6개만이
          아니라 <b>도감의 전 장비가 전부 계산에 들어갑니다</b> — 안 쓰는 장비도 강화해두면
          전투력이 올라요.
        </p>
        <p>전투력은 레이드 데미지, 대난투 승률, 랭킹에 영향을 줍니다.</p>
      </Sec>

      <Sec id="raid" icon="⚔️" title="레이드">
        <p>
          보스를 소환해 함께 사냥하는 협동 콘텐츠예요. 소환한 레이드는 친구·길드에 공개해 같이
          잡을 수 있고, <b>참여만 해도 정산 보상</b>을 받아요.
        </p>
        <p>
          레이드는 제한시간이 있어요 — 만료 전까지 공격해 페이즈를 많이 깰수록 보상이
          커집니다. 참여 횟수는 하루 한도가 있으니 레이드 탭에서 확인하세요.
        </p>
      </Sec>

      <Sec id="melee" icon="🥊" title="대난투">
        <p>
          매일 아침 <b>9시</b>, 전투력이 있는 모든 대장장이가 자동으로 참가하는 서버 전체
          배틀로얄이에요. 결과는 <b>10시에 발표</b>되고 등수에 따라 보상을 받아요 — 꼴찌도
          참가 보상이 있습니다.
        </p>
        <p>우승자는 트로피 아바타와 함께 명예의 전당에 기록돼요.</p>
      </Sec>

      <Sec id="guild" icon="🏰" title="길드">
        <p>
          길드에 가입하면 레이드 공유·기부·점령전을 함께해요. 기부는 하루 3회 — 길드 경험치와
          내 기여도가 함께 쌓입니다. 길드마다 카카오 오픈채팅을 연결할 수도 있어요.
        </p>
      </Sec>

      <Sec id="conquest" icon="🗺️" title="점령전 · 월드">
        <p>
          매일 밤 <b>11시</b>, 길드가 월드 구역을 두고 싸워요. 구역을 점령한 길드는 그 구역의
          세금 수익을 얻습니다. <b>거주 구역을 설정</b>하면 내 강화 성공이 그 구역의 세금
          포인트로 쌓여요.
        </p>
        <p>
          매일 자정, 어젯밤 전투의 이야기가 <b>연대기</b>로 기록됩니다 — 월드 지도에서
          읽어보세요.
        </p>
      </Sec>

      <Sec id="avatar" icon="✨" title="아바타">
        <p>
          다이아로 나만의 아바타를 AI로 생성할 수 있어요 — <b>지금 착용한 장비</b>가 아바타
          외형에 그대로 반영됩니다. 결과물에 결함이 있으면 자동 검토로 걸러지고 다이아는
          환불돼요.
        </p>
      </Sec>

      <Sec id="daily" icon="📅" title="일일 콘텐츠">
        <p>
          매일 자정 <b>일일 보급 우편</b>이 도착하고, <b>출석 캘린더</b>에서 매일 보상을 챙길
          수 있어요. 아침 9시 대난투 → 밤 11시 점령전 → 자정 연대기·보급으로 하루가
          돌아갑니다.
        </p>
      </Sec>

      <Sec id="friends" icon="👥" title="친구">
        <p>
          닉네임이나 코드(#)로 친구를 추가하세요 — 내 코드는 <b>설정 → 계정 → 코드</b>에
          있어요. 친구가 소환한 레이드에 바로 참여할 수 있게 됩니다.
        </p>
      </Sec>

      <Sec id="misc" icon="🔔" title="알림 · 기타">
        <p>
          알림을 켜면 강화 완료(최고 확률 도달)·레이드·문의 답변을 놓치지 않아요 — 설정에서
          언제든 켜고 끌 수 있습니다.
        </p>
        <p>
          강화·초월·보급의 모든 확률과 비용은{' '}
          <Link href="/probability" className="underline underline-offset-2">
            확률 공시
          </Link>
          에 투명하게 공개돼 있어요. 궁금한 점은 설정 → 고객센터 문의로 보내주세요.
        </p>
      </Sec>
    </div>
  );
}
