import {
  CYCLE_LEN,
  GEM_TO_MS,
  MEGA_OF_SUCCESS_BP,
  RAID_DAILY_CAP,
  RAID_MAX_PARTICIPANTS,
  RAID_PHASE_DROP_BOXES,
  RAID_PHASE_HP_MULT,
  SAFE_MAX_LEVEL,
} from '@/lib/game/balance';
import {
  CONQUEST_EXECUTOR_POWER_MULT,
  GUILD_EXECUTOR_TAX_CUT,
  TAX_POINTS_PER_DIAMOND,
} from '@/lib/game/guild/balance';

import type { WikiDocMeta } from '../registry';
import { bpPct, fmtInt, fmtMs } from '../fmt';
import { DocLink, Fn, FnList, H2, P, Tbl } from '../ui';

export const meta: WikiDocMeta = {
  slug: 'glossary',
  cat: '시작',
  title: '용어 사전',
  summary: '게임에서 자주 나오는 말과 뜻.',
  sections: [
    { id: 'growth', label: '성장' },
    { id: 'goods', label: '보급과 재화' },
    { id: 'compete', label: '경쟁' },
    { id: 'guild', label: '길드' },
    { id: 'account', label: '계정' },
  ],
};

export default function Doc() {
  return (
    <>
      <H2 id="growth">성장</H2>
      <Tbl
        head={['말', '뜻']}
        rows={[
          [
            <>
              <DocLink slug="enhance" hash="flow">
                강화
              </DocLink>
            </>,
            '장비를 한 단계 올리는 시도. 시작해 두면 확률이 차오르고, 카드를 누르면 결과가 나온다.',
          ],
          [
            <>
              <DocLink slug="enhance" hash="cycle">
                주기
              </DocLink>
            </>,
            <>
              강화 {fmtInt(CYCLE_LEN)}단계를 끊은 구간. 확률은 주기마다 반복되고, 한 번 시도에 드는
              시간만 두 배가 된다.
            </>,
          ],
          [
            <>
              <DocLink slug="enhance" hash="result">
                안전 구간
              </DocLink>
            </>,
            <>주기 안쪽 +{fmtInt(SAFE_MAX_LEVEL)}까지. 실패해도 유지다.</>,
          ],
          ['성공', '한 단계 상승. 확률은 기다린 시간에 비례해 오른다.'],
          [
            '대성공',
            <>
              두 단계를 한 번에 올리는 결과. 성공 중 {bpPct(MEGA_OF_SUCCESS_BP)}가 대성공이다.
              <Fn n={1} />
            </>,
          ],
          ['유지', '레벨이 그대로. 시간이 덜 찬 상태에서 강화하면 가장 흔한 결과다.'],
          [
            '하락',
            <>
              한 단계 하강. 확률은 기다린 시간과 무관하게 고정이고, 그 주기의 +
              {fmtInt(SAFE_MAX_LEVEL)}이 바닥이다.
            </>,
          ],
          [
            <>
              <DocLink slug="transcend" hash="auto">
                초월
              </DocLink>
            </>,
            '같은 장비를 또 얻으면 자동으로 오르는 별도 레벨. 단계마다 그 장비의 전투력에 배수가 붙는다.',
          ],
          [
            '중복',
            <>
              초월 진행도를 채우는 같은 장비. 다음 단계가 T면 T개가 필요하다.
              <Fn n={2} />
            </>,
          ],
          [
            '해방',
            <>
              한 아이템의 강화 순위 3위 안에 든 상태.
              <Fn n={3} />
            </>,
          ],
          [
            <>
              <DocLink slug="combat-power" hash="piece">
                전투력
              </DocLink>
            </>,
            '착용 여부와 무관하게, 가진 아이템마다 가장 센 한 점을 골라 더한 값. 레이드 피해량·대난투 체력·점령전 병력이 여기서 나온다.',
          ],
          [
            '최고',
            <>
              보유 장비 중 가장 높은 강화 레벨.
              <Fn n={4} />
            </>,
          ],
          ['합산', '보유 장비의 강화 레벨을 전부 더한 값. 역시 랭킹 지표다.'],
        ]}
      />

      <H2 id="goods">보급과 재화</H2>
      <Tbl
        head={['말', '뜻']}
        rows={[
          [
            <>
              <DocLink slug="supply" hash="boxes">
                보급
              </DocLink>
            </>,
            '보급 상자를 열어 장비를 얻는 곳. 상자 하나에 아이템 하나가 나온다.',
          ],
          [
            <>
              <DocLink slug="equipment" hash="slots">
                부위
              </DocLink>
            </>,
            <>
              무기·방어구·장신구 셋. 상자도{' '}
              <DocLink slug="equipment" hash="equip">
                장착
              </DocLink>{' '}
              칸도 강화 칸도 이 구분을 따른다.
            </>,
          ],
          [
            '활성 아이템',
            <>
              지금 상자에서 나올 수 있는 아이템.
              <Fn n={5} /> 상자는 부위가 맞는 활성 아이템 중 하나를 균등하게 뽑는다.
            </>,
          ],
          [
            '다이아',
            <>
              하나뿐인 유료 재화. 강화 시간 단축,{' '}
              <DocLink slug="raid" hash="open">
                레이드 소환
              </DocLink>
              ,{' '}
              <DocLink slug="guild" hash="create">
                길드 결성
              </DocLink>
              ,{' '}
              <DocLink slug="avatar" hash="create">
                아바타 생성
              </DocLink>
              에 쓴다.
            </>,
          ],
          [
            '보석 단축',
            <>
              진행 중인 강화의 남은 시간을 줄이는 것.
              <Fn n={6} /> 하나가 {fmtMs(GEM_TO_MS)}을 줄이고, 환산 비율은 그 강화를 시작한 시점
              값으로 고정된다.
            </>,
          ],
        ]}
      />

      <H2 id="compete">경쟁</H2>
      <Tbl
        head={['말', '뜻']}
        rows={[
          [
            <>
              <DocLink slug="raid" hash="join">
                레이드
              </DocLink>
            </>,
            <>
              다이아를 내고 보스를 불러 최대 {fmtInt(RAID_MAX_PARTICIPANTS)}명이 함께 때리는 판.
              비용은 개설자만 내고, 개설과 참가를 합쳐 하루 {fmtInt(RAID_DAILY_CAP)}회다.
            </>,
          ],
          [
            '페이즈',
            <>
              보스 체력의 한 구간. 넘길 때마다 한 번이라도 때린 사람 전원이 보급 상자{' '}
              {fmtInt(RAID_PHASE_DROP_BOXES)}개를 받고, 다음 페이즈 체력은 ×{RAID_PHASE_HP_MULT}가
              된다.
            </>,
          ],
          [
            '대난투',
            '매일 아침 서버 전체가 한 판에 들어가는 자동 전투. 전투력만 있으면 명단에 들고, 결과와 리플레이가 나온다.',
          ],
          [
            '포인트',
            <>
              대난투 등수로 쌓이는 랭킹 점수. 시간이 지나면 조금씩 줄어들어 최근 성적이 더 크게
              반영된다.
              <Fn n={7} />
            </>,
          ],
        ]}
      />

      <H2 id="guild">길드</H2>
      <Tbl
        head={['말', '뜻']}
        rows={[
          [
            <>
              <DocLink slug="conquest" hash="deploy">
                영토
              </DocLink>
            </>,
            '길드가 가진 구역. 지도의 점령 단위가 구역이고, 구역 몇 개를 묶은 것이 권역이다.',
          ],
          [
            <>
              <DocLink slug="conquest" hash="executor">
                집행관
              </DocLink>
            </>,
            <>
              구역을 가진 길드가 그 구역에 세우는 자동 수비. 전투력을 ×
              {CONQUEST_EXECUTOR_POWER_MULT}로 계산해 수비에 들어가고, 세금 수금도 집행관이 한다.
            </>,
          ],
          [
            <>
              <DocLink slug="conquest" hash="tax">
                세금
              </DocLink>
            </>,
            <>
              구역에 사는 사람이 강화에 성공할 때마다 그 구역에 포인트가 쌓이고,{' '}
              {fmtInt(TAX_POINTS_PER_DIAMOND)}포인트가 1다이아가 된다. 수금하면{' '}
              {bpPct(GUILD_EXECUTOR_TAX_CUT * 10000)}는 집행관 몫이고 나머지는{' '}
              <DocLink slug="guild" hash="donate">
                길드 금고
              </DocLink>
              로 간다.
            </>,
          ],
          [
            <>
              <DocLink slug="conquest" hash="chronicle">
                연대기
              </DocLink>
            </>,
            '그날 점령전을 하나로 엮은 기록. 자정에 열리고, 뺏고 지킨 구역이 다 적힌다.',
          ],
        ]}
      />
      <P>
        직책과 권한은{' '}
        <DocLink slug="guild-roles" hash="roles">
          길드 권한
        </DocLink>
        에 있다.
      </P>

      <H2 id="account">계정</H2>
      <Tbl
        head={['말', '뜻']}
        rows={[
          [
            <>
              <DocLink slug="titles" hash="what">
                칭호
              </DocLink>
            </>,
            <>
              조건을 채우면 발견되는 이름표.
              <Fn n={8} />
            </>,
          ],
          [
            <>
              <DocLink slug="titles" hash="meta">
                히든 칭호
              </DocLink>
            </>,
            <>
              숨김으로 분류된 칭호. 목록에 이름만 보이고 조건은 가려진다.
              <Fn n={9} />
            </>,
          ],
          [
            <>
              <DocLink slug="titles" hash="rep">
                대표 칭호
              </DocLink>
            </>,
            '닉네임 옆에 붙는 하나. 발견한 칭호 중에서 고른다.',
          ],
          [
            <>
              <DocLink slug="titles" hash="discover">
                발견
              </DocLink>
            </>,
            <>
              조건을 처음 만족한 순간 남는 기록.
              <Fn n={10} />
            </>,
          ],
          [
            '서버',
            '캐릭터가 사는 세계 단위. 장비·다이아·랭킹·길드·칭호가 서버마다 따로 쌓여, 서버를 옮기면 처음부터다.',
          ],
        ]}
      />

      <FnList
        notes={[
          '확률 공시에는 메가로 적힌다.',
          '강화 레벨과는 무관하다. +0이든 +50이든 한 개로 센다.',
          '아이템마다 따로 매겨져 전체 랭킹과는 별개고, 도감과 강화 화면에 표시된다.',
          '랭킹 지표 이름이기도 하다.',
          '확률 공시에 쓰는 말이다.',
          '이름만 보석이고 쓰는 재화는 다이아다.',
          '통산 누적치는 따로 남는다.',
          '영구형은 한 번 얻으면 남고, 조건부형은 조건이 풀리면 표시가 꺼진다.',
          '일정 수를 발견하면 그것만으로 또 다른 칭호가 열린다.',
          '조건에서 벗어나면 조건부 칭호는 표시가 꺼지지만, 발견 기록은 남는다.',
        ]}
      />
      <P>
        전체 흐름은 <DocLink slug="about">인생강화란</DocLink>에 있다.
      </P>
    </>
  );
}
