import Link from 'next/link';

import { GuideTickerToggle } from '@/components/GuideTicker';

/**
 * 게임 안내 — 전 콘텐츠 설명 페이지(2026-07-14, 페이지별 투어 대체).
 * 상단 카테고리 칩(가로 스크롤)으로 섹션 이동, 각 섹션에 해당 콘텐츠 바로가기 버튼.
 * GNB 위 GuideTicker 탭 진입(팁 anchor로 스크롤) + /me 메뉴. 이미지는 [이미지 슬롯]
 * 위치에 스크린샷이 준비되는 대로 단계 교체. 세부 수치는 확률 공시가 단일 진실.
 */
export const dynamic = 'force-static';

const CATS: { id: string; icon: string; label: string; go?: string; goLabel?: string }[] = [
  { id: 'enhance', icon: '⚒️', label: '강화', go: '/enhance', goLabel: '강화소 가기' },
  { id: 'supply', icon: '📦', label: '보급', go: '/gacha', goLabel: '보급소 가기' },
  { id: 'transcend', icon: '✦', label: '초월', go: '/inventory', goLabel: '인벤토리 가기' },
  { id: 'combat', icon: '💪', label: '전투력', go: '/me/codex', goLabel: '도감 가기' },
  { id: 'raid', icon: '⚔️', label: '레이드', go: '/raid', goLabel: '레이드 가기' },
  { id: 'melee', icon: '🥊', label: '대난투', go: '/melee', goLabel: '대난투 가기' },
  { id: 'guild', icon: '🏰', label: '길드', go: '/guild', goLabel: '길드 가기' },
  { id: 'conquest', icon: '🗺️', label: '점령전', go: '/guild/map', goLabel: '월드 지도 가기' },
  { id: 'avatar', icon: '✨', label: '아바타', go: '/me/profiles', goLabel: '아바타 관리 가기' },
  { id: 'daily', icon: '📅', label: '일일', go: '/checkin', goLabel: '출석 캘린더 가기' },
  { id: 'friends', icon: '👥', label: '친구', go: '/friends', goLabel: '친구 가기' },
  { id: 'misc', icon: '🔔', label: '알림·기타', go: '/me/settings', goLabel: '설정 가기' },
];

function Sec({ id, children }: { id: string; children: React.ReactNode }) {
  const cat = CATS.find((c) => c.id === id)!;
  return (
    <section
      id={id}
      className="scroll-mt-14 rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[15px] font-bold">
          {cat.icon} {cat.label}
        </h2>
        {cat.go ? (
          <Link
            href={cat.go}
            className="shrink-0 rounded-full bg-amber-600 px-2.5 py-1 text-[11px] font-bold text-white active:opacity-90"
          >
            {cat.goLabel} →
          </Link>
        ) : null}
      </div>
      <div className="mt-2 space-y-2 text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-300">
        {children}
      </div>
    </section>
  );
}

function H({ children }: { children: React.ReactNode }) {
  return <h3 className="pt-1 text-[12px] font-bold text-zinc-500 dark:text-zinc-400">{children}</h3>;
}

export default function GuidePage() {
  return (
    <div className="px-4 py-4 pb-24">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-extrabold">게임 안내</h1>
        <GuideTickerToggle />
      </div>
      <p className="mt-1 text-[12px] text-zinc-500">
        인생강화의 모든 콘텐츠를 한 곳에서. 확률·비용 수치는{' '}
        <Link href="/probability" className="underline underline-offset-2">
          확률 공시
        </Link>
        에서 확인할 수 있어요.
      </p>

      {/* 카테고리 칩 — sticky 가로 스크롤(앵커 이동) */}
      <nav className="sticky top-0 z-10 -mx-4 mt-3 border-b border-zinc-100 bg-white/95 px-4 py-2 backdrop-blur dark:border-zinc-900 dark:bg-zinc-950/95">
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {CATS.map((c) => (
            <a
              key={c.id}
              href={`#${c.id}`}
              className="shrink-0 rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-semibold text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300"
            >
              {c.icon} {c.label}
            </a>
          ))}
        </div>
      </nav>

      <div className="mt-3 space-y-3">
        <Sec id="enhance">
          <H>기본</H>
          <p>
            장비를 강화 슬롯에 올리면 시간이 흐르며 <b>성공 확률이 점점 올라가요</b>. 등록
            시점엔 낮은 확률로 시작해, 시간이 다 차면 그 단계의 <b>최고 확률</b>에 도달합니다.
            최고 확률에 도달한 뒤 수령하는 것이 가장 안전해요.
          </p>
          <H>수령과 판정</H>
          <p>
            결과는 <b>수령하는 순간</b> 결정돼요 — 성공(+1)·유지·하락 세 갈래입니다. 완료를
            늦게 받아도 손해가 없어요(수령 전까지 최고 확률 유지). 수령하면 다음 단계 강화가
            자동으로 이어집니다.
          </p>
          <H>슬롯과 단축</H>
          <p>
            강화 슬롯은 부위(무기·방어구·장신구)당 2개, 총 <b>6개</b> — 여러 장비를 동시에
            돌리세요. 급하면 보석으로 남은 시간을 단축할 수 있고, 진행 중인 강화는 카드 취소
            버튼(2번 탭)으로 내릴 수 있어요. 높은 단계일수록 시간이 길어지고 확률이
            낮아집니다 — 정확한 수치는 확률 공시에.
          </p>
        </Sec>

        <Sec id="supply">
          <H>상자 개봉</H>
          <p>
            보급상자는 부위별(무기·방어구·장신구)로 나뉘고, 열면 그 부위의 장비가 나와요.
            <b> 새 장비</b>면 도감에 등록되고, <b>이미 가진 장비</b>면 자동으로 그 장비의
            초월 재료가 됩니다 — 중복은 낭비가 아니에요.
          </p>
          <H>상자 얻는 곳</H>
          <p>
            매일 자정 일일 보급 우편 · 출석 캘린더 · 레이드 정산 · 대난투 순위 보상 · 각종
            이벤트 우편. 쌓인 상자는 보급소에서 한 번에 열 수 있어요.
          </p>
        </Sec>

        <Sec id="transcend">
          <H>자동 초월</H>
          <p>
            같은 장비를 중복으로 얻을 때마다 초월 진행도가 쌓이고, 필요 수량이 차면{' '}
            <b>자동으로 초월</b>돼요 — 따로 조작할 필요가 없습니다. 장비 옆 <b>✦숫자</b>가
            초월 단계예요.
          </p>
          <H>등급 테두리</H>
          <p>
            초월이 오를수록 장비 테두리 등급이 일반 → 고급 → 희귀 → 영웅 → 전설 → 신화로
            화려해지고, 전투력이 크게 상승합니다. 인벤토리와 도감에서 등급을 한눈에 볼 수
            있어요.
          </p>
        </Sec>

        <Sec id="combat">
          <H>모든 장비의 총합</H>
          <p>
            전투력은 <b>보유한 모든 장비</b>의 강화·초월을 합산한 값이에요. 장착 중인 6개만이
            아니라 <b>도감의 전 장비(106종)가 전부 계산에 들어갑니다</b>. 안 쓰는 장비도
            강화해두면 전투력이 올라요 — 강화 슬롯이 빌 때마다 다른 장비를 돌리는 것이
            고수의 방식입니다.
          </p>
          <H>전투력이 쓰이는 곳</H>
          <p>
            레이드 공격 데미지 · 대난투 승률 · 랭킹(전투력 부문) · 길드 전투력 합산(점령전
            배치)에 영향을 줍니다.
          </p>
        </Sec>

        <Sec id="raid">
          <H>소환과 참여</H>
          <p>
            다이아로 보스를 소환해 함께 사냥하는 협동 콘텐츠예요. 소환 시 공개 범위를
            정합니다 — 비공개 / <b>자유</b>(친구·길드원 즉시 참여) / <b>수락</b>(요청 후
            승인). 친구·길드원이 소환한 레이드는 레이드 탭 하단에 보여요 —{' '}
            <b>참여만 해도 정산 보상</b>을 받습니다.
          </p>
          <H>공격과 보상</H>
          <p>
            참가자마다 기본 공격 횟수가 있고, 다이아로 추가 공격을 살 수 있어요. 레이드는
            제한시간이 지나면 만료되고, 그때까지 깬 <b>페이즈 수에 비례해</b> 참가자 전원이
            보급상자를 받아요(기여 순위에 따라 차등). 참여 횟수는 하루 한도가 있습니다.
          </p>
        </Sec>

        <Sec id="melee">
          <H>매일 아침의 서버 배틀로얄</H>
          <p>
            매일 <b>9시</b>, 전투력이 있는 모든 대장장이가 <b>자동으로 참가</b>해요 — 신청도
            준비도 필요 없습니다. 전투는 서버가 시뮬레이션하고 결과는 <b>10시에 발표</b>돼요.
          </p>
          <H>보상과 명예</H>
          <p>
            등수에 따라 다이아+보급상자를 받아요 — <b>꼴찌도 참가 보상</b>이 있습니다(티어는
            확률 공시 참고). 전투력이 높을수록 유리하지만 데미지에 운이 섞여 있어 이변도
            일어나요. 우승자는 트로피 아바타와 함께 대난투 화면의 명예의 전당에 기록됩니다.
          </p>
        </Sec>

        <Sec id="guild">
          <H>가입</H>
          <p>
            길드 탭에서 랭킹·검색으로 길드를 찾아 가입해요(자유 가입/승인제). 길드 수용
            인원은 길드 레벨이 오를수록 늘어납니다.
          </p>
          <H>기부와 성장</H>
          <p>
            기부는 하루 3회(첫 회 무료) — 길드 경험치와 내 기여도가 함께 쌓여요. 길드
            레벨이 오르면 수용 인원이 늘고 점령전에서 유리해집니다.
          </p>
          <H>함께 하는 것들</H>
          <p>
            레이드 길드 공개 · 점령전(아래 참고) · 길드 문양(AI 생성, 1~5분 소요) · 카카오
            오픈채팅 연결. 길드장은 임원(부길드장·집행관) 임명과 운영을 맡아요.
          </p>
        </Sec>

        <Sec id="conquest">
          <H>매일 밤 11시, 구역 쟁탈</H>
          <p>
            월드 지도의 50개 구역을 길드끼리 두고 싸워요. 낮 동안 길드원이 구역에 병력을
            배치하고, <b>밤 11시</b>에 전투가 벌어져 자정 전에 결판이 납니다.
          </p>
          <H>세금 — 점령의 보상</H>
          <p>
            구역을 점령한 길드는 그 구역 <b>거주민의 강화 성공</b>이 만들어내는 세금
            포인트를 얻어요. 집행관이 수집한 세금은 길드 풀에 쌓이고 길드장이 분배합니다.
            나도 <b>거주 구역을 설정</b>해두면 내 강화가 그 구역의 세금에 기여해요.
          </p>
          <H>연대기</H>
          <p>
            매일 자정, 어젯밤 전투의 이야기가 <b>연대기</b>로 기록돼요 — 어느 길드가 어느
            땅을 갈랐는지, 월드 지도에서 읽어보세요.
          </p>
        </Sec>

        <Sec id="avatar">
          <H>AI로 만드는 나만의 아바타</H>
          <p>
            다이아로 아바타를 생성하면 <b>지금 착용한 장비 3종</b>이 외형에 그대로 반영돼요.
            생성엔 몇 분이 걸리고, 완성되면 프로필·랭킹·대난투 곳곳에 내 아바타가
            나타납니다. 첫 생성은 할인!
          </p>
          <H>자동 검토</H>
          <p>
            생성물은 AI가 자동 검토해요 — 결함(신체 오류·무기 파손 등)이 있으면 게시되지
            않고 <b>다이아가 전액 환불</b>됩니다. 결과가 마음에 안 들면 다시 생성할 수
            있어요(랜덤 요소가 있어 매번 다르게 나옵니다).
          </p>
        </Sec>

        <Sec id="daily">
          <H>하루 루틴</H>
          <p>
            <b>자정</b> 일일 보급 우편 도착 + 연대기 공개 → <b>아침 9시</b> 대난투 →{' '}
            <b>10시</b> 결과 발표 → <b>밤 11시</b> 점령전. 우편 보상은 30일 안에
            수령하세요.
          </p>
          <H>출석 캘린더</H>
          <p>매일 출석 보상을 챙길 수 있어요 — 프로필 → 출석 캘린더에서 확인.</p>
        </Sec>

        <Sec id="friends">
          <H>추가와 혜택</H>
          <p>
            닉네임이나 코드(#)로 친구를 검색해 추가하세요 — 내 코드는 <b>설정 → 계정 →
            코드</b>에 있어요. 친구가 되면 서로가 소환한 레이드에 바로 참여할 수 있고, 친구
            목록에서 접속 상태를 볼 수 있습니다.
          </p>
        </Sec>

        <Sec id="misc">
          <H>알림</H>
          <p>
            알림을 켜면 <b>강화 최고 확률 도달</b> · 레이드 · 일일 보급 · 대난투 · 문의 답변을
            놓치지 않아요. 설정에서 종류별로 켜고 끌 수 있습니다. iPhone은 홈 화면에 앱을
            추가하면 알림을 받을 수 있어요.
          </p>
          <H>확률 공시 · 문의</H>
          <p>
            강화·초월·보급의 모든 확률과 비용은{' '}
            <Link href="/probability" className="underline underline-offset-2">
              확률 공시
            </Link>
            에 투명하게 공개돼 있어요. 궁금한 점·불편한 점은 설정 → 고객센터 문의로
            보내주세요(이미지 첨부 가능) — 답변은 우편으로 드립니다.
          </p>
        </Sec>
      </div>
    </div>
  );
}
