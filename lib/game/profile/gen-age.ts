/**
 * 아바타 생성 잡의 **생성 경과** 산정 — PROFILE §2.
 *
 * 파이프라인에는 성격이 다른 두 시간 예산이 있고, 서로 다른 기준 시각을 재야 한다.
 *  · 큐 대기(queued/starting) — `created_at` 기준, QUEUED_TIMEOUT_MIN(60분). 슬롯이 빌 때까지
 *    줄 서 있는 시간이라 길어질 수 있고, 길어지는 것 자체는 정상이다.
 *  · 생성(downloading) — **발주 시각** 기준, PROFILE_GEN_TIMEOUT_MIN(20분). Pixellab이 실제로
 *    그림을 그리는 시간이다.
 *
 * 둘 다 created_at으로 재면 대기 시간이 생성 예산을 잠식한다. 대기가 20분을 넘긴 잡은 발주
 * 직후 첫 폴링에서 즉시 타임아웃 처리되고, 그 시점엔 Pixellab 과금이 이미 끝나 있다
 * (유저는 환불받지만 생성물은 버려지고, 하필 "내 차례가 온 순간" 실패한다).
 * 큐가 서지 않던 CBT 실측(478건 전부 대기 0분)에서는 드러나지 않았고, 동시 생성 상한
 * (키당 4)을 넘는 인원이 몰릴 때 발현한다.
 */

/** 발주 시각이 담기는 options 키 — pipeline-v3.ts claimSlot이 queued→starting 전이에서 기록한다. */
const CLAIMED_AT_KEY = 'pixellabClaimedAt';

/**
 * 이 잡이 Pixellab에서 생성된 시간(분). 큐에서 기다린 시간은 포함하지 않는다.
 *
 * 기준은 options.pixellabClaimedAt(발주 직전, 앱 시계 epoch ms). 이 값이 없는 레거시 잡은
 * created_at으로 폴백해 종전 동작을 그대로 유지한다.
 *
 * 부수적으로 시계 혼용도 사라진다 — created_at은 DB 시계(now())고 비교 대상은 앱 시계라
 * 두 시계가 섞여 있었는데, claimedAt은 비교 대상과 같은 앱 시계다.
 */
export function generationAgeMin(
  options: unknown,
  createdAt: Date | string | null,
  now: number,
): number {
  const raw = (options as Record<string, unknown> | null)?.[CLAIMED_AT_KEY];
  const claimed = typeof raw === 'string' ? Number(raw) : raw;
  const base =
    typeof claimed === 'number' && Number.isFinite(claimed) && claimed > 0
      ? claimed
      : new Date(createdAt ?? 0).getTime();
  return (now - base) / 60_000;
}
