import { getTutorialStep } from '@/lib/game/tutorial';

import { TutorialCoach } from './TutorialCoach';

/** Suspense 경계 안에서 단계 파생(핫패스 비차단) → 클라이언트 코치마크에 전달. */
export async function TutorialCoachAsync({ userId }: { userId: string }) {
  const step = await getTutorialStep(userId);
  return <TutorialCoach step={step} />;
}
