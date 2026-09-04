/**
 * 후원 구간 보상 — 순수 정의(서버·클라·테스트 공용). 2026-08-26 확정.
 *
 * 누적 결제(원, paid 합·환불 제외)가 구간에 도달하면 감사 우편 1회(💎+📦). 환급률은 어느 구간이든
 * 누적 8.5%(최저 실구매 단가 mega ₩4.25/💎 기준) — 구간 폭에 비례한 정액이라 중간에 멈춰도 손해가 없다.
 *  A 5만~50만: 5만마다  💎1,000 + 📦30 (10구간)
 *  B 60만~200만: 10만마다 💎2,000 + 📦60 (15구간)
 *  C 250만~500만: 50만마다 💎10,000 + 📦300 (6구간)
 *  D 600만: 💎20,000 + 📦600 (500만→600만 100만 폭) · 650만~1,000만: 50만마다 💎10,000 + 📦300 (8구간)
 *    — 2026-09-04 변경: 100만 단위가 너무 길다는 후원자 건의로 50만 단위로 쪼갬. 폭 대비 정액은 그대로라
 *      환급률 8.5% 불변. 기존 700만 수령분(💎20,000)은 회수하지 않고 새 650·750·… 구간만 소급 지급.
 * 칭호 구간(5·20·50·200·500·1,000만)은 보너스 구간 위에 정확히 겹쳐 한 통의 우편으로 온다(칭호 자체는
 * titles/judge.ts가 누적 결제로 판정 — 여기선 우편 문안에 칭호 문단만 덧붙인다).
 * 상자는 원가 0(환급률 계산 제외)·3의 배수·슬롯 균등. 확정 보상만 — 확률공시(§33) 비대상.
 */
export type PatronMilestone = {
  /** 누적 결제 기준(원). */
  krw: number;
  diamond: number;
  boxes: number;
  /** 같은 구간에 도달하는 후원 칭호(있으면 우편에 칭호 문단 추가). */
  titleCode?: string;
  titleLabel?: string;
};

const TITLE_AT: Record<number, { code: string; label: string; line: string }> = {
  50_000: { code: 'pay_5', label: '기사 후원자', line: '그리고 오늘, 기사 후원자 칭호가 당신의 이름 앞에 붙습니다.' },
  200_000: { code: 'pay_20', label: '영주 후원자', line: '그리고 오늘, 당신의 깃발이 영지에 꽂혔습니다. 영주 후원자 칭호를 전합니다.' },
  500_000: { code: 'pay_50', label: '왕실 후원자', line: '그리고 오늘, 왕실이 당신의 후원을 기억합니다. 왕실 후원자 칭호를 전합니다.' },
  2_000_000: { code: 'pay_200', label: '왕국의 기둥', line: '그리고 오늘, 왕국이 당신 위에 서 있습니다. 왕국의 기둥 칭호를 전합니다.' },
  5_000_000: { code: 'pay_500', label: '화로의 수호자', line: '그리고 오늘, 이 불이 꺼지지 않는 이유 중 하나가 당신이라는 걸 기록합니다. 화로의 수호자 칭호를 전합니다.' },
  10_000_000: { code: 'pay_1000', label: '영원의 불꽃', line: '그리고 오늘, 대장간의 역사에 당신의 이름이 새겨집니다. 영원의 불꽃 칭호를 전합니다.' },
};

function band(from: number, to: number, step: number, diamond: number, boxes: number): PatronMilestone[] {
  const out: PatronMilestone[] = [];
  for (let krw = from; krw <= to; krw += step) {
    const t = TITLE_AT[krw];
    out.push({ krw, diamond, boxes, ...(t ? { titleCode: t.code, titleLabel: t.label } : {}) });
  }
  return out;
}

/** 40구간 오름차순 — 정본. */
export const PATRON_MILESTONES: readonly PatronMilestone[] = [
  ...band(50_000, 500_000, 50_000, 1_000, 30),
  ...band(600_000, 2_000_000, 100_000, 2_000, 60),
  ...band(2_500_000, 5_000_000, 500_000, 10_000, 300),
  ...band(6_000_000, 6_000_000, 1_000_000, 20_000, 600),
  ...band(6_500_000, 10_000_000, 500_000, 10_000, 300),
];

/** 누적 결제액으로 도달한 구간 전부(오름차순). */
export function reachedMilestones(paidKrw: number): PatronMilestone[] {
  return PATRON_MILESTONES.filter((m) => m.krw <= paidKrw);
}

/** 다음 구간(없으면 null — 1,000만 완주). */
export function nextMilestone(paidKrw: number): PatronMilestone | null {
  return PATRON_MILESTONES.find((m) => m.krw > paidKrw) ?? null;
}

/** '5만'·'1,000만' 표기. */
export function formatKrwMan(krw: number): string {
  return `${(krw / 10_000).toLocaleString('ko-KR')}만`;
}

/**
 * 우편 문안 — 공통 두 문장 + 칭호 구간이면 한 단락 추가. 제목이 곧 푸시 문구.
 * 이모지는 💎·📦 외 사용하지 않는다(2026-08-26 운영 우편 원칙; 첨부 재화는 우편함 UI가 그린다).
 */
export function patronMailTitle(m: PatronMilestone): string {
  return `후원 감사 보급 — 누적 ${formatKrwMan(m.krw)}${m.titleLabel ? ` · ${m.titleLabel}` : ''}`;
}
export function patronMailBody(m: PatronMilestone): string {
  const base = '대장간을 지켜주시는 마음에 감사드립니다. 후원 감사 보급을 전합니다.';
  const t = TITLE_AT[m.krw];
  return t ? `${base}\n\n${t.line}` : base;
}

/** 슬롯 균등 분배(3의 배수 전제) — 나머지는 weapon→armor 순으로. */
export function splitBoxesEven(n: number): { weapon: number; armor: number; accessory: number } {
  const base = Math.floor(n / 3);
  const rem = n - base * 3;
  return { weapon: base + (rem > 0 ? 1 : 0), armor: base + (rem > 1 ? 1 : 0), accessory: base };
}
