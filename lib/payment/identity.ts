import 'server-only';

import { createHash } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { identityVerifications } from '@/lib/db/schema/payment';
import { profiles } from '@/lib/db/schema/profiles';

/**
 * 포트원(PortOne) V2 본인인증 — KG이니시스 통합인증 채널.
 * 클라이언트가 requestIdentityVerification로 인증을 마치면 identityVerificationId를 서버로 넘겨,
 * 여기서 **포트원 서버 재조회**로 검증한다(클라 결과 신뢰 금지, CLAUDE §3.1). 인증기관 검증값(실명·생년)은
 * **저장하지 않고** 성년 여부 + 출생연도 해시만 남긴다(개인정보 최소화, REGULATORY §3).
 * 인증: `Authorization: PortOne {API_SECRET}`. GET /identity-verifications/{id}.
 */
const API_BASE = 'https://api.portone.io';

function apiSecret(): string {
  const s = process.env.PORTONE_API_SECRET;
  if (!s) throw new Error('PORTONE_API_SECRET missing');
  return s;
}

type IdentityResult = { status: 'READY' | 'VERIFIED' | 'FAILED'; birthDate?: string };

/** 본인인증 단건 조회 — status + 인증된 생년월일(YYYY-MM-DD)만 추출. */
async function getPortoneIdentity(identityVerificationId: string): Promise<IdentityResult> {
  const res = await fetch(
    `${API_BASE}/identity-verifications/${encodeURIComponent(identityVerificationId)}`,
    {
      headers: { Authorization: `PortOne ${apiSecret()}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`portone identity ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    status: IdentityResult['status'];
    verifiedCustomer?: { birthDate?: string };
  };
  return { status: data.status, birthDate: data.verifiedCustomer?.birthDate };
}

/** 생년월일(YYYY-MM-DD 또는 YYYYMMDD) → 만나이 기준 성년(만 19세 이상) 여부 + 출생연도. */
function assessBirth(birthDate: string): { isAdult: boolean; birthYear: string } {
  const d = birthDate.replace(/\D/g, '');
  const y = Number(d.slice(0, 4));
  const m = Number(d.slice(4, 6));
  const day = Number(d.slice(6, 8));
  const now = new Date();
  let age = now.getFullYear() - y;
  if ((now.getMonth() + 1) * 100 + now.getDate() < m * 100 + day) age -= 1;
  return { isAdult: age >= 19, birthYear: d.slice(0, 4) };
}

export type VerifyResult =
  | { ok: true; isAdult: boolean }
  | { ok: false; code: 'NOT_VERIFIED' | 'NO_BIRTH' | 'ALREADY_USED' | 'ERROR'; message: string };

/**
 * 본인인증 결과 검증 + 저장. 포트원 재조회 → VERIFIED 확인 → 성년 판정 →
 * identity_verifications(감사) append + profiles(is_adult·verified_at·birth_year_hash) 갱신.
 * 실패/미검증은 저장 없이 실패 반환. birth_year_hash = sha256(출생연도)로 원본 미저장.
 */
export async function verifyAndStoreIdentity(
  userId: string,
  identityVerificationId: string,
): Promise<VerifyResult> {
  let idv: IdentityResult;
  try {
    idv = await getPortoneIdentity(identityVerificationId);
  } catch (e) {
    return { ok: false, code: 'ERROR', message: (e as Error).message };
  }
  if (idv.status !== 'VERIFIED') {
    return { ok: false, code: 'NOT_VERIFIED', message: '본인인증이 완료되지 않았습니다.' };
  }
  if (!idv.birthDate) {
    return { ok: false, code: 'NO_BIRTH', message: '생년월일 정보를 확인할 수 없습니다.' };
  }
  const { isAdult, birthYear } = assessBirth(idv.birthDate);
  const birthYearHash = createHash('sha256').update(birthYear).digest('hex');

  try {
    await db.transaction(async (tx) => {
      // identityVerificationId 저장 + 전역 UNIQUE(0114) — 같은 인증 건을 다른 계정이 재사용해
      // is_adult를 얻어 미성년 한도를 우회하던 replay 차단(보안감사 S1). 재사용이면 여기서
      // 유니크 위반 → tx 롤백(profiles.is_adult도 세팅 안 됨) → ALREADY_USED로 거부.
      await tx.insert(identityVerifications).values({
        userId,
        provider: 'kg_inicis',
        identityVerificationId,
        birthYearHash,
        isAdult,
      });
      await tx
        .update(profiles)
        .set({ isAdult, identityVerifiedAt: sql`now()`, birthYearHash })
        .where(eq(profiles.id, userId));
    });
  } catch (e) {
    // 23505 = unique_violation(이미 소비된 인증 건).
    if ((e as { code?: string }).code === '23505') {
      return {
        ok: false,
        code: 'ALREADY_USED',
        message: '이미 사용된 본인인증이에요. 다시 인증해 주세요.',
      };
    }
    throw e;
  }
  return { ok: true, isAdult };
}
