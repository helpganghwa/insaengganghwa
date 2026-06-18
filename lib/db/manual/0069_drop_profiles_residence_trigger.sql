-- profiles의 잔존 거주지 트리거 제거.
-- residence_zone_id는 0064에서 profiles → characters 로 이동했으나, profiles의
-- BEFORE INSERT 트리거 trg_default_residence(set_default_residence)가 남아 있었다.
-- 이 함수가 NEW.residence_zone_id(이제 profiles엔 없는 컬럼)를 참조 → 0067 이후
-- 신규 가입(handle_new_user의 profiles insert)마다 "record new has no field
-- residence_zone_id"로 실패 → Supabase OAuth "Database error saving new user".
-- 거주지는 createCharacterAuto(앱)가 캐릭터 생성 시 무작위 구역으로 설정하므로 트리거 불필요.
drop trigger if exists trg_default_residence on public.profiles;
drop function if exists public.set_default_residence();
