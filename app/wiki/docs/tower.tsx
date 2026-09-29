import {
  TOWER_AVATAR_MULT,
  TOWER_DAILY_ATTEMPTS,
  TOWER_FLOORS,
  TOWER_POOL_PER_SLOT,
  TOWER_SECTION,
  towerRequirement,
  towerReward,
} from '@/lib/game/balance';
import { TOWER_BATTLE } from '@/lib/game/tower/battle';

import type { WikiDocMeta } from '../registry';
import { bpPct } from '../fmt';
import { DocLink, H2, LI, Tbl, UL } from '../ui';

export const meta: WikiDocMeta = {
  slug: 'tower',
  cat: '경쟁',
  title: '무한의 탑',
  summary: `한 층씩 층 주인을 쓰러뜨리며 오르는 콘텐츠. 층마다 첫 돌파 보상, 가장 높이 오른 층으로 서버 순위.`,
  sections: [
    { id: 'flow', label: '진행' },
    { id: 'gear', label: '요구 장비' },
    { id: 'power', label: '탑 전투력' },
    { id: 'battle', label: '전투' },
    { id: 'floor', label: '층 주인 전투력' },
    { id: 'reward', label: '돌파 보상' },
    { id: 'ranking', label: '순위' },
  ],
};

const n = (v: number) => v.toLocaleString('ko-KR');
const SAMPLE_FLOORS = [1, 9, 10, 11, 20, 30, 50, 70, 90, 99, 100] as const;

export default function Doc() {
  const sections = Math.ceil(TOWER_FLOORS / TOWER_SECTION);
  return (
    <>
      <H2 id="flow">진행</H2>
      <UL>
        <LI>지금 열린 층은 1~{TOWER_FLOORS}층이다. 가장 높이 돌파한 층의 바로 다음 층에만 도전할 수 있다.</LI>
        <LI>
          하루 {TOWER_DAILY_ATTEMPTS}번 도전할 수 있고, <b>이기면 횟수가 줄지 않는다</b>. 진 판만 한 번씩 줄어들며
          자정(한국 시간)에 다시 채워진다.
        </LI>
        <LI>{TOWER_SECTION}층마다 특별층이 있다. 특별층의 층 주인은 그 구간을 지키는 수문장이다.</LI>
      </UL>

      <H2 id="gear">요구 장비</H2>
      <UL>
        <LI>
          {TOWER_SECTION}층씩 한 구간으로 나뉘고, 구간마다 부위별 {TOWER_POOL_PER_SLOT}개의 요구 장비가 정해진다.
          요구 장비가 아닌 장비는 탑에서 힘을 쓰지 못한다.
        </LI>
        <LI>1~{TOWER_SECTION - 1}층과 {TOWER_SECTION}층은 모든 장비를 쓸 수 있다.</LI>
        <LI>요구 장비는 매주 월요일 0시(한국 시간)에 서버 전체가 함께 바뀐다.</LI>
        <LI>
          특별층에는 부위마다 <b>지정 장비</b>가 하나씩 있고, 한 번 정해지면 바뀌지 않는다. 특별층에서도 그 구간의 요구
          장비를 쓸 수 있다.
        </LI>
        <LI>탑 화면에서 착용 가능 장비를 바로 장착할 수 있다. 장착은 게임 전체에 그대로 반영된다.</LI>
      </UL>

      <H2 id="power">탑 전투력</H2>
      <UL>
        <LI>
          장착한 장비 세 개의 <DocLink slug="combat-power">전투력</DocLink>을 더한 값이다. 장비마다 배율이 붙는다.
        </LI>
        <LI>
          <DocLink slug="avatar">아바타</DocLink>를 골라 탑에 오를 수 있다. 그 아바타를 만들 때 입었던 장비가 지금
          장착과 겹치면, 겹치는 장비만 ×{TOWER_AVATAR_MULT}가 된다. 탑 화면의 &ldquo;맞는 장비 N/3&rdquo;이 겹치는
          개수다.
        </LI>
        <LI>기본 아바타는 만들 때 입은 장비가 없어 모든 장비가 ×1이다.</LI>
      </UL>
      <Tbl
        firstColNowrap
        head={['그 장비가', '배율']}
        rows={[
          ['요구 장비이고, 고른 아바타를 만들 때도 입었던 장비', `×${TOWER_AVATAR_MULT}`],
          ['요구 장비', '×1'],
          ['요구 장비가 아님', '×0 (전투력에 들어가지 않음)'],
          ['특별층', `지정 장비만 ×${TOWER_AVATAR_MULT}가 될 수 있고, 나머지 요구 장비는 ×1`],
        ]}
      />

      <H2 id="battle">전투</H2>
      <UL>
        <LI>도전하면 서버가 전투를 판정하고, 화면은 그 기록을 차례로 보여 준다.</LI>
        <LI>
          나와 층 주인 모두 체력 100%에서 시작한다. 탑 전투력이 층 주인 전투력보다 높을수록 내 공격은 세지고 층 주인의
          공격은 약해진다.
        </LI>
        <LI>최대 {TOWER_BATTLE.maxTurns}턴까지 싸우고, 그때까지 층 주인을 쓰러뜨리지 못하면 진다.</LI>
      </UL>
      <Tbl
        firstColNowrap
        head={['변수', '내용']}
        rows={[
          ['선제', `층 주인이 먼저 공격할 확률 ${bpPct(TOWER_BATTLE.firstStrikeBp)}`],
          ['급소', `${bpPct(TOWER_BATTLE.critBp)} 확률로 피해 ×${TOWER_BATTLE.critMul}(양쪽 모두)`],
          ['빗나감', `${bpPct(TOWER_BATTLE.missBp)} 확률로 공격이 빗나감(양쪽 모두)`],
          ['반격', `층 주인의 공격 뒤 ${bpPct(TOWER_BATTLE.counterBp)} 확률로 내가 반격(피해 ×${TOWER_BATTLE.counterMul})`],
          [
            '광폭화',
            `층 주인의 체력이 ${TOWER_BATTLE.enrageAt}% 아래로 처음 떨어질 때 ${bpPct(TOWER_BATTLE.enrageBp)} 확률, 이후 층 주인 피해 ×${TOWER_BATTLE.enrageMul}`,
          ],
          [
            '공명',
            `장착 세 개가 모두 ×${TOWER_AVATAR_MULT}일 때 내 턴마다 ${bpPct(TOWER_BATTLE.resonanceBp)} 확률로 추가 타격(피해 ×${TOWER_BATTLE.resonanceMul})`,
          ],
          ['기사회생', `내가 쓰러질 때 한 번 ${bpPct(TOWER_BATTLE.reviveBp)} 확률로 체력 1로 버팀`],
        ]}
      />

      <H2 id="floor">층 주인 전투력</H2>
      <UL>
        <LI>구간 안의 일반 층은 완만하게 오르고, 특별층에서 크게 뛴다.</LI>
        <LI>층 목록과 층 상세에서 그 층 주인의 전투력을 볼 수 있다.</LI>
      </UL>
      <Tbl head={['층', '층 주인 전투력']} rows={SAMPLE_FLOORS.map((f) => [`${f}층`, n(towerRequirement(f))])} />

      <H2 id="reward">돌파 보상</H2>
      <UL>
        <LI>층마다 처음 돌파할 때 한 번 받는다.</LI>
        <LI>일반 층은 💎, 구간의 다섯 번째 층은 💎와 📦, 특별층은 💎와 📦를 함께 받는다.</LI>
        <LI>📦는 <DocLink slug="supply">보급 상자</DocLink>로, 부위마다 3분의 1씩 나뉜다.</LI>
      </UL>
      <Tbl
        head={['구간', '일반 층 💎', '5번째 층 📦', '특별층 💎', '특별층 📦']}
        rows={Array.from({ length: sections }, (_, i) => {
          const lo = i * TOWER_SECTION + 1;
          const hi = (i + 1) * TOWER_SECTION;
          return [
            `${lo}~${hi}층`,
            n(towerReward(lo).diamond),
            n(towerReward(lo + 4).boxes),
            n(towerReward(hi).diamond),
            n(towerReward(hi).boxes),
          ];
        })}
      />

      <H2 id="ranking">순위</H2>
      <UL>
        <LI>
          가장 높이 돌파한 층으로 서버 순위를 매기고, 같은 층이면 먼저 오른 사람이 앞선다.{' '}
          <DocLink slug="ranking">랭킹</DocLink>의 무한탑 탭에서 볼 수 있다.
        </LI>
        <LI>1위는 칭호 &ldquo;탑의 주인&rdquo;을 단다(1위를 내주면 사라진다).</LI>
      </UL>
    </>
  );
}
