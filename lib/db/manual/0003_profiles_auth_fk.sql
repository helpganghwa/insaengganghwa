-- profiles.id → auth.users.id FK 추가 (ON DELETE CASCADE).
-- Drizzle 스키마 코드(lib/db/schema/profiles.ts)에는 auth 스키마 참조가 들어가지 않아
-- 0000 마이그레이션에서 누락 → 유저 탈퇴 시 profiles 고아 row 발생.
-- 멱등 처리: 이미 같은 이름 FK 있으면 noop.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_id_fkey' AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_id_fkey
      FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;
