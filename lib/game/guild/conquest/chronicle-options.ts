/**
 * 연대기 검수 개선 옵션 — **순수 모듈**(DB·SDK import 없음). 검수 화면(클라이언트)이 칩·모델 목록을 그리려면
 * chronicle.ts(db·Anthropic 의존)를 끌어오면 안 된다(클라 import 빌드 게이트). chronicle.ts는 여기서 가져다 쓴다.
 */

/** 피드백 칩 — 라벨은 화면, instruction은 모델 지시. 순서가 화면 순서. */
export const CHRONICLE_FEEDBACK = {
  style: {
    label: '이전 연대기와 같은 구성',
    instruction:
      "[문체 참고]의 직전 게시본과 같은 구성·문체로 맞춘다: 첫 문장은 그날 규모(싸움 수·주인이 바뀐 곳 수)와 가장 많은 사람이 몰린 곳, 문단은 한 흐름씩 첫 문장이 주제문, 마지막 문단은 '이번 점령전으로 …'로 길드별 증감. 담담한 전황 보고체로 쓰고 칼럼식 수사('~의 날이었다', '시험대에 올랐다')와 짧은 단문 나열은 쓰지 않는다. 사실·마커는 그대로.",
  },
  dedupe: {
    label: '중복 표현 지양',
    instruction:
      "같은 낱말·구문의 반복(예: 지키는 이 없던·비어 있던·넘어갔다·차지했다·가져갔다·집행관·하루 만에·노렸으나·막아내며·각각)을 문맥에 맞는 다른 표현으로 바꿔 한 표현이 두 번을 넘지 않게 한다. 같은 사실을 두 번 말하는 문장('~한 셈이 됐다'로 앞 문장을 되받기)과 내용 없는 논평('기세는 계속됐다', '수비가 돋보였다')은 합치거나 뺀다. 사실·마커는 그대로.",
  },
  facts: {
    label: '사실관계 확인',
    instruction:
      "본문의 모든 소유·귀속·인원·수치·공수(누가 지키고 누가 쳐들어갔는지)와 구역의 지역 표기를 사실표와 전수 대조해 어긋난 문장을 사실표대로 고치고, 고친 것은 changes에 kind \"fact\"로 전부 남긴다. 길드 사이 동맹은 없다(같은 구역을 노린 길드는 '합세'가 아니라 서로 경합). 사실표에 적힌 보유 일수·첫 등장·지형 형세(비지·조각)·지역 석권 현황은 근거가 있는 사실이니 지우지 말고, 사실표에 없는 기간·최초·형세 주장만 뺀다.",
  },
  flow: {
    label: '스토리 자연스럽게',
    instruction:
      '같은 길드·같은 지역의 사건을 한 곳에 모아 원인→결과→의미 순으로 잇는다. 그날 가장 크게 움직인 길드의 흐름(얻은 곳과 막힌 곳)을 먼저, 잃은 쪽과 주고받은 길드를 다음에, 사라지거나 돌아온 길드를 끝에 두면 자연스럽다. 문단 첫 문장이 그 문단의 주제를 말하게 하고 문단 사이가 끊기지 않게 연결 문장을 다듬는다. 동시에 벌어진 싸움에 순서(곧장·뒤이어)를 만들지 않는다(사실·연출 순서 규칙 불변, 새 사건 추가 금지).',
  },
  headline: {
    label: '제목을 스토리에 맞게',
    instruction:
      '본문에서 가장 큰 사건과 그 결말을 담아 headline을 새로 짓는다(25자 내외, 마커 포함, 본문에 없는 사실 금지). 본문은 이 항목 때문에 바꾸지 않는다.',
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
