// PROFILE v3 — create-character-v3 호출 헬퍼(골격).
// 흐름: 랜덤 외형(appearance-v3) → Claude 조합(compose-v3) → create-character-v3 POST.
// 폴링/다운로드/미러링은 기존 pipeline.ts의 rotation_urls 처리를 재사용(v3도 동일 GET 사용).
// ※ 아직 라이브 생성 흐름(create-character-state)을 대체하지 않음 — 교체는 별도 단계.
import 'server-only';

import { composeV3Description } from './compose-v3';
import { pickRandomAppearance, type Appearance } from './appearance-v3';
import type { ProfileGender } from './refs';

const PIXELLAB_BASE = 'https://api.pixellab.ai/v2';
// 확정: 256 정사각(최대 area·디테일·기존 정사각 아바타 통합) + 전신은 프롬프트 강제.
const V3_SIZE = 256;

export interface CreateV3Input {
  gender: ProfileGender;
  /** 장비 시그니처 묘사(특색). 보통 catalog wornDesc. */
  weapon: string;
  armor: string;
  accessory: string;
  /** 미지정 시 성별 풀에서 랜덤 부여. */
  appearance?: Appearance;
}

export interface CreateV3Result {
  characterId: string;
  backgroundJobId: string | null;
  /** 실제 전달한 description(재현·검수 컨텍스트용 저장). */
  description: string;
  appearance: Appearance;
}

/**
 * v3 캐릭터 생성 요청. 외형 랜덤 + Claude 조합 + POST /create-character-v3.
 * 옵션 고정: 256×256 · high detail · outline lineless · enhance_prompt OFF · no_background.
 * 실패(키 없음·API 오류) throw.
 */
export async function createCharacterV3(input: CreateV3Input): Promise<CreateV3Result> {
  const key = process.env.PIXELLAB_API_KEY;
  if (!key) throw new Error('PIXELLAB_API_KEY missing');

  const appearance = input.appearance ?? pickRandomAppearance(input.gender);
  const description = await composeV3Description({
    gender: input.gender,
    appearance,
    weapon: input.weapon,
    armor: input.armor,
    accessory: input.accessory,
  });

  const res = await fetch(`${PIXELLAB_BASE}/create-character-v3`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({
      description,
      image_size: { width: V3_SIZE, height: V3_SIZE },
      detail: 'high detail',
      outline: 'lineless',
      enhance_prompt: false,
      no_background: true,
    }),
  });
  if (!res.ok) {
    const t = (await res.text()).slice(0, 300);
    throw new Error(`create-character-v3 HTTP ${res.status}: ${t}`);
  }
  const j = (await res.json()) as { character_id: string; background_job_id?: string };
  return {
    characterId: j.character_id,
    backgroundJobId: j.background_job_id ?? null,
    description,
    appearance,
  };
}
