/**
 * 연대기 검수 개선 옵션 — **순수 모듈**(DB·SDK import 없음). 검수 화면(클라이언트)이 칩·모델 목록을 그리려면
 * chronicle.ts(db·Anthropic 의존)를 끌어오면 안 된다(클라 import 빌드 게이트). chronicle.ts는 여기서 가져다 쓴다.
 */

/** 피드백 칩 — 라벨은 화면, instruction은 모델 지시. 순서가 화면 순서. */
export const CHRONICLE_FEEDBACK = {
  dedupe: {
    label: '중복 표현 지양',
    instruction:
      '같은 낱말·구문의 반복(예: 집행관·하루 만에·노렸으나·막아내며·각각)을 문맥에 맞는 다른 표현으로 바꿔 한 표현이 두 번을 넘지 않게 한다. 사실·마커는 그대로.',
  },
  facts: {
    label: '사실관계 확인',
    instruction:
      '본문의 모든 소유·귀속·인원·수치·공수(누가 지키고 누가 쳐들어갔는지)를 사실표와 전수 대조해 어긋난 문장을 사실표대로 고치고, 고친 것은 changes에 kind "fact"로 전부 남긴다.',
  },
  flow: {
    label: '스토리 자연스럽게',
    instruction:
      '같은 길드·같은 지역의 사건을 한 곳에 모아 원인→결과→의미 순으로 잇고, 문단 첫 문장이 그 문단의 주제를 말하게 하며, 문단 사이가 끊기지 않게 연결 문장을 다듬는다(사실·순서 규칙 불변, 새 사건 추가 금지).',
  },
  headline: {
    label: '제목을 스토리에 맞게',
    instruction:
      '본문에서 가장 큰 사건과 그 결말을 담아 headline을 새로 짓는다(30자 안팎, 마커 포함, 본문에 없는 사실 금지). 본문은 이 항목 때문에 바꾸지 않는다.',
  },
  concise: {
    label: '더 간결하게',
    instruction: '사실은 하나도 빼지 않고 군더더기 수식·중복 설명을 줄여 전체 길이를 20~30% 줄인다.',
  },
} as const;
export type ChronicleFeedbackKey = keyof typeof CHRONICLE_FEEDBACK;

/** 개선 패스에 고를 수 있는 모델 — 기본은 생성과 같은 Sonnet 5. */
export const CHRONICLE_IMPROVE_MODELS = {
  'claude-sonnet-5': 'Sonnet 5',
  'claude-opus-5': 'Opus 5',
  'claude-fable-5-1': 'Fable 5.1',
} as const;
export type ChronicleImproveModel = keyof typeof CHRONICLE_IMPROVE_MODELS;

/** 재검수·개선 패스가 남기는 변경 한 건(저장 컬럼 review_notes와 같은 꼴). */
export type ChronicleReviewNote = { kind: 'fact' | 'style'; before: string; after: string; reason: string };
