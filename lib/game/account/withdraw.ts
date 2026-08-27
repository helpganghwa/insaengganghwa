import 'server-only';

import { sql, eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { profiles } from '@/lib/db/schema/profiles';
import { guilds } from '@/lib/db/schema/guild';
import { removeAllInquiryImagesForUser } from '@/lib/game/support/inquiry';

/**
 * 회원탈퇴 — 게임 데이터 파기 + PII 제거, 결제·본인인증·미성년한도는 법정 보존(익명화 in-place).
 *
 * profiles 행은 삭제하지 않는다(iap_orders FK가 NO ACTION = 결제기록 보존 앵커). 대신 profiles에
 * 연결된 게임 데이터를 명시 삭제하고 withdrawn_at을 찍는다. 닉네임(characters)·아바타(user_profiles)는
 * 삭제로 제거된다. 재로그인 시 캐릭터가 없으므로 신규처럼 온보딩(즉시 재가입=새 시작).
 *
 * 보존(삭제 안 함): iap_orders, iap_refunds, identity_verifications, monthly_purchase_limits.
 * 길드장은 위임/해산 선행 필요(LEADER_MUST_TRANSFER) — guilds.leader FK 보호.
 * auth.users(카카오 이메일)는 이 함수 밖(withdraw-actions.anonymizeAuthUser)에서 익명화한다 —
 * profiles→auth CASCADE + iap_orders→profiles NO ACTION 때문에 삭제 대신 이메일만 무효화(S2).
 */
export class WithdrawError extends Error {
  constructor(public code: 'LEADER_MUST_TRANSFER') {
    super(code);
    this.name = 'WithdrawError';
  }
}

/**
 * 탈퇴가 **의도적으로 남기는** 테이블 — tests/withdraw-coverage.test.ts가 이 목록과 삭제문을
 * 합쳐 public 전 테이블을 덮는지 검사한다. 새 테이블은 삭제문을 추가하거나 여기 사유와 함께
 * 등재해야 한다(컷오버 가드와 같은 원리 — 수동 목록 누락이 두 스크립트에서 반복돼 절차화).
 */
export const WITHDRAW_PRESERVED: Record<string, string> = {
  profiles: '결제 기록 보존 앵커(iap FK) — withdrawn_at 마킹만',
  iap_orders: '전자상거래법 5년 보존', iap_refunds: '전자상거래법 5년 보존',
  identity_verifications: '법정 보존(청소년보호 판정 원장)', monthly_purchase_limits: '미성년 한도 원장',
  diamond_ledger: '재화 감사 원장 — 결제 분쟁 추적 축(iap_orders와 동축). 칭호 재화 지표는 현 캐릭터 생성 이후로 스코프(judge.ts)',
  referral_attributions: '1인 1회 잠금 — 지우면 탈퇴·재가입으로 추천 보상 무한 재지급(2026-07-22 주석)',
  patron_milestone_grants: '후원 구간 보상 원장(0175) — iap_orders와 동축 보존. 지우면 재가입 시 누적 결제 구간이 다시 지급됨',
  support_inquiries: '분쟁 추적(본문 보존·이미지만 파기 — 함수 내 update)',
  raids: '레이드 엔티티 — 호스트 탈퇴 후에도 참가자를 위해 진행·정산 유지(2026-08-27). 호스트 표시는 characters 부재로 "탈퇴한 대장장이"',
  raid_participants: '참가·피해 기록 — 페이즈 판정 원천(total_damage 합). PII 없음', raid_attacks: '공격 로그 — 피해 이력·감사. PII 없음',
  guild_audit_log: '길드 감사 기록 — 삭제 후 잔존이 존재 목적', admin_actions: '운영 조치 감사',
  admin_mail_logs: '운영 발송 감사', payment_alerts: '결제 사고 원장', client_errors: '오류 수집(운영)',
  chat_messages: '공개 채널 7일 보존 정책(크론 정리) — 귓속말만 즉시 파기(0155 주석)',
  chat_reports: 'chat_messages 정리 주기와 동행', chat_blocks: '차단 목록 유지 — 재가입 시에도 차단 관계 보수적 유지',
  whisper_reports: 'whisper_messages 명시 삭제의 CASCADE로 소멸 — 직접 삭제 불필요',
  conquest_battles: '월드 역사(길드 단위)', world_chronicle: '월드 역사', world_events: '월드 역사',
  guild_tax_distributions: '길드 단위 기록', guilds: '길드 엔티티(리더 탈퇴는 위임/해산 선행)',
  guild_emblems: '길드 자산', guild_emblem_escrows: '길드 자산(에스크로)',
  ranking_leaders: '메트릭당 1행(현 1위) — 시간당 크론이 재계산해 자가치유',
  cbt_carryover: '이월 보상 원장 — wipe 생존이 존재 이유', probability_snapshots: '법정 확률 공시',
  announcements: '전역', admin_scheduled_mails: '전역(운영 예약)', daily_supply_broadcasts: '전역 방송 기록',
  catalog_items: '전역', servers: '전역', zones: '전역', zone_adjacency: '전역',
  system_mode: '전역', cron_heartbeats: '크론 dead-man 원장', schema_migrations: '마이그레이션 원장',
};

export async function withdrawAccount(userId: string): Promise<void> {
  // 길드장이면 탈퇴 불가(위임/해산 먼저) — guilds.leader_user_id는 NO ACTION FK.
  const [led] = await db
    .select({ id: guilds.id })
    .from(guilds)
    .where(eq(guilds.leaderUserId, userId))
    .limit(1);
  if (led) throw new WithdrawError('LEADER_MUST_TRANSFER');

  const uid = sql`${userId}::uuid`;

  await db.transaction(async (tx) => {
    // FK 자식 → 부모 순서. 대부분 profiles FK라 상호 독립이나, 명시 의존만 순서 보장.
    // 레이드(2026-08-27 개편): raids·raid_participants·raid_attacks는 **지우지 않는다**. 페이즈 판정이
    // 참가자 total_damage 합이라 호스트/참가자 기록을 지우면 진행 중 레이드의 체력이 되돌아가고, 호스트
    // 레이드를 지우면 cascade로 다른 참가자의 참여·보상까지 증발했다(8/27 실측: 탈퇴 3건으로 7명이
    // 일일 횟수만 소모·보상 0). 이 행들엔 PII가 없고 닉네임은 characters에서 해석되므로 캐릭터 삭제 후
    // 화면에는 "탈퇴한 대장장이"로 남는다(채팅과 같은 규칙). 본인 귀속 파생 행(초대·보상·요청·카운트)만 정리.
    await tx.execute(sql`delete from raid_invites where invitee_user_id = ${uid} or inviter_user_id = ${uid}`);
    await tx.execute(sql`delete from raid_rewards where user_id = ${uid}`);
    await tx.execute(sql`delete from raid_join_requests where user_id = ${uid}`);
    await tx.execute(sql`delete from raid_daily_counts where user_id = ${uid}`);

    // 길드(멤버십·신청·배치·로그). 길드장 아님은 위에서 보장.
    // 집행관 해제(전수 감사 2026-08-21) — profiles는 소프트 삭제라 FK SET NULL이 안 걸린다.
    // 남기면 그 구역은 executor_user_id≠null이라 방치 중립화에서 영구 면제(B안 유지비용 우회)
    // + 지도에 닉네임 없는 유령 집행관.
    await tx.execute(sql`update zones set executor_user_id = null where executor_user_id = ${uid}`);
    await tx.execute(sql`delete from guild_join_requests where user_id = ${uid}`);
    await tx.execute(sql`delete from guild_battle_deployments where user_id = ${uid}`);
    await tx.execute(sql`delete from guild_leave_log where user_id = ${uid}`);
    await tx.execute(sql`delete from guild_members where user_id = ${uid}`);

    // 신고(내가 한 신고 + 내 프로필 대상 신고) → user_profiles보다 먼저.
    await tx.execute(
      sql`delete from profile_reports where reporter_user_id = ${uid} or profile_id in (select id from user_profiles where user_id = ${uid})`,
    );

    // 우편(수령로그 → 우편), 출석(로그 → 상태), 배틀패스(구간 → 상태).
    await tx.execute(sql`delete from mail_claim_logs where user_id = ${uid}`);
    await tx.execute(sql`delete from mailbox where user_id = ${uid}`);
    await tx.execute(sql`delete from checkin_claim_logs where user_id = ${uid}`);
    await tx.execute(sql`delete from user_checkin_state where user_id = ${uid}`);
    await tx.execute(sql`delete from battlepass_segments where user_id = ${uid}`);
    await tx.execute(sql`delete from battlepass_state where user_id = ${uid}`);

    // 강화/초월/보급 이력·상태.
    await tx.execute(sql`delete from enhancement_logs where user_id = ${uid}`);
    await tx.execute(sql`delete from gem_time_reductions where user_id = ${uid}`);
    await tx.execute(sql`delete from enhancement_jobs where user_id = ${uid}`);
    await tx.execute(sql`delete from transcend_logs where user_id = ${uid}`);
    await tx.execute(sql`delete from supply_open_logs where user_id = ${uid}`);
    await tx.execute(sql`delete from user_supply_boxes where user_id = ${uid}`);
    await tx.execute(sql`delete from user_equipment where user_id = ${uid}`);
    await tx.execute(sql`delete from equipment_change_logs where user_id = ${uid}`);

    // 상점/보급 지급 기록(주기 멱등용 — 재가입 시 새 시작이라 제거).
    await tx.execute(sql`delete from daily_supply_grants where user_id = ${uid}`);
    await tx.execute(sql`delete from premium_daily_grants where user_id = ${uid}`);
    await tx.execute(sql`delete from shop_free_claims where user_id = ${uid}`);
    await tx.execute(sql`delete from shop_purchases where user_id = ${uid}`);

    // 대난투 참가(챔피언 기록은 익명화로 보존 — 아래 set null).
    await tx.execute(sql`delete from melee_participants where user_id = ${uid}`);
    await tx.execute(sql`update melee_battles set champion_user_id = null where champion_user_id = ${uid}`);

    // 친구·공유·광고·푸시.
    await tx.execute(sql`delete from friend_links where requester_id = ${uid} or addressee_id = ${uid}`);
    // ⚠ referral_attributions는 **삭제하지 않는다**(2026-07-22). 이 행이 추천 보상 1인 1회의
    //   유일한 잠금장치라, 지우면 "탈퇴 → 다시 시작"만으로 추천인에게 보상이 무한 재지급된다
    //   (재가입 시 profiles.created_at은 그대로라 신규 가입 판정도 계속 통과, 쿠키는 7일 유지).
    //   PII 없음(내부 id 쌍 + 공개코드) + profiles 행 자체가 결제 앵커로 보존되므로 잔존 무해.
    await tx.execute(sql`delete from shares where user_id = ${uid}`);
    await tx.execute(sql`delete from ad_views where user_id = ${uid}`);
    await tx.execute(sql`delete from push_pending where user_id = ${uid}`);
    await tx.execute(sql`delete from push_subscriptions where user_id = ${uid}`);
    // 귓속말(0155) — profiles 행이 결제 앵커로 남아 CASCADE가 발동하지 않으므로 명시 삭제한다.
    // 사적 통신이라 공개 채널(chat_messages, 7일 보존)과 달리 탈퇴 즉시 파기가 맞다. 상대 화면의
    // 대화도 함께 사라지지만, 떠난 사람의 사담을 남기는 쪽이 더 나쁜 선택이다.
    await tx.execute(sql`delete from whisper_reads where user_id = ${uid} or peer_user_id = ${uid}`);
    await tx.execute(sql`delete from whisper_messages where from_user_id = ${uid} or to_user_id = ${uid}`);

    // 리더보드·개인 기록 — 캐릭터가 사라지면 보드의 값도 유령이 된다(0103·v2 증분화 후속).
    await tx.execute(sql`delete from leaderboard_ranks where user_id = ${uid}`);
    // 도감 챔피언 — 탈퇴 유저가 랭크 슬롯을 계속 점유하면 유령 챔피언이 된다(leaderboard와 동일 취지).
    // 빈 슬롯은 다음 해방 갱신이 채운다.
    await tx.execute(sql`delete from codex_champions where user_id = ${uid}`);
    await tx.execute(sql`delete from user_milestones where user_id = ${uid}`);
    await tx.execute(sql`delete from user_daily_stats where user_id = ${uid}`);

    // ── 2026-08-13 감사 보강 — 컷오버(0782e935)와 같은 수동 목록 누락이 여기에도 있었다.
    //  · challenge_claims/events: PK가 (user, server, id)라 잔존 시 **재가입 유저의 도전과제
    //    보상이 전부 "이미 수령"으로 막힌다** — '새 시작' 원칙의 직접 위반(실피해).
    //  · user_titles(0149): 진행도는 전부 지워지는데 칭호 발견만 남으면 진행 0 계정이
    //    업적 칭호를 달고 시작한다(컷오버에서 잡은 것과 동일 클래스).
    //  · announcement_poll_votes: 유저 데이터 — profiles가 보존 앵커라 CASCADE가 안 탄다.
    //  ⚠ 새 테이블을 만들면 tests/withdraw-coverage.test.ts가 분류를 강제한다(잔존이 옳으면
    //    WITHDRAW_PRESERVED에 사유와 함께 등재).
    await tx.execute(sql`delete from challenge_claims where user_id = ${uid}`);
    await tx.execute(sql`delete from challenge_events where user_id = ${uid}`);
    await tx.execute(sql`delete from user_titles where user_id = ${uid}`);
    await tx.execute(sql`delete from announcement_poll_votes where user_id = ${uid}`);

    // 아바타(프로필 생성잡 → 활성프로필 SET NULL → 프로필) + 캐릭터(닉네임).
    await tx.execute(sql`delete from profile_generation_jobs where user_id = ${uid}`);
    await tx.execute(sql`delete from user_profiles where user_id = ${uid}`);
    await tx.execute(sql`delete from characters where user_id = ${uid}`);

    // PII 제거 마킹 — profiles 자체는 결제 보존 앵커라 유지. 활성 프로필/배경 초기화 + 탈퇴 시각.
    // 본인인증 파생 필드도 클리어(감사 F-14) — 연도 해시는 후보 ~120개라 사실상 가역이라
    // "탈퇴 시 지체 없이 파기" 대상. 결제 경로 판정(minorStatus)은 법정 보존 원장인
    // identity_verifications를 읽으므로 영향 없음 — 이 필드들은 설정 화면 표시 전용.
    await tx
      .update(profiles)
      .set({
        activeBackground: null,
        withdrawnAt: new Date(),
        birthYearHash: null,
        isAdult: false,
        identityVerifiedAt: null,
        verifiedPhone: null, // 0143 — 법정 보존 항목 아님, 탈퇴 시 지체 없이 파기

      })
      .where(eq(profiles.id, userId));

    // 문의 첨부 이미지 경로 클리어(0116) — 문의 행(본문)은 분쟁 추적용 보존이지만,
    // 이미지는 PII 밀도가 높아(결제내역 스크린샷 등) 탈퇴 시 파기. 파일 실체는 tx 밖에서.
    await tx.execute(sql`update support_inquiries set image_paths = '{}' where user_id = ${uid}`);
  });

  // 스토리지 첨부 파기(best-effort, tx 밖) — private 버킷이라 남아도 노출은 없음.
  await removeAllInquiryImagesForUser(userId);
}
