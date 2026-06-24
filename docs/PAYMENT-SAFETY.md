# 결제 안전망 — 사고 감지 / 대응

결제는 머니 경로다. 실패가 조용하면 "유저는 돈을 냈는데 재화가 없다"가 운영자 모르게 쌓인다. 이 문서는 결제 사고를 **감지**하고 **자동 치유**하며 **운영자에게 알리는** 안전망의 설계와 운영 런북이다.

원칙: 모든 결제 실패는 (1) 영속 기록되고 (2) 위험 등급이면 운영자에게 즉시 알리며 (3) 가능하면 자동 복구된다. `console.error`만 남기는 사일런트 실패는 금지.

---

## 1. 사고 유형 (감지 대상)

| # | 사고 | 머니 영향 | 감지 |
|---|------|----------|------|
| S1 | **결제됨·미지급** — PG는 PAID, 우리 DB는 pending(웹훅 누락) | 致命 | 정합성 cron(A) |
| S2 | **환불 미회수** — PG는 CANCELLED인데 우리는 paid(웹훅 reclaim 실패/누락) | 高 | 인라인 + cron(B) |
| S3 | **금액 불일치** — 위변조 의심 | 中(지급 차단됨) | 인라인 |
| S4 | **웹훅 서명실패 폭증** — 시크릿 회전 사고 등 | 致命 | 인라인 집계 |
| S5 | **고아 pending** — 창 닫혀 클라 verify 없고 웹훅도 지연 | 中(S1 전 단계) | 정합성 cron(A) |
| S6 | **미성년 월 한도 초과** | 高(법규) | 정합성 cron(D) |
| S7 | **중복 지급** — 멱등 깨짐 | 中(UNIQUE+가드로 차단) | 정합성 cron(불변식) |
| S8 | **cron 정지** — 위 검사가 조용히 멈춤 | 中 | heartbeat |

## 2. 3층 방어

```
L1 인라인 알림    결제 코드 경로에서 위험 이벤트 즉시 알림 (S2·S3·S4·예외)
L2 정합성 cron    */10분, 우리 DB ↔ PortOne 대조 + 불변식 (S1·S5·S6 자동복구·포착)
L3 heartbeat/대시 cron 생존 신호(S8) + 어드민 '결제이상' 패널 + 수동 재지급/회수
```

## 3. 알림 채널

알림은 단일 함수 `raisePaymentAlert(kind, opts)`로 일원화. 싱크:

- **영속·중복방지(항상)**: `payment_alerts` 테이블. 같은 `(kind, payment_id)` 미해결 건은 1회만 생성·발송. 어드민 `/admin/alerts`에서 `resolved` 처리.
- **어드민 앱 푸시(주 채널)**: `profiles.is_admin` 계정에 Web Push(category `admin`=토글 무관 항상 발송). 이미 검증된 푸시 인프라 재사용, 운영자 폰으로 즉시.
- **webhook(선택)**: `PAYMENT_ALERT_WEBHOOK_URL`(Discord/Slack) 설정 시 `fetch` POST도 병행.
- 이메일(Resend)은 영수증 발송이 실제 연동되면 추가(현재 미설치).

## 4. 정합성 cron 검사 (`/api/cron/payment-recon`, */10분)

```
A. 고아 pending 복구   status='pending' AND created < now()-15m
                       → getPortonePayment 단건조회
                       → PAID  : completePurchase 재시도(자동 치유), 그래도 실패면 S1 alert
                       → 미결제: 만료 후보(기록만, 삭제 안 함)
B. 환불 미회수 재시도   status='paid' AND paid_at > now()-3d, LIMIT 50 (단기 백스톱)
                       → getPortonePayment → CANCELLED이면 refundPurchase 재시도
                       → 실패 시 S2 alert
                       (웹훅이 취소의 권위·5회 재시도 → recon은 웹훅 전달실패 단기 보완.
                        clawback_done=false는 pending취소 정상값이라 지표 아님)
D. 미성년 한도          본인인증 isAdult=false × monthly_purchase_limits.total_krw>70000
                       → S6 alert (본인인증 연동 후 실효, 그 전엔 무동작)
```

heartbeat(S8): 자기 죽음은 스스로 못 잡으므로 **외부 uptime 모니터(Better Stack 등)**가 cron 엔드포인트/배포를 감시. 본 cron은 실행 요약(JSON)을 반환해 외부 모니터가 파싱 가능.

cron 인증은 기존 패턴(`isCronAuthorized`: CRON_SECRET Bearer 또는 `x-vercel-cron`).

## 5. 머니경로 자동 테스트 (회귀 방지선)

- `completePurchase` 멱등 — 웹훅 5회 재전송에도 1회만 지급
- `AMOUNT_MISMATCH` 거부 — 위변조 금액은 지급 안 함
- refund **0클램프 회수** — 이미 쓴 재화는 음수로 안 떨어짐
- 미성년 월 한도 누적·초과

## 6. 운영 런북

| 사고 | 자동 | 수동(어드민) |
|------|------|-------------|
| S1 | cron 재지급 | 실패 시 "수동 지급" |
| S2 | cron 재회수 | 실패 시 "수동 회수" |
| S3 | 지급 차단 | 반복 유저 결제 차단 검토 |
| S4 | — | 웹훅 시크릿/PG 설정 즉시 점검 |
| S6 | 알림 | 초과분 환불 처리 |

## 7. 환경 변수

- (선택) `PAYMENT_ALERT_WEBHOOK_URL` — Discord/Slack incoming webhook. 미설정이어도 DB 기록은 동작.
- 기존: `CRON_SECRET`, `PORTONE_*`.
