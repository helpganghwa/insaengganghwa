-- 0216 — 연대기 생성 원본(2026-09-24, feat/update-small-12).
-- 운영자가 공개 전에 본문·제목을 고치면 today_text·headline이 덮여 AI가 처음 쓴 글이 사라졌다. 원본을 따로 남겨
-- '운영자가 얼마나 고쳤나'(scripts/chronicle-edit-rate.ts)를 날마다 재고, 프롬프트·모델 변경의 효과를 수치로 비교한다.
-- 추가 전용·기본값 없음(기존 행 null). 코드 배포 **전에** 적용한다(생성 insert가 이 컬럼을 쓴다).
alter table world_chronicle add column if not exists generated_text text;
alter table world_chronicle add column if not exists generated_headline text;
