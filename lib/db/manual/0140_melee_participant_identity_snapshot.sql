-- 0140. 대난투 참가자 닉네임·아바타 스냅샷
--
-- 순위표만 실시간 값(characters.nickname · 활성 프로필 아바타)을 읽어, 개명·아바타 변경·서버
-- 이동 후 과거 회차를 열면 그 회차와 다른 사람처럼 보였다. 전투 재생·포디움·역대 우승자는
-- 이미 회차 스냅샷(finale.roster)을 쓰므로 같은 화면 안에서 값이 어긋나기도 했다.
-- 길드 스냅샷(0138)과 동일하게 전 참가자분을 참가자 행에 박제한다.
--
-- face_box는 아바타와 **쌍**이다 — 스냅샷 아바타에 현재 얼굴박스를 씌우면 크롭이 어긋나므로
-- 조회 측에서 (avatar, face_box)를 함께 스냅샷/실시간으로 고른다.
alter table melee_participants add column if not exists nickname text;
alter table melee_participants add column if not exists avatar text;
alter table melee_participants add column if not exists face_box jsonb;

-- 과거 회차 소급 — finale.roster에 남아 있는 만큼(피날레 윈도 등장자 = 상위권)은 되살린다.
-- roster에 없는 하위권은 null로 남고 조회 측이 실시간 값으로 폴백한다.
update melee_participants mp
   set nickname = coalesce(mp.nickname, r.nickname),
       avatar = coalesce(mp.avatar, r.avatar)
  from melee_battles b,
       jsonb_to_recordset(b.finale -> 'roster') as r("userId" uuid, nickname text, avatar text)
 where mp.battle_id = b.id
   and mp.user_id = r."userId"
   and mp.nickname is null;
