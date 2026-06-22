-- mailbox_type enum 재정비:
--   제거: enhance_result, raid_settlement (enum 정의만 있고 실제 발송 0건 — 안전)
--   추가: melee(대난투), conquest(점령전), guild(길드 알림)
-- 기존 reward/notice로 묶여 있던 대난투·점령전·길드 통지를 전용 타입으로 분리.
--
-- PG enum은 값 삭제가 불가 → 타입 재생성으로 처리. mailbox.type 외 의존 컬럼 없음(검증).
-- raid_settlement 라벨이 아직 남아있을 때만 1회 실행(멱등). 영향 행 0건이라 USING 캐스트 안전.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'mailbox_type' AND e.enumlabel = 'raid_settlement'
  ) THEN
    ALTER TYPE mailbox_type RENAME TO mailbox_type_old;

    CREATE TYPE mailbox_type AS ENUM (
      'reward',
      'notice',
      'admin',
      'profile_accepted',
      'profile_rejected_ai',
      'profile_failed',
      'melee',
      'conquest',
      'guild'
    );

    ALTER TABLE mailbox
      ALTER COLUMN type TYPE mailbox_type
      USING type::text::mailbox_type;

    DROP TYPE mailbox_type_old;
  END IF;
END $$;
