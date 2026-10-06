import {
  TOWER_AVATAR_MULT,
  TOWER_DAILY_ATTEMPTS,
  TOWER_FLOORS,
  TOWER_HP_MULT,
  TOWER_POOL_PER_SLOT,
  TOWER_SECTION,
  TOWER_SPECIAL_POOL_PER_SLOT,
  towerHuntBox,
  towerHuntRange,
  towerRequirement,
  towerReward,
} from '@/lib/game/balance';
import { TOWER_BATTLE, type TowerSkill } from '@/lib/game/tower/battle';
import { TOWER_SKILL_INFO } from '@/lib/game/tower/floors';

import type { WikiDocMeta } from '../registry';
import { bpPct } from '../fmt';
import { DocLink, H2, LI, Tbl, UL } from '../ui';

export const meta: WikiDocMeta = {
  slug: 'tower',
  cat: '경쟁',
  title: '무한의 탑',
  summary: `한 층씩 몬스터를 쓰러뜨리며 탑을 오르는 콘텐츠.`,
  sections: [
    { id: 'flow', label: '진행' },
    { id: 'gear', label: '요구 장비' },
    { id: 'power', label: '탑 전투력' },
    { id: 'battle', label: '전투' },
    { id: 'skill', label: '몬스터 스킬' },
    { id: 'floor', label: '몬스터 전투력' },
    { id: 'reward', label: '돌파 보상' },
    { id: 'hunt', label: '토벌' },
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
          자정에 다시 채워진다. 단, 토벌은 이겨도 한 번 줄어든다.
        </LI>
        <LI>
          &lsquo;오늘 도전&rsquo; 옆 ＋로 대난투 포인트나 마일리지를 써서 추가 도전을 구매할 수 있다. 오르기·토벌 어디에나 쓸 수 있고,
          쓰지 않은 추가 도전은 자정이 지나면 사라진다.
        </LI>
        <LI>{TOWER_SECTION}층마다 특별층이 있다.</LI>
      </UL>

      <H2 id="gear">요구 장비</H2>
      <UL>
        <LI>
          {TOWER_SECTION + 1}층부터는 층마다 부위별 {TOWER_POOL_PER_SLOT}개의 요구 장비가 정해진다. 특별층({TOWER_SECTION * 2}층부터)은{' '}
          부위별 {TOWER_SPECIAL_POOL_PER_SLOT}개뿐이다. 요구 장비가 아닌 장비는 탑에서 힘을 쓰지 못한다.
        </LI>
        <LI>1~{TOWER_SECTION}층은 모든 장비를 쓸 수 있다.</LI>
        <LI>
          요구 장비는 매주 월요일 0시에 모든 층이 바뀐다. 층 화면의 [자동 장착]을 누르면 그 층 요구 장비 중 가장 센
          조합으로 장착하고 아바타도 자동으로 골라 준다.
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
          장착과 겹치면, 겹치는 장비만 전투력이 ×{TOWER_AVATAR_MULT}가 된다.
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
        ]}
      />

      <H2 id="battle">전투</H2>
      <UL>
        <LI>체력은 전투력의 {TOWER_HP_MULT}배다.</LI>
        <LI>최대 {TOWER_BATTLE.maxTurns}턴까지 싸우고, 그때까지 몬스터를 쓰러뜨리지 못하면 진다.</LI>
      </UL>

      <Tbl
        firstColNowrap
        head={['변수', '내용']}
        rows={[
          ['선제', `몬스터가 먼저 공격할 확률 ${bpPct(TOWER_BATTLE.firstStrikeBp)}`],
          ['급소', `${bpPct(TOWER_BATTLE.critBp)} 확률로 피해 ×${TOWER_BATTLE.critMul}(양쪽 모두)`],
          ['빗나감', `${bpPct(TOWER_BATTLE.missBp)} 확률로 공격이 빗나감(양쪽 모두)`],
          ['반격', `몬스터의 공격 뒤 ${bpPct(TOWER_BATTLE.counterBp)} 확률로 내가 반격(피해 ×${TOWER_BATTLE.counterMul})`],
          [
            '광폭화',
            `몬스터의 체력이 ${TOWER_BATTLE.enrageAt}% 아래로 처음 떨어질 때 ${bpPct(TOWER_BATTLE.enrageBp)} 확률, 이후 몬스터 피해 ×${TOWER_BATTLE.enrageMul}`,
          ],
          [
            '공명',
            `장착 세 개가 모두 ×${TOWER_AVATAR_MULT}일 때 내 턴마다 ${bpPct(TOWER_BATTLE.resonanceBp)} 확률로 추가 타격(피해 ×${TOWER_BATTLE.resonanceMul})`,
          ],
          ['기사회생', `내가 쓰러질 때 한 번 ${bpPct(TOWER_BATTLE.reviveBp)} 확률로 체력 1로 버팀`],
        ]}
      />

      <H2 id="skill">몬스터 스킬</H2>
      <UL>
        <LI>{TOWER_SECTION}층 수문장부터 일부 몬스터가 스킬을 쓴다.</LI>
        <LI>층 화면에서 몬스터 이름 아래 스킬을 누르면 설명이 나온다.</LI>
      </UL>
      <Tbl
        firstColNowrap
        head={['스킬', '내용']}
        rows={(Object.keys(TOWER_SKILL_INFO) as TowerSkill[]).map((k) => [`${TOWER_SKILL_INFO[k].icon} ${TOWER_SKILL_INFO[k].name}`, TOWER_SKILL_INFO[k].desc])}
      />

      <H2 id="floor">몬스터 전투력</H2>
      <Tbl head={['층', '몬스터 전투력']} rows={SAMPLE_FLOORS.map((f) => [`${f}층`, n(towerRequirement(f))])} />

      <H2 id="reward">돌파 보상</H2>
      <UL>
        <LI>층마다 한 번 받는다. 돌파한 층의 보상은 탑 목록에서 층을 눌러 하나씩 받거나 [모두 받기]로 한꺼번에 받는다.</LI>
        <LI>일반 층은 💎, 구간의 다섯 번째 층과 특별층은 💎와 📦를 함께 받는다.</LI>
        <LI>10층·60층·100층을 처음 돌파하면 <DocLink slug="titles">칭호</DocLink>도 얻는다(탐험가 · 별빛 수집가 · 백룡학살자).</LI>
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

      <H2 id="hunt">토벌</H2>
      <UL>
        <LI>이미 돌파한 층은 다시 도전해 💎를 받을 수 있다. 탑 목록에서 돌파한 층을 누르면 아래 버튼이 [토벌]로 바뀐다.</LI>
        <LI>
          오르기와 같은 하루 {TOWER_DAILY_ATTEMPTS}번에서 쓰며, <b>토벌은 이겨도 한 번 줄어든다</b>. 전투는 돌파와 같다(같은
          요구 장비·같은 몬스터 스킬).
        </LI>
        <LI>이기면 전투 화면에서 즉시 전리품을 받는다. 💎는 높은 층일수록 많고, 그 층의 범위 안에서 정해진다.</LI>
        <LI>
          일정 확률로 💎가 두 배가 되고, 일정 확률로 <DocLink slug="supply">보급 상자</DocLink>를 함께 받는다. 한 판에
          함께 나올 수도 있다.
        </LI>
      </UL>
      <Tbl
        head={['구간', '첫 층 💎', '아홉째 층 💎', '특별층 💎', '상자 📦']}
        rows={Array.from({ length: sections }, (_, i) => {
          const lo = i * TOWER_SECTION + 1;
          const hi = (i + 1) * TOWER_SECTION;
          const rng = (f: number) => {
            const r = towerHuntRange(f);
            return r.min === r.max ? n(r.min) : `${n(r.min)}~${n(r.max)}`;
          };
          return [`${lo}~${hi}층`, rng(lo), rng(hi - 1), rng(hi), n(towerHuntBox(lo))];
        })}
      />
    </>
  );
}
