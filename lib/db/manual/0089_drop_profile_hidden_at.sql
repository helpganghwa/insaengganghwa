-- 0089_drop_profile_hidden_at.sql — user_profiles.hidden_at 데드코드 제거(감사 P-A9). 멱등.
-- 운영자 수동 비공개(hide) 기능은 도입하지 않기로 확정 — hidden_at은 코드 어디서도 set되지
-- 않는 죽은 컬럼인데, 일부 조회는 `hidden_at IS NULL`로 필터해 "목록엔 안 보이나 PROFILE_MAX
-- 슬롯은 차지"하는 잠재 모순(P-A1·P-A9)의 표면이었다. 신고 조치는 아바타 초기화·경고·정지로
-- 일원화돼 hide 불필요. 컬럼과 부분 인덱스 술어를 함께 제거한다.
-- 부분 인덱스(report_count_idx WHERE hidden_at IS NULL)가 컬럼에 의존하므로 먼저 재정의.
drop index if exists user_profiles_report_count_idx;
create index if not exists user_profiles_report_count_idx
  on user_profiles (report_count desc);
alter table user_profiles drop column if exists hidden_at;
