import { AdminMailClient } from './AdminMailClient';

/** 어드민 우편 발송 — 단건 + broadcast. 진입 가드는 (admin)/layout.tsx 일원화. */
export default function AdminMailPage() {
  return <AdminMailClient />;
}
