-- 속성(구 룬)-아바타 종속(2026-07-28 사용자 확정): 아바타 삭제 시 속성 동반 삭제.
-- 스테이징 UI 검토 후 결정 — 별개 자산 → 아바타 부속 수치로 전환. 표기(외형) 아바타와
-- 속성 적용 아바타는 별도 선택 유지(characters.active_profile_id / equipped_rune_id).

-- 1) 고아 속성 정리(출처 아바타가 이미 없는 행) — FK 부여 전 필수.
delete from runes r
where r.source_profile_id is null
   or not exists (select 1 from user_profiles p where p.id = r.source_profile_id);

-- 2) 출처 필수 + 아바타 삭제 시 cascade.
alter table runes alter column source_profile_id set not null;
alter table runes drop constraint if exists runes_source_profile_fk;
alter table runes add constraint runes_source_profile_fk
  foreign key (source_profile_id) references user_profiles(id) on delete cascade;

-- 3) 이미 끊긴 장착 참조 정리(안전망 — 앱은 삭제 tx에서 함께 해제).
update characters c set equipped_rune_id = null
where c.equipped_rune_id is not null
  and not exists (select 1 from runes r where r.id = c.equipped_rune_id);
