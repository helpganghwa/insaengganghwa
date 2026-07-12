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
 * auth.users PII 익명화(보안감사 S2) — 카카오 이메일 등 개인정보를 제거한다. **삭제가 아닌
 * 익명화**인 이유: `profiles.id → auth.users.id`가 ON DELETE CASCADE라 auth 유저를 지우면
 * profiles까지 지워지려다 `iap_orders → profiles`(NO ACTION, 결제기록 5년 보존 앵커)에 막혀
 * 결제기록 있는 유저는 삭제 자체가 실패한다. 대신 이메일을 계정별 유일한 무효 주소로 바꿔
 * 실이메일(PII)만 파기 — 결제 보존 FK는 그대로. 재로그인=새 시작(카카오 재연동 시 새 이메일).
 * best-effort: 실패해도 탈퇴 진행(다음 탈퇴/GC에서 재시도 가능, 게임 데이터는 이미 파기됨).
 */
async function anonymizeAuthUser(userId: string): Promise<void> {
  try {
    const admin = createSupabaseServiceClient();
    await admin.auth.admin.updateUserById(userId, {
      email: `withdrawn+${userId}@deleted.ganghwa.app`,
      email_confirm: false,
      user_metadata: {},
    });
  } catch (e) {
    console.warn('[withdraw] auth email anonymize failed (continuing)', e);
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
  await anonymizeAuthUser(userId); // best-effort — 카카오 이메일(PII) 파기(개인정보보호법 §21)

  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect('/login?withdrawn=1');
}
