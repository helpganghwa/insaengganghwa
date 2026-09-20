-- 0205 (2026-09-20) 세금 수금 권한 분리 소급 — 종전 '세금 수금 · 분배'(taxDistribute, 비트 128)를 받았던 부길드장에게
-- 새 '세금 수금'(taxCollect, 비트 512)을 함께 켜 준다. 배포 직후에도 하던 수금을 그대로 할 수 있게(사용자 확정 2-3 가).
-- 길드장은 항상 전권이라 대상이 아니다. 여러 번 돌려도 결과가 같다(이미 켜진 행은 건너뜀).
-- 적용 순서: 배포 직전에 한 번, 배포가 끝난 뒤 한 번 더 — 그 사이 옛 코드로 권한을 다시 저장한 부길드장은 새 비트가 지워질 수 있다.
update guild_members
   set permissions = permissions | 512
 where role = 'vice'
   and (permissions & 128) <> 0
   and (permissions & 512) = 0;
