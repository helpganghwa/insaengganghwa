/**
 * 인생강화 Service Worker — PWA Push v1.
 *
 * 역할:
 *  - push 이벤트 수신 → 알림 표시(tag로 그룹화·replace 가능)
 *  - notificationclick → 적절한 라우트로 포커스/오픈
 *
 * 캐싱 전략은 두지 않음(Next.js + Vercel CDN에 위임). 본 SW의 단일 책임은 푸시.
 * 향후 오프라인 셸이 필요해지면 별도 검토.
 */
self.addEventListener('install', () => {
  // 즉시 활성화 — 새 SW 배포 시 기존 탭이 바로 적용.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: '인생강화', body: event.data ? event.data.text() : '알림' };
  }
  const title = data.title || '인생강화';
  const options = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    // tag로 같은 카테고리 알림을 replace — 그룹화 시 최신 메시지만 노출.
    tag: data.tag || 'default',
    // 카테고리별 클릭 시 라우트.
    data: { url: data.url || '/', category: data.category || 'default' },
    renotify: data.renotify === true,
    requireInteraction: false,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    (async () => {
      const clientsArr = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      // 이미 타깃 경로에 있는 탭을 우선 재사용, 없으면 아무 탭이나.
      const target =
        clientsArr.find((c) => {
          try {
            return new URL(c.url).pathname === url;
          } catch {
            return false;
          }
        }) || clientsArr[0];
      if (target) {
        // focus 먼저(항상 안전). navigate()는 미제어(uncontrolled) 클라이언트에서 스펙상
        // reject되고 iOS PWA에서도 불안정 — 예전엔 reject가 focus까지 삼켜 이동 없이 마지막
        // 화면이 그대로 보였다(생성 완료 알림 → 생성화면). 실패 시 앱 내 라우팅으로 폴백.
        try {
          await target.focus();
        } catch {}
        let already = false;
        try {
          already = new URL(target.url).pathname === url;
        } catch {}
        if (already) return;
        if ('navigate' in target) {
          try {
            await target.navigate(url);
            return;
          } catch {}
        }
        // 폴백 — 클라이언트(PushAutoSync)가 수신해 router.push(소프트 내비게이션).
        try {
          target.postMessage({ type: 'push-navigate', url });
        } catch {}
        return;
      }
      // 열린 탭이 없으면 새 창.
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })(),
  );
});
