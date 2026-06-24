'use server';

import { redirect } from 'next/navigation';

import { getSessionUserId } from '@/lib/auth/session';
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/auth/supabase-server';
import { withdrawAccount, WithdrawError } from '@/lib/game/account/withdraw';

/** 카카오 연결해제(best-effort) — 실패해도 탈퇴는 진행. KAKAO_ADMIN_KEY 필요. */
async function kakaoUnlink(userId: string): Promise<void> {
  const adminKey = process.env.KAKAO_ADMIN_KEY;
  if (!adminKey) return;
  try {
    const admin = createSupabaseServiceClient();
    const { data } = await admin.auth.admin.getUserById(userId);
    const kakao = data.user?.identities?.find((i) => i.provider === 'kakao');
    const kakaoId = kakao?.id ?? (kakao?.identity_data?.sub as string | undefined);
    if (!kakaoId) return;
    await fetch('https://kapi.kakao.com/v1/user/unlink', {
      method: 'POST',
      headers: {
        Authorization: `KakaoAK ${adminKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `target_id_type=user_id&target_id=${encodeURIComponent(kakaoId)}`,
      signal: AbortSignal.timeout(5000),
    });
  } catch (e) {
    console.warn('[withdraw] kakao unlink failed (continuing)', e);
  }
}

/**
 * 회원탈퇴 — 게임데이터 파기 + PII 제거 + 카카오 연결해제 + 로그아웃. 결제·본인인증은 법정 보존.
 * 길드장은 위임/해산 선행 필요. 성공 시 /login으로 리다이렉트(재로그인=새 시작).
 */
export async function withdrawAction(): Promise<{ status: 'error'; code: string } | never> {
  const userId = await getSessionUserId();
  if (!userId) return { status: 'error', code: 'UNAUTHENTICATED' };

  try {
    await withdrawAccount(userId);
  } catch (e) {
    if (e instanceof WithdrawError) return { status: 'error', code: e.code };
    console.error('[withdraw]', e);
    return { status: 'error', code: 'UNKNOWN' };
  }

  await kakaoUnlink(userId); // best-effort

  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect('/login?withdrawn=1');
}
