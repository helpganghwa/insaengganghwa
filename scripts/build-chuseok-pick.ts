// 추석 세트 선택 폼(2026-09-20) — 지금까지 만든 한복·달토끼 그림을 부위별로 전부 늘어놓고 부위마다 하나를 고른다.
// 마음에 드는 것이 없는 부위는 '다시 생성'을 고르고 사유를 적는다. 결과는 아티팩트 db(picks/current)에 저장되고, 복사용 요약도 함께 나온다.
// 실행: bun run scripts/build-chuseok-pick.ts <출력 경로>. 유료 호출 없음. 게시할 때 capabilities: { db: {} }.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const out = process.argv.slice(2).find((a) => !a.startsWith('--'));
if (!out) {
  console.error('출력 경로 필요');
  process.exit(1);
}
const uri = (k: string) => {
  const p = join(ROOT, 'public', 'sprites', 'chuseok-cand', `${k}.png`);
  return existsSync(p) ? `data:image/png;base64,${readFileSync(p).toString('base64')}` : null;
};

type Opt = { key: string; name: string; note: string; fresh?: boolean };
type Slot = { id: string; set: '한복' | '달토끼'; slot: '무기' | '방어구' | '장신구'; options: Opt[] };
const SLOTS: Slot[] = [
  {
    id: 'hanbok_weapon',
    set: '한복',
    slot: '무기',
    options: [
      { key: 'chuseok_woldo', name: '보름달 월도', note: '긴 검은 자루 끝에 초승달꼴 금 날, 날에 보름달 새김, 진홍 술. 전통 장병기 월도입니다.', fresh: true },
      { key: 'chuseok_gakgung_moon', name: '보름달 각궁', note: '진홍 칠에 금박 달·솔잎 무늬, 감빛 손잡이, 금 깃 화살 한 대. 전통 각궁입니다.', fresh: true },
      { key: 'chuseok_pyeongon', name: '벼이삭 편곤', note: '검은 장대와 쇠사슬로 이어진 짧은 타격봉, 봉에 황금 벼이삭과 금 띠, 진홍 술. 도리깨에서 온 전통 무기 편곤입니다.', fresh: true },
      { key: 'chuseok_dangpa', name: '솔잎 당파', note: '세 갈래 금 창날, 날 아래 보름달 구슬, 큰 진홍 비단 술. 전통 삼지창 당파입니다.', fresh: true },
      { key: 'chuseok_hwando_persimmon', name: '감빛 환도', note: '감빛 칼집에 금 달·솔잎 무늬, 검은 끈을 감은 자루, 금 코등이, 진홍 술. 전통 환도입니다.', fresh: true },
      { key: 'chuseok_moon_mace', name: '보름달 철퇴', note: '검은 자루에 진홍 끈, 머리가 빛나는 금빛 보름달. 전통 철퇴입니다.', fresh: true },
      { key: 'chuseok_jade_hwando', name: '옥 자루 환도(진홍 칼집)', note: '옥색 비단을 감은 자루, 진홍 칠 칼집에 금박 구름무늬, 옥고리 술. 확정 한복(옥색 저고리·진홍 치마)과 같은 팔레트입니다.' },
      { key: 'chuseok_jade_fan', name: '옥색 비단 둥근 부채', note: '옥색 비단 면에 금박 보름달·초승달·구름, 진홍 테와 자루, 긴 진홍 술. 한복 치마의 달무늬와 가장 직접 이어집니다.' },
      { key: 'chuseok_jade_parasol', name: '옥색 비단 양산', note: '접어 둔 옥색 비단 양산, 접힌 면에 금박 구름, 옥색 굽은 손잡이에 진홍 술. 절제된 편입니다.' },
      { key: 'chuseok_jade_spear', name: '옥색 창대 금박 구름 창', note: '옥색 창대에 진홍 비단 띠, 초승달·구름을 새긴 금 창날, 진홍 술. 넷 중 가장 무기다운 실루엣입니다.' },
      { key: 'chuseok_rice_sickle', name: '황금 벼이삭 낫', note: '벼이삭 무늬를 새긴 금빛 초승달 날에 검은 자루와 붉은 끈, 날 밑에 벼이삭 한 묶음. 수확 명절다운 무기입니다.' },
      { key: 'chuseok_dadeumi', name: '다듬이 방망이 한 쌍', note: '금박 무늬 손잡이의 흰 나무 방망이 두 자루가 붉은 끈으로 묶여 교차. 한복과 가장 직접 닿는 도구입니다.' },
      { key: 'chuseok_ribbon_whip', name: '옷고름 비단 채찍', note: '옥 손잡이에서 뻗은 진홍 비단 옷고름이 금박 달·구름 무늬를 띠고 S자로 흐릅니다. 확정 한복의 치마와 같은 무늬입니다.' },
      { key: 'chuseok_norigae_dagger', name: '옥 노리개 단검', note: '옥빛 날에 금 코등이, 위에 붉은 매듭과 산호 장식, 아래로 긴 술. 노리개처럼 매달린 단검입니다.' },
      { key: 'chuseok_moonjar_staff', name: '달항아리 지팡이', note: '검은 자루 끝에 은은히 빛나는 흰 달항아리, 금테와 옥 구슬 끈. 가장 조용하고 고급스러운 인상입니다.' },
      { key: 'chuseok_moon_sword', name: '달빛 환도', note: '가늘게 휜 은빛 환도에 금빛 초승달 코등이, 붉은 손잡이와 옥 고리 오색 술. 달빛이 절제된 편입니다.' },
      { key: 'chuseok_moon_roundfan', name: '보름달 단선', note: '둥근 금빛 비단 부채에 보름달과 금박 구름, 붉은 자루와 오색 술. 달 컨셉이 가장 큽니다.' },
      { key: 'chuseok_moon_flute', name: '달빛 옥피리', note: '옥색 대금에 금테와 작은 초승달 장식, 오색 술. 무기로는 가장 부드러운 인상입니다.' },
      { key: 'chuseok_crescent_glaive', name: '초승달 언월도', note: '금빛 초승달 날에 붉은 자루, 오색 술. 달 모양이 가장 또렷합니다.' },
      { key: 'chuseok_songpyeon_spear', name: '송편 꼬치 창', note: '흰·쑥·분홍 송편 세 알을 꿴 창. 금빛 창날과 솔잎 장식. 송편 컨셉이 한눈에 보입니다.' },
      { key: 'chuseok_crescent_bow', name: '초승달 활', note: '활대 전체가 금빛 초승달. 붉은 손잡이 감개와 옥 고리 오색 술.' },
      { key: 'chuseok_moon_wand_full', name: '보름달 완드', note: '금빛 보름달에 토끼 그림자, 구름 테, 오색 술' },
      { key: 'chuseok_moon_wand_crescent', name: '초승달 완드', note: '진주를 품은 초승달, 진홍 리본' },
      { key: 'chuseok_moon_wand_jade', name: '옥 보름달 완드', note: '옥 보름달에 금테, 진홍 자루와 술' },
      { key: 'chuseok_hanbok_sword_v2', name: '의장검(용 새김)', note: '화려 · 용을 새긴 칼날, 봉황 머리 자루' },
      { key: 'chuseok_hanbok_sword', name: '의장검', note: '화려 · 금 상감 칼날, 연꽃 코등이' },
      { key: 'chuseok_hanbok_bow', name: '금박 각궁', note: '화려 · 진홍 옻칠, 금박 무늬' },
      { key: 'chuseok_hanbok_dagger', name: '은장도', note: '단아 · 은 세공 자루, 연보라 술' },
      { key: 'chuseok_hanbok_fan', name: '합죽선', note: '진홍 부채, 금빛 보름달' },
      { key: 'chuseok_hanbok_lantern', name: '청사초롱', note: '홍청 비단 등, 오색 술' },
    ],
  },
  {
    id: 'hanbok_armor',
    set: '한복',
    slot: '방어구',
    options: [
      { key: 'chuseok_hanbok_v9', name: '한복(미색 저고리·달무늬 치마)', note: '금박 꽃무늬 한복의 미색 저고리에 옥색 저고리 한복의 달무늬 치마를 그대로 입혔습니다. 요청하신 조합 그대로입니다.' },
      { key: 'chuseok_hanbok_v10', name: '한복(미색 저고리·달 변화 무늬)', note: '같은 조합에 치맛단은 초승달에서 보름달로 차오르는 달 변화 무늬입니다.' },
      { key: 'chuseok_hanbok_v11', name: '한복(미색 저고리·보름달 구름무늬)', note: '같은 조합에 치맛단은 보름달과 초승달, 별과 구름을 함께 두었습니다. 셋 중 가장 화려합니다.' },
      { key: 'chuseok_hanbok_v6', name: '한복(옥색 저고리·금박 꽃무늬)', note: '옥색 저고리와 붉은 치마, 치맛단에 금박 꽃 띠. 마음에 드신 두 벌을 합친 그림입니다.' },
      { key: 'chuseok_hanbok_v7', name: '한복(노랑 저고리)', note: '노랑 저고리와 붉은 치마, 금박 꽃 띠. 색동 소매 끝. 목 자리에 옷걸이 기둥이 조금 보입니다.' },
      { key: 'chuseok_hanbok_v8', name: '한복(남색 치마)', note: '미색 저고리와 남색 치마, 큼직한 금박 꽃 띠. 붉은 치마 일색에서 벗어난 한 벌입니다.' },
      { key: 'chuseok_hanbok_hwarot_v2', name: '활옷(황금 치마)', note: '화려 · 금실 봉황, 황금 치마' },
      { key: 'chuseok_hanbok_hwarot', name: '활옷', note: '화려 · 금실 봉황, 남색 속치마' },
      { key: 'chuseok_hanbok_dangui', name: '금박 당의', note: '화려 · 옥색 당의, 금박 두 줄 치마' },
      { key: 'chuseok_hanbok_pastel', name: '매화 한복', note: '단아 · 분홍에서 연보라로 번지는 치마' },
      { key: 'chuseok_hanbok_v3', name: '한복(금박 꽃무늬)', note: '미색 저고리, 진홍 치마' },
      { key: 'chuseok_hanbok_v2', name: '한복(옥색 저고리)', note: '색동 소매, 진홍 치마, 달 무늬' },
      { key: 'chuseok_moonrise_hanbok', name: '달맞이 한복', note: '흰 저고리, 남색 치마, 은빛 달무늬' },
      { key: 'chuseok_holiday_apron', name: '명절 앞치마', note: '노란 저고리, 연두 치마, 흰 앞치마' },
      { key: 'chuseok_hanbok', name: '한가위 한복(바지형)', note: '색동 소매, 옥색 바지' },
    ],
  },
  {
    id: 'hanbok_accessory',
    set: '한복',
    slot: '장신구',
    options: [
      { key: 'chuseok_bok_pouch_v4', name: '복주머니(학 자수)', note: '화려 · 학 한 쌍, 진주 테두리' },
      { key: 'chuseok_bok_pouch_v3', name: '금실 복주머니', note: '화려 · 봉황 자수, 구슬 술' },
      { key: 'chuseok_bok_pouch_v5', name: '매화 복주머니', note: '단아 · 은실 매화, 연보라 술' },
      { key: 'chuseok_bok_pouch_v2', name: '복주머니(모란 자수)', note: '진홍 비단, 금빛 모란' },
      { key: 'chuseok_bok_pouch', name: '한가위 복주머니', note: '진홍 비단, 금빛 달토끼' },
      { key: 'chuseok_fullmoon_norigae', name: '보름달 노리개', note: '옥 원판, 진홍 매듭 술' },
    ],
  },
  {
    id: 'rabbit_weapon',
    set: '달토끼',
    slot: '무기',
    options: [
      { key: 'chuseok_rabbit_pestle_v12', name: '절굿공이(매끈한 손잡이)', note: '손잡이에 아무것도 감지 않은 매끈한 연한 나무 절굿공이, 위쪽 끝에 토끼 얼굴. 가늘고 밝습니다.' },
      { key: 'chuseok_rabbit_pestle_v13', name: '절굿공이(매끈한 손잡이 · 초승달)', note: '나뭇결이 보이는 굵은 절굿공이, 토끼 얼굴과 아래쪽 초승달 새김, 손잡이 매끈. 셋 중 가장 입체적입니다.' },
      { key: 'chuseok_rabbit_pestle_v14', name: '절굿공이(매끈한 손잡이 · 비스듬)', note: '매끈한 손잡이의 절굿공이를 비스듬히 본 그림, 토끼 얼굴 새김. 장식이 가장 적습니다.' },
      { key: 'chuseok_rabbit_pestle_v10', name: '절굿공이(토끼 얼굴 · 새 그림 3)', note: '토끼 얼굴 새김에 분홍 감개, 방울솔 없음. 원본 절굿공이의 비율과 가장 비슷합니다.' },
      { key: 'chuseok_rabbit_pestle_v11', name: '절굿공이(토끼 얼굴 · 새 그림 4)', note: '토끼 얼굴 새김에 분홍 감개, 방울솔 없음. 감개가 조금 굵고 나무색이 진합니다.' },
      { key: 'chuseok_rabbit_pestle_v8', name: '절굿공이(토끼 얼굴 · 새 그림)', note: '새로 그린 절굿공이. 한쪽 끝이 둥근 원판에 토끼 얼굴이 크게 새겨졌고 분홍 감개, 방울솔 없음. 원본보다 토끼가 또렷합니다.' },
      { key: 'chuseok_rabbit_pestle_v9', name: '절굿공이(토끼 얼굴 · 초승달 · 새 그림)', note: '새로 그린 절굿공이. 토끼 얼굴과 반대쪽 끝의 작은 초승달, 촘촘한 분홍 감개, 방울솔 없음. 원본과 가장 닮았습니다.' },
      { key: 'chuseok_rabbit_mallet_v4', name: '흰 떡메(리본 없음)', note: '흰 떡메에서 리본만 뺀 그림. 세로로 서 있고 토끼 얼굴이 옆면에 찍혔습니다.' },
      { key: 'chuseok_rabbit_mallet_v5', name: '흰 떡메(리본 없음 · 둥근 통)', note: '리본 없는 흰 떡메. 통이 크고 둥글게 나와 가로로 눕습니다.' },
      { key: 'chuseok_rabbit_mallet_v6', name: '흰 떡메(리본 없음 · 금테)', note: '리본 없는 흰 떡메에 양끝 가는 금테. 비스듬한 각도라 9차 흰 떡메와 가장 비슷합니다.' },
      { key: 'chuseok_rabbit_mallet_v3', name: '흰 떡메(토끼 얼굴)', note: '장식 없는 흰 떡메에 토끼 얼굴 하나. 리본은 없지만 그림이 다소 밋밋합니다.' },
      { key: 'chuseok_rabbit_pestle_v7', name: '절굿공이(토끼 새김)', note: '흰 양끝 절굿공이에 토끼와 별 새김, 은빛 덩굴 테. 리본 없음.' },
      { key: 'chuseok_rabbit_mallet_ears', name: '토끼 귀 떡메', note: '메 머리가 토끼 얼굴이고 위로 귀가 솟은 떡메. 리본 없음. 가장 귀엽습니다.' },
      { key: 'chuseok_rabbit_mallet_v2', name: '흰 떡메', note: '흰 나무 메에 토끼 얼굴, 흰 리본' },
      { key: 'chuseok_rabbit_pestle_v6', name: '절굿공이(굵은 양끝)', note: '양끝이 굵은 흰 절굿공이, 분홍 끈' },
      { key: 'chuseok_rabbit_mallet_mochi', name: '통통한 떡메', note: '가로로 누워 나옴 · 떡은 보이지 않음' },
      { key: 'chuseok_rabbit_pestle_v5', name: '떡 묻은 절굿공이', note: '동화풍 · 끝에 흰 떡, 큰 분홍 리본' },
      { key: 'chuseok_rabbit_pestle_v3', name: '절굿공이(붉은 끈)', note: '심플 · 매끈한 나무' },
      { key: 'chuseok_rabbit_pestle_v4', name: '절굿공이(흰 리본)', note: '심플 · 한쪽이 굵은 모양' },
      { key: 'chuseok_rabbit_pestle_v2', name: '절굿공이(토끼 얼굴)', note: '토끼 얼굴 새김, 방울술' },
      { key: 'chuseok_rabbit_pestle', name: '절굿공이(달 장식)', note: '금테, 붉은 끈, 달 장식' },
      { key: 'chuseok_moonrabbit_mallet', name: '달토끼 떡메', note: '둥근 나무 메, 토끼와 달 새김' },
    ],
  },
  {
    id: 'rabbit_armor',
    set: '달토끼',
    slot: '방어구',
    options: [
      { key: 'chuseok_rabbit_suit_v13', name: '토끼 인형 슈트(디테일 · 방울 없음)', note: '디테일·방울 판의 문장에서 방울과 리본만 뺐습니다. 손목·발목 털 깃, 왼쪽 엉덩이에 작은 꼬리 술.', fresh: true },
      { key: 'chuseok_rabbit_suit_v14', name: '토끼 인형 슈트(디테일 · 방울 없음 · 2)', note: '같은 문장. 목둘레·손목 털 깃, 큰 발에 분홍 발바닥, 털 결이 가장 뚜렷합니다. 꼬리는 안 보입니다.', fresh: true },
      { key: 'chuseok_rabbit_suit_v15', name: '토끼 인형 슈트(디테일 · 방울 없음 · 3)', note: '같은 문장. 손목 털 깃, 분홍 발바닥, 왼쪽 엉덩이에 작은 꼬리 술. 셋 중 가장 매끈합니다.', fresh: true },
      { key: 'chuseok_rabbit_suit_v9', name: '토끼 인형 슈트(심플)', note: '심플. 푸른 기 도는 흰색 한 벌, 무늬·솔기 없음, 벙어리 손과 큰 발. 꼬리는 안 보입니다.' },
      { key: 'chuseok_rabbit_suit_v10', name: '토끼 인형 슈트(심플 · 분홍 발바닥)', note: '심플. 크림빛 흰색, 가운데 솔기 한 줄, 발에 분홍 발바닥. 꼬리는 안 보입니다.' },
      { key: 'chuseok_rabbit_suit_v11', name: '토끼 인형 슈트(디테일 · 털 깃과 소매)', note: '디테일. 목둘레·손목·발목에 복슬한 털 깃, 손발에 분홍 발바닥, 털 결이 살아 있습니다. 꼬리는 안 보입니다.' },
      { key: 'chuseok_rabbit_suit_v12', name: '토끼 인형 슈트(디테일 · 방울)', note: '디테일. 목에 진홍 리본과 금방울, 털 소매와 발목, 분홍 발바닥. 확정 한복의 진홍·금과 색이 맞습니다. 꼬리는 안 보입니다.' },
      { key: 'chuseok_rabbit_suit_v6', name: '토끼 인형 슈트(흰 배 · 꼬리)', note: '크림빛 흰 슈트, 배는 무늬 없이 흰색이지만 작은 리본과 달·별 자수가 붙었고 꼬리는 오른쪽 엉덩이에 살짝.' },
      { key: 'chuseok_rabbit_suit_v7', name: '토끼 인형 슈트(흰 배 · 꼬리 · 옆모습)', note: '온통 흰 슈트에 무늬 없음, 오른쪽 엉덩이에 둥근 꼬리가 분명히 보임. 사유에 가장 가깝습니다.' },
      { key: 'chuseok_rabbit_suit_v8', name: '토끼 인형 슈트(흰 배 · 꼬리 · 털 깃)', note: '흰 슈트에 털 깃, 배는 흰색, 꼬리는 오른쪽에 작게. 앞서 좋게 보셨던 지퍼형과 비슷한 인상입니다.' },
      { key: 'chuseok_rabbit_suit_v3', name: '토끼 인형 슈트(흰 배 · 새 그림 2)', note: '원본 슈트 문장에서 배 무늬만 뺀 새 그림. 온통 흰색에 분홍 발바닥. 원본보다 작게 나와 확대하면 조금 뭉툭합니다.' },
      { key: 'chuseok_rabbit_suit_v4', name: '토끼 인형 슈트(흰 배 · 새 그림 3)', note: '크림색 슈트에 분홍 목둘레, 배에 흰 천과 작은 수 장식이 생겼습니다. 배가 완전히 비지는 않았습니다.' },
      { key: 'chuseok_rabbit_suit_v5', name: '토끼 인형 슈트(흰 배 · 새 그림 4)', note: '푸른빛 도는 흰 슈트에 분홍 목둘레, 배에 아무 무늬 없음. 넷 중 가장 깔끔합니다.' },
      { key: 'chuseok_rabbit_suit_v2', name: '토끼 인형 슈트(온통 흰색 · 새 그림)', fresh: true, note: '새로 그린 온통 흰 슈트. 발바닥 분홍이 없고 가슴에 작은 복숭아 무늬가 붙었습니다.' },
      { key: 'chuseok_rabbit_suit', name: '토끼 인형 슈트', note: '목 아래로만 입는 흰 전신 슈트, 분홍 배와 발바닥. 가장 단순합니다. 발밑 검은 선은 옮길 때 지웁니다.' },
      { key: 'chuseok_rabbit_suit_zip', name: '토끼 인형 슈트(지퍼)', note: '크림색 슈트에 털 깃, 토끼 지퍼 손잡이, 당근 주머니. 인형탈 옷 느낌이 가장 납니다.' },
      { key: 'chuseok_rabbit_suit_round', name: '토끼 인형 슈트(통통한 몸)', note: '통통한 흰 슈트에 금테 하트 배, 프릴 깃, 별 단추. 가장 화려합니다.' },
      { key: 'chuseok_rabbit_hanbok', name: '토끼 한복', note: '흰 저고리에 분홍 고름, 털 소매, 솜꼬리' },
      { key: 'chuseok_rabbit_cape', name: '토끼 망토 코트', note: '방울 끈 털 망토, 토끼 무늬 코트, 흰 부츠' },
      { key: 'chuseok_rabbit_twopiece', name: '토끼 투피스', note: '짧은 털 재킷과 반바지 · 다리 부분이 비어 보임' },
      { key: 'chuseok_rabbit_romper', name: '토끼 롬퍼', note: '동화풍 · 크림색 롬퍼, 분홍 리본, 솜꼬리' },
      { key: 'chuseok_moonrabbit_suit_v4', name: '달토끼 옷(심플)', note: '심플 · 흰 점프슈트, 분홍 리본' },
      { key: 'chuseok_moonrabbit_suit_v2', name: '달토끼 옷(연보라 띠)', note: '털 깃, 연보라 띠, 달 장식' },
      { key: 'chuseok_moonrabbit_suit', name: '달토끼 옷(1차)', note: '폭신한 흰 털, 가슴에 달' },
      { key: 'chuseok_moonrabbit_suit_v3', name: '달토끼 옷(분홍 리본)', note: '그림이 작게 나옴' },
      { key: 'chuseok_moonrabbit_suit_v5', name: '달토끼 옷(보송한 결)', note: '잘못 나옴 · 머리 윤곽이 그려짐' },
    ],
  },
  {
    id: 'rabbit_accessory',
    set: '달토끼',
    slot: '장신구',
    options: [
      { key: 'chuseok_rabbit_lop_ears', name: '늘어진 토끼 귀', note: '동화풍 · 늘어진 귀, 분홍 리본' },
      { key: 'chuseok_rabbit_ears_v4', name: '토끼 귀(접힌 귀)', note: '심플 · 한쪽 귀가 접힘' },
      { key: 'chuseok_rabbit_ears_v3', name: '토끼 귀(곧은 귀)', note: '심플 · 흰 머리띠' },
      { key: 'chuseok_rabbit_ears_v2', name: '토끼 귀(분홍 리본)', note: '금 머리띠, 리본과 방울' },
      { key: 'chuseok_rabbit_ears', name: '토끼 귀(달 장식)', note: '금 머리띠, 달 장식' },
      { key: 'chuseok_moonrabbit_headband', name: '달토끼 머리띠', note: '금 머리띠, 달 장식과 붉은 리본' },
    ],
  },
];

let missing = 0;
const data = SLOTS.map((s) => ({
  ...s,
  options: s.options.map((o) => {
    const src = uri(o.key);
    if (!src) missing += 1;
    return { ...o, src: src ?? '' };
  }),
}));

// 페이지 스크립트 — 백틱을 쓰지 않는다(이 파일의 템플릿 문자열 안에 그대로 들어간다).
const SCRIPT = String.raw`
(function () {
  var SLOTS = window.__SLOTS__;
  var LS_KEY = 'chuseok-pick-draft-v9'; // 회차마다 올린다 — 지난 회차의 '다시 만들기' 체크가 새 그림 위에 남지 않게
  var state = {};
  // 2차 제출까지 확정한 두 부위는 미리 골라 둔다(이 브라우저에 임시 저장본이 있으면 그것이 우선).
  // 한복 방어구는 2차에서 다시 열렸다("금박 꽃무늬·옥색 저고리와 비슷한 느낌으로 하나 더") — 미리 고르지 않는다.
  var CONFIRMED = { hanbok_armor: 'chuseok_hanbok_v2', hanbok_accessory: 'chuseok_bok_pouch', rabbit_weapon: 'chuseok_rabbit_pestle_v14', rabbit_accessory: 'chuseok_rabbit_ears_v4' };
  SLOTS.forEach(function (s) { state[s.id] = { pick: CONFIRMED[s.id] || null, redo: false, reason: '' }; });
  try {
    var saved = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
    if (saved) SLOTS.forEach(function (s) { if (saved[s.id]) state[s.id] = Object.assign(state[s.id], saved[s.id]); });
  } catch (e) {}
  function persist() { try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {} }

  var root = document.getElementById('slots');
  var els = {};
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }

  SLOTS.forEach(function (s, si) {
    var sec = el('section', 'slot');
    sec.id = 'slot-' + s.id;
    var head = el('div', 'shead');
    head.appendChild(el('span', 'sname', s.set + ' 세트 · ' + s.slot));
    var st = el('span', 'sstate', '');
    head.appendChild(st);
    sec.appendChild(head);
    var grid = el('div', 'grid');
    var tiles = {};
    s.options.forEach(function (o) {
      var b = el('button', 'tile');
      b.type = 'button';
      b.setAttribute('aria-pressed', 'false');
      var im = el('img'); im.src = o.src; im.alt = o.name; im.loading = 'lazy';
      var box = el('span', 'imgbox'); box.appendChild(im); b.appendChild(box);
      var nm = el('span', 'tname', o.name);
      if (o.fresh) { var fr = el('em', 'fresh', '새 그림'); nm.appendChild(fr); }
      b.appendChild(nm);
      b.appendChild(el('span', 'tnote', o.note));
      b.addEventListener('click', function () {
        var cur = state[s.id];
        if (cur.pick === o.key) { cur.pick = null; } else { cur.pick = o.key; cur.redo = false; }
        persist(); paint();
      });
      tiles[o.key] = b;
      grid.appendChild(b);
    });
    sec.appendChild(grid);
    var redoRow = el('div', 'redo');
    var cb = el('input'); cb.type = 'checkbox'; cb.id = 'redo-' + s.id;
    var lb = el('label', null, '마음에 드는 것이 없습니다. 이 부위는 다시 생성'); lb.htmlFor = cb.id;
    cb.addEventListener('change', function () {
      state[s.id].redo = cb.checked; if (cb.checked) state[s.id].pick = null; persist(); paint();
    });
    redoRow.appendChild(cb); redoRow.appendChild(lb);
    sec.appendChild(redoRow);
    var ta = el('textarea', 'reason');
    ta.id = 'reason-' + s.id; ta.rows = 3;
    ta.placeholder = '어떤 점이 아쉬운지, 어떤 방향으로 다시 만들면 좋을지 적어 주세요. (예: 색이 너무 어둡다, 더 크고 단순하게, 무기 종류를 도끼로)';
    ta.value = state[s.id].reason || '';
    ta.addEventListener('input', function () { state[s.id].reason = ta.value; persist(); paintBar(); });
    sec.appendChild(ta);
    root.appendChild(sec);
    els[s.id] = { sec: sec, st: st, tiles: tiles, cb: cb, ta: ta };
  });

  var bar = document.getElementById('barText');
  var submitBtn = document.getElementById('submit');
  var statusEl = document.getElementById('status');
  var summaryEl = document.getElementById('summary');
  var summaryWrap = document.getElementById('summaryWrap');

  function nameOf(s, key) { for (var i = 0; i < s.options.length; i++) if (s.options[i].key === key) return s.options[i].name; return key; }
  function counts() {
    var picked = 0, redo = 0;
    SLOTS.forEach(function (s) { if (state[s.id].pick) picked++; else if (state[s.id].redo) redo++; });
    return { picked: picked, redo: redo, left: SLOTS.length - picked - redo };
  }
  function paintBar() {
    var c = counts();
    bar.textContent = '선택 ' + c.picked + ' · 다시 생성 ' + c.redo + ' · 미정 ' + c.left;
    submitBtn.disabled = c.left > 0;
  }
  function paint() {
    SLOTS.forEach(function (s) {
      var e = els[s.id], cur = state[s.id];
      Object.keys(e.tiles).forEach(function (k) {
        var on = cur.pick === k;
        e.tiles[k].classList.toggle('on', on);
        e.tiles[k].setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      e.cb.checked = !!cur.redo;
      e.ta.hidden = !cur.redo;
      e.sec.classList.toggle('done', !!cur.pick);
      e.sec.classList.toggle('redoing', !!cur.redo && !cur.pick);
      e.st.textContent = cur.pick ? '선택: ' + nameOf(s, cur.pick) : cur.redo ? '다시 생성' : '아직 안 골랐습니다';
    });
    paintBar();
  }
  function summaryText() {
    var lines = ['[추석 세트 선택 결과]'];
    SLOTS.forEach(function (s) {
      var cur = state[s.id];
      var head = s.set + ' ' + s.slot + ': ';
      if (cur.pick) lines.push(head + nameOf(s, cur.pick) + ' (' + cur.pick + ')');
      else if (cur.redo) lines.push(head + '다시 생성 / 사유: ' + ((cur.reason || '').trim() || '(적지 않음)'));
      else lines.push(head + '(미정)');
    });
    return lines.join('\n');
  }

  var db = null;
  if (window.claude && typeof window.claude.use === 'function') {
    window.claude.use('db').then(function (ns) {
      db = ns;
      if (!db) return;
      db.doc('picks/current').get().then(function (snap) {
        if (!snap.exists) return;
        var d = snap.data() || {};
        var touched = false;
        try { touched = !!localStorage.getItem(LS_KEY); } catch (e) {}
        if (!touched && d.slots) {
          SLOTS.forEach(function (s) { if (d.slots[s.id]) state[s.id] = Object.assign(state[s.id], d.slots[s.id]); els[s.id].ta.value = state[s.id].reason || ''; });
          paint();
        }
        if (d.submittedAtText) statusEl.textContent = '마지막 제출: ' + d.submittedAtText;
      }).catch(function () {});
    }).catch(function () {});
  }

  submitBtn.addEventListener('click', function () {
    var text = summaryText();
    summaryEl.value = text;
    summaryWrap.hidden = false;
    var now = new Date();
    var body = { slots: JSON.parse(JSON.stringify(state)), summary: text, submittedAt: now.toISOString(), submittedAtText: now.toLocaleString('ko-KR') };
    if (!db) {
      statusEl.textContent = '이 화면에서는 저장 기능을 쓸 수 없습니다. 아래 요약을 복사해 채팅에 붙여 주세요.';
      summaryWrap.scrollIntoView({ block: 'center' });
      return;
    }
    submitBtn.disabled = true;
    statusEl.textContent = '저장하는 중…';
    db.doc('picks/current').set(body).then(function () {
      statusEl.textContent = '저장했습니다. 채팅에 "제출했어"라고 알려 주시면 결과를 읽어 옵니다.';
      submitBtn.disabled = false;
    }).catch(function () {
      statusEl.textContent = '저장하지 못했습니다. 아래 요약을 복사해 채팅에 붙여 주세요.';
      submitBtn.disabled = false;
      summaryWrap.scrollIntoView({ block: 'center' });
    });
  });
  document.getElementById('copy').addEventListener('click', function () {
    summaryEl.select();
    var done = function () { statusEl.textContent = '요약을 복사했습니다.'; };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(summaryEl.value).then(done).catch(function () { try { document.execCommand('copy'); done(); } catch (e) {} });
    else { try { document.execCommand('copy'); done(); } catch (e) {} }
  });
  paint();
})();
`;

const html = `<title>추석 세트 선택</title>
<style>
  :root { --bg:#f4f1ea; --panel:#fffdf8; --ink:#1f1b16; --muted:#6b6358; --line:#e3ddd1; --tile:#18181b; --accent:#9b2c2c; --ok:#0f7a4f; --okbg:#e3f4ec; --warn:#a15c07; --warnbg:#fbf0dc; color-scheme: light; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg:#121110; --panel:#1b1917; --ink:#f2eee7; --muted:#a39a8d; --line:#2e2a26; --tile:#0b0b0c; --accent:#e07b6f; --ok:#5fd0a0; --okbg:#12291f; --warn:#f0b35a; --warnbg:#2b2113; color-scheme: dark; } }
  :root[data-theme="dark"] { --bg:#121110; --panel:#1b1917; --ink:#f2eee7; --muted:#a39a8d; --line:#2e2a26; --tile:#0b0b0c; --accent:#e07b6f; --ok:#5fd0a0; --okbg:#12291f; --warn:#f0b35a; --warnbg:#2b2113; color-scheme: dark; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font:14px/1.55 "Pretendard","Apple SD Gothic Neo",system-ui,sans-serif; }
  .wrap { max-width:1080px; margin:0 auto; padding-block:28px 120px; padding-inline:16px; }
  h1 { font-size:22px; margin:0 0 6px; }
  .lead { margin:0; color:var(--muted); max-width:70ch; }
  .slot { margin-top:22px; background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:12px; }
  .slot.done { border-color:var(--ok); }
  .slot.redoing { border-color:var(--warn); }
  .shead { display:flex; flex-wrap:wrap; justify-content:space-between; align-items:baseline; gap:4px 12px; margin-bottom:10px; }
  .sname { font-size:15px; font-weight:800; color:var(--accent); }
  .sstate { font-size:12px; color:var(--muted); }
  .slot.done .sstate { color:var(--ok); font-weight:700; }
  .slot.redoing .sstate { color:var(--warn); font-weight:700; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(min(46%,150px),1fr)); gap:10px; }
  .tile { appearance:none; border:2px solid var(--line); background:var(--panel); color:inherit; border-radius:10px; padding:0; overflow:hidden; text-align:left; cursor:pointer; font:inherit; display:flex; flex-direction:column; }
  .tile:focus-visible { outline:3px solid var(--accent); outline-offset:2px; }
  .tile.on { border-color:var(--ok); background:var(--okbg); }
  .imgbox { display:block; background:var(--tile); aspect-ratio:1/1; }
  .imgbox img { width:100%; height:100%; object-fit:contain; image-rendering:pixelated; display:block; }
  .tname { padding:6px 9px 0; font-size:12.5px; font-weight:700; }
  .fresh { font-style:normal; font-size:10px; font-weight:800; color:var(--ok); margin-left:6px; }
  .tnote { padding:1px 9px 8px; font-size:11.5px; color:var(--muted); line-height:1.4; }
  .redo { display:flex; align-items:center; gap:8px; margin-top:12px; font-size:13px; }
  .redo input { width:17px; height:17px; accent-color:var(--warn); }
  .reason { width:100%; margin-top:8px; border:1px solid var(--line); border-radius:8px; background:var(--bg); color:var(--ink); padding:9px 10px; font:inherit; resize:vertical; }
  .reason:focus-visible { outline:2px solid var(--warn); }
  .summary { margin-top:22px; background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:12px; }
  .summary textarea { width:100%; border:1px solid var(--line); border-radius:8px; background:var(--bg); color:var(--ink); padding:9px 10px; font:12.5px/1.5 ui-monospace,Menlo,monospace; }
  .bar { position:fixed; left:0; right:0; bottom:0; background:var(--panel); border-top:1px solid var(--line); padding:10px 16px calc(10px + env(safe-area-inset-bottom, 0px)); }
  .barin { max-width:1080px; margin:0 auto; display:flex; flex-wrap:wrap; align-items:center; gap:8px 14px; }
  #barText { font-weight:700; font-size:13px; font-variant-numeric:tabular-nums; }
  #status { flex:1; min-width:180px; font-size:12px; color:var(--muted); }
  button.act { appearance:none; border:0; border-radius:9px; background:var(--accent); color:#fff; font:inherit; font-weight:800; padding:9px 18px; cursor:pointer; }
  button.act:disabled { opacity:.4; cursor:not-allowed; }
  button.sub { appearance:none; border:1px solid var(--line); border-radius:8px; background:transparent; color:var(--ink); font:inherit; font-weight:700; padding:6px 12px; cursor:pointer; margin-top:8px; }
</style>
<div class="wrap">
  <h1>추석 세트 선택</h1>
  <p class="lead">네 부위(한복 방어구 옥색 저고리 · 복주머니 · 절굿공이 매끈한 손잡이 · 접힌 귀)가 확정되어 미리 골라 두었습니다. 한복 무기는 실제 전통 무기(월도·각궁·편곤·당파·환도·철퇴)에 보름달·감·솔잎·벼이삭을 얹은 여섯 가지, 토끼 슈트는 디테일·방울 판에서 방울과 리본만 뺀 세 장을 맨 앞에 넣었습니다. 마음에 드는 것이 없는 부위는 아래 확인란을 누르고 아쉬운 점을 적어 주시면 그 방향으로 다시 만듭니다. 고른 내용은 이 브라우저에 임시로 남아 있고, [제출]을 눌러야 저장됩니다.</p>
  <div id="slots"></div>
  <div class="summary" id="summaryWrap" hidden>
    <b>제출 요약</b>
    <p class="lead" style="font-size:12.5px;margin:4px 0 8px">저장이 안 되는 경우 이 내용을 복사해 채팅에 붙여 주세요.</p>
    <textarea id="summary" rows="8" readonly></textarea>
    <button type="button" class="sub" id="copy">요약 복사</button>
  </div>
</div>
<div class="bar"><div class="barin">
  <span id="barText">선택 0 · 다시 생성 0 · 미정 6</span>
  <span id="status">부위 여섯 곳을 모두 정하면 제출할 수 있습니다.</span>
  <button type="button" class="act" id="submit" disabled>제출</button>
</div></div>
<script>window.__SLOTS__ = ${JSON.stringify(data)};</script>
<script>${SCRIPT}</script>
`;
writeFileSync(out, html);
console.log(`선택 폼 → ${out} (부위 ${SLOTS.length} · 그림 ${SLOTS.reduce((n, s) => n + s.options.length, 0)}장 · 누락 ${missing})`);
