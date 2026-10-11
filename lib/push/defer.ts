import { after } from 'next/server';

/**
 * 응답을 보낸 뒤에 푸시 같은 best-effort 작업을 돌린다 — 발송 지연이 액션 응답을 붙잡지 않게(레이드 초대와 같은 방식).
 * 요청 밖(테스트·스크립트·크론 내부 호출)에서는 after()가 던지므로 바로 돈다. 실패는 액션에 번지지 않게 삼키되 로그는 남긴다(10-11 재검사).
 */
export function afterResponse(fn: () => Promise<unknown>): void {
  const run = () => fn().catch((e: unknown) => console.warn('[afterResponse] failed', (e as Error)?.message ?? e));
  try {
    after(run);
  } catch {
    void run();
  }
}
