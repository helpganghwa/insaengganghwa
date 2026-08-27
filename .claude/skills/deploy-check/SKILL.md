---
name: deploy-check
description: 인생강화 배포 확인 절차 — Vercel 브랜치/도메인 매핑, health dpl 확인 URL, DEPLOYMENT_NOT_FOUND 함정, committer 이메일 요건, Supabase prod/staging 분리. master-dev/master push 후나 배포 문제 조사 시 사용.
---

# 배포 확인 절차 (인생강화)

루트 CLAUDE.md §8의 브랜치 규칙(dev → master-dev → master, master 직접 작업 금지, 배포는 사용자 요청 시에만)은 항상 적용된다. 아래는 실제로 배포를 확인·조사할 때만 필요한 세부.

## Vercel 연결
- **Production Branch = `master`** (대시보드 → Settings → Build and Deployment / Environments) → `ganghwa.app` 자동 매핑.
- **배포 확인 주소** — 스테이징 `https://insaengganghwa-git-master-dev-insaengganghwa.vercel.app/api/health`, 프로덕션 `https://ganghwa.app/api/health`. 응답 `dpl` 값이 바뀌면 새 빌드가 반영된 것.
  ⚠ 팀 슬러그는 **`insaengganghwa`**다(`helpganghwas-projects` 아님). 조합을 틀리면 `DEPLOYMENT_NOT_FOUND`가 떠서 **빌드 실패와 구분되지 않는다** — push 성공만 보고 배포됐다고 판단하지 말 것(2026-07-30).
- `master-dev`·기타 = preview(자동 URL). `master-dev` 안정 URL = 스테이징.
- 환경변수: Vercel Production/Preview 분리 입력, 로컬 `.env.local`과 별개.
- **git committer 이메일 필수**: 프로젝트 `gitForkProtection` 활성 상태 — push되는 HEAD 커밋의 committer가 GitHub 사용자와 연결되지 않으면 Vercel이 빌드를 `BLOCKED`(빌드 로그 0줄) 처리한다. repo 소유 GitHub User `helpganghwa`(id 296071338)의 noreply 이메일 `296071338+helpganghwa@users.noreply.github.com` 사용(검증 불필요·항상 연결). 신규 클론 시 `git config user.email` 동일 설정.

## Supabase 환경 분리 (선택)
master/master-dev로 DB도 나눌 수 있는가 — **가능**. 두 방식:
- **옵션 A (권장·저비용)**: Supabase 프로젝트를 **prod/staging 2개**(둘 다 서울 ap-northeast-2) 생성 → Vercel **Production env = prod DB**, **Preview env = staging DB**. master(도메인)=prod, master-dev=staging 자연 분리. 유료 기능 불필요, Drizzle 마이그레이션만 각 DB에 적용.
- **옵션 B**: Supabase **Branching**(Pro 플랜 유료, GitHub 연동 — 브랜치별 DB 자동 생성/마이그레이션). 자동화 강하나 비용·복잡도 ↑.
- **현재 상태**: 단일 Supabase(서울)로 마이그레이션 완료. 결정 전까지 단일 유지(스테이징=프로덕션 데이터 공유 — 실유저 전 허용 가능 리스크).


