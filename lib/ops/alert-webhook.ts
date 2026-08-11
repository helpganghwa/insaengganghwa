import 'server-only';

/**
 * 테스트 실행 여부 — 경보 **발신 지점**(raisePaymentAlert·raiseOpsAlert)이 이걸로 채널을 끊는다.
 *
 * DB 통합 테스트가 AMOUNT_MISMATCH 같은 사고 경로를 일부러 태우는데, `.env.local`의 웹훅 URL을
 * Vitest가 자동 로드해 **운영 디스코드로 진짜 알림이 갔다**(2026-08-11 확인 — test_mismatch_* 주문이
 * 경보 채널에 쌓였다). 경보 채널은 '진짜 사고만 울린다'는 신뢰가 곧 가치라, 테스트 소음이 섞이면
 * 실제 사고를 흘려보게 된다.
 *
 * ⚠ 이 가드는 발신 지점에만 둔다 — postAlertWebhook 자체에 넣으면 이 함수의 계약 테스트가
 * 전부 무력화된다(fetch 호출·상태 로깅을 검증할 수 없게 된다).
 */
export function isTestRun(): boolean {
  return !!process.env.VITEST || process.env.NODE_ENV === 'test';
}

/**
 * 결제·운영 경보 공용 웹훅 발송(디스코드/슬랙). `PAYMENT_ALERT_WEBHOOK_URL` 미설정이면 no-op —
 * 채널을 안 붙였다고 경보 자체가 실패하면 안 되므로 조용히 건너뛴다(어드민 앱푸시는 별도 채널).
 *
 * mention=true면 `PAYMENT_ALERT_WEBHOOK_MENTION`을 본문 맨 앞에 붙인다. 디스코드는 멘션이 있는
 * 메시지를 **채널 알림 설정과 무관하게** 보내고, **데스크톱이 활성이어도 모바일 푸시를 억제하지
 * 않는다**. 멘션이 없으면 "이미 보고 있다"고 판단해 모바일 알림을 누르는데, PC를 켜둔 채 자리를
 * 비운 새벽에 사고가 나면 그대로 놓친다(2026-08-11 실제 확인). 그래서 즉시 조치가 필요한 건에만
 * 붙이고 나머지는 채널에 조용히 쌓이게 둔다 — 전부 붙이면 곧 무시하게 된다.
 *
 * 값 예: `<@123…>`(개인) 또는 `<@&123…>`(역할). 미설정이면 멘션 없이 발송.
 */
export async function postAlertWebhook(content: string, opts: { mention: boolean }): Promise<void> {
  const url = process.env.PAYMENT_ALERT_WEBHOOK_URL;
  if (!url) return;
  const tag = opts.mention ? (process.env.PAYMENT_ALERT_WEBHOOK_MENTION ?? '').trim() : '';
  const body = tag ? `${tag} ${content}` : content;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // Discord는 content, Slack은 text를 읽는다 — 둘 다 실어 어느 채널이든 그대로 붙는다.
      body: JSON.stringify({ content: body, text: body }),
    });
    // fetch는 4xx/5xx에 던지지 않는다 — 웹훅을 지우거나 채널을 옮기면 404가 조용히 돌아올 뿐이라
    // 상태를 직접 봐야 '경보 채널이 죽은' 것을 안다. 안 보면 사고가 터질 때까지 아무도 모른다
    // (2026-08-11). 실패해도 던지지 않는 계약은 유지 — 죽은 채널이 경보 본작업을 깨면 안 된다.
    if (!res.ok) {
      // 본문 읽기 자체가 던질 수 있어(스트림 파손 등) 진단 정보 때문에 계약이 깨지지 않게 감싼다.
      const detail = await res
        .text()
        .then((t) => t.slice(0, 200))
        .catch(() => '');
      console.error('[alert-webhook] notify failed — HTTP', res.status, detail);
    }
  } catch (e) {
    console.error('[alert-webhook] notify failed', e);
  }
}
