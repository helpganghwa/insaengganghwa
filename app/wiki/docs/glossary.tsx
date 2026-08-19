import {
  CYCLE_LEN,
  GEM_TO_MS,
  MEGA_OF_SUCCESS_BP,
  MELEE_POINT_HALF_LIFE_DAYS,
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
import { DocLink, H2, Note, P, Tbl } from '../ui';

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
            <><DocLink slug="enhance">강화</DocLink></>,
            '장비를 한 단계 올리는 시도. 시작해 두면 확률이 차오르고, 카드를 눌러 강화하면 결과가 나온다.',
          ],
          [
            '주기',
            <>
              강화 {fmtInt(CYCLE_LEN)}단계를 끊은 구간. 확률은 주기마다 똑같이 반복되고, 한 번
              시도에 드는 시간만 주기를 넘길 때마다 두 배가 된다.
            </>,
          ],
          [
            '안전 구간',
            <>
              주기 안쪽 +{fmtInt(SAFE_MAX_LEVEL)}까지. 하락이 나오지 않아 실패가 전부 유지가 된다.
            </>,
          ],
          ['성공', '한 단계 상승. 확률은 기다린 시간에 비례해 오른다.'],
          [
            '대성공',
            <>
              두 단계를 한 번에 올리는 결과. 성공분 가운데 {bpPct(MEGA_OF_SUCCESS_BP)}가 이쪽으로
              갈라진다. 확률 공시에는 메가로 적힌다.
            </>,
          ],
          ['유지', '레벨이 그대로. 시간이 덜 찬 상태에서 강화하면 가장 흔한 결과다.'],
          [
            '하락',
            <>
              한 단계 하강. 확률은 기다린 시간과 무관하게 고정이고, 그 주기의 +
              {fmtInt(SAFE_MAX_LEVEL)} 밑으로는 내려가지 않는다.
            </>,
          ],
          [
            <><DocLink slug="transcend">초월</DocLink></>,
            '같은 장비를 또 얻으면 자동으로 오르는 별도 레벨. 단계마다 그 장비의 전투력에 배수가 붙고 상한이 없다.',
          ],
          [
            '중복',
            '초월 진행도를 채우는 같은 장비. 다음 단계가 T면 T개가 필요하고, 강화 레벨은 따지지 않는다.',
          ],
          [
            '해방',
            '한 아이템의 강화 순위에서 3위 안에 든 상태. 아이템마다 따로 매겨져 전체 랭킹과는 별개고, 도감과 강화 화면에 표시된다.',
          ],
          [
            <><DocLink slug="combat-power">전투력</DocLink></>,
            '가진 아이템마다 가장 센 한 점을 골라 더한 값. 착용 여부와 상관없다. 레이드 피해량, 대난투 체력, 점령전 병력이 전부 여기서 나온다.',
          ],
          ['최고', '보유 장비 중 가장 높은 강화 레벨. 랭킹 지표 이름이기도 하다.'],
          ['합산', '보유 장비의 강화 레벨을 전부 더한 값. 역시 랭킹 지표다.'],
        ]}
      />

      <H2 id="goods">보급과 재화</H2>
      <Tbl
        head={['말', '뜻']}
        rows={[
          [
            <><DocLink slug="supply">보급</DocLink></>,
            '보급 상자를 열어 장비를 얻는 곳. 상자 하나에 아이템 하나가 나오고 천장은 없다.',
          ],
          [
            '부위',
            <>
              무기·방어구·장신구 셋. 상자도 장착 칸도 강화 칸도 이 구분을 따른다. →{' '}
              <DocLink slug="equipment">장비와 장착</DocLink>
            </>,
          ],
          [
            '편성',
            '지금 상자에서 나올 수 있는 아이템. 상자는 부위가 맞는 편성 아이템 중 하나를 균등하게 뽑는다. 편성에서 빠져도 이미 가진 장비는 그대로 남는다.',
          ],
          [
            '다이아',
            '하나뿐인 유료 재화. 강화 시간 단축, 레이드 개설, 길드 결성, 아바타 생성에 쓴다. 서버마다 따로 쌓인다.',
          ],
          [
            '보석 단축',
            <>
              진행 중인 강화의 남은 시간을 다이아로 줄이는 것. 다이아 하나가 {fmtMs(GEM_TO_MS)}을
              줄이고, 환산 비율은 그 강화를 시작한 시점 값으로 고정된다.
            </>,
          ],
        ]}
      />
      <Note>화면에 뜨는 재화 이름은 전부 다이아다. 보석은 시간 단축을 부를 때만 남아 있다.</Note>

      <H2 id="compete">경쟁</H2>
      <Tbl
        head={['말', '뜻']}
        rows={[
          [
            <><DocLink slug="raid">레이드</DocLink></>,
            <>
              다이아를 내고 보스를 불러 최대 {fmtInt(RAID_MAX_PARTICIPANTS)}명이 함께 때리는 판.
              비용은 개설자만 내고, 개설과 참가를 합쳐 하루 {fmtInt(RAID_DAILY_CAP)}회다.
            </>,
          ],
          [
            '페이즈',
            <>
              보스 체력의 한 마디. 하나 넘길 때마다 한 번이라도 때린 사람 전원이 보급 상자{' '}
              {fmtInt(RAID_PHASE_DROP_BOXES)}개를 받고, 다음 마디 체력은 ×{RAID_PHASE_HP_MULT}가
              된다.
            </>,
          ],
          [
            '대난투',
            '매일 아침 서버 전체가 한 판에 들어가는 자동 전투. 신청도 조작도 없고 결과와 리플레이만 받는다.',
          ],
          [
            '포인트',
            <>
              대난투 등수로 쌓이는 랭킹 점수. 얻은 뒤 {fmtInt(MELEE_POINT_HALF_LIFE_DAYS)}일마다
              반영 가치가 절반으로 줄어든다. 통산 누적치는 따로 남는다.
            </>,
          ],
        ]}
      />

      <H2 id="guild">길드</H2>
      <Tbl
        head={['말', '뜻']}
        rows={[
          [
            '영토',
            <>
              길드가 가진 구역. 지도의 점령 단위가 구역이고, 구역 몇 개를 묶은 것이 권역이다. →{' '}
              <DocLink slug="conquest">점령전</DocLink>
            </>,
          ],
          [
            '집행관',
            <>
              구역을 가진 길드가 그 구역에 세우는 자동 수비. 배치하지 않아도 수비에 들어가고
              전투력을 ×{CONQUEST_EXECUTOR_POWER_MULT}로 계산한다. 세금 수금도 집행관이 한다.
            </>,
          ],
          [
            '세금',
            <>
              구역에 사는 사람이 강화에 성공할 때마다 그 구역에 포인트가 쌓이고,{' '}
              {fmtInt(TAX_POINTS_PER_DIAMOND)}포인트가 1다이아가 된다. 수금하면{' '}
              {bpPct(GUILD_EXECUTOR_TAX_CUT * 10000)}는 집행관 몫이고 나머지는 길드 금고로 간다.
            </>,
          ],
          [
            '연대기',
            '그날 점령전을 하나로 엮은 기록. 자정에 열리고, 어느 길드가 어느 구역을 빼앗고 지켰는지가 남는다.',
          ],
        ]}
      />
      <P>
        직책과 권한은 <DocLink slug="guild-roles">길드 권한</DocLink>에 있다.
      </P>

      <H2 id="account">계정</H2>
      <Tbl
        head={['말', '뜻']}
        rows={[
          [
            <><DocLink slug="titles">칭호</DocLink></>,
            '조건을 채우면 발견되는 이름표. 영구형은 한 번 얻으면 남고, 조건부형은 조건이 풀리면 표시가 꺼진다.',
          ],
          [
            '히든 칭호',
            '숨김으로 분류된 칭호. 목록에 이름만 보이고 조건은 가려진다. 일정 수를 발견하면 그것만으로 또 다른 칭호가 열린다.',
          ],
          [
            '대표 칭호',
            '닉네임 옆에 실제로 붙는 하나. 지정하지 않으면 아무것도 붙지 않는다.',
          ],
          [
            '발견',
            '조건을 처음 만족한 순간 남는 기록. 나중에 조건에서 벗어나도 기록은 지워지지 않는다.',
          ],
          [
            '서버',
            '캐릭터가 사는 세계 단위. 장비·다이아·랭킹·길드·칭호가 서버마다 따로 쌓이고, 같은 계정이라도 서버가 다르면 아무것도 이어지지 않는다.',
          ],
        ]}
      />
      <P>
        전체 흐름은 <DocLink slug="about">인생강화란</DocLink>에 있다.
      </P>
    </>
  );
}
