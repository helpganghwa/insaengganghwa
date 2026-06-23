import Link from 'next/link';
import { and, eq } from 'drizzle-orm';

import { getSessionUserId } from '@/lib/auth/session';
import { getActiveServerId } from '@/lib/game/servers';
import { countServers, listServersForUser } from '@/lib/game/server-select';
import { db } from '@/lib/db/client';
import { withTimeout } from '@/lib/db/with-timeout';
import { profiles } from '@/lib/db/schema/profiles';
import { characters } from '@/lib/db/schema/server';
import { signOut } from '@/lib/auth/actions';

import { LocalToggle } from './SettingsControls';
import { NicknameRow } from './NicknameRow';
import { InstallAppButton } from './InstallAppButton';
import { PushSettings } from './PushSettings';

const APP_VERSION = '0.1.0'; // 출시 전 v0

/** 설정 — WIREFRAMES §9. 화면/알림/계정/약관/로그아웃. 영수증 이메일은 의무(토글 불가). */
export default async function SettingsPage() {
  const userId = await getSessionUserId();
  if (!userId) return null;
  const serverId = await getActiveServerId();
  const serverCount = await countServers().catch(() => 1);
  const serverName =
    serverCount > 1
      ? ((await listServersForUser(userId).catch(() => [])).find((sv) => sv.id === serverId)?.name ??
        `${serverId}서버`)
      : '';

  // 콜드 DB 커넥션 hang 시 페이지 무한 대기 방지 — 실패 시 기본값으로 degrade(2026-05-29).
  const pRows = await withTimeout(
    db
      .select({
        nickname: characters.nickname,
        verifiedAt: profiles.identityVerifiedAt,
        diamond: characters.diamond,
        nicknameChangedCount: characters.nicknameChangedCount,
        pushEnhance: profiles.pushEnhance,
        pushRaid: profiles.pushRaid,
        pushProfile: profiles.pushProfile,
        pushReferral: profiles.pushReferral,
        pushEnhanceMode: profiles.pushEnhanceMode,
      })
      .from(profiles)
      .leftJoin(
        characters,
        and(eq(characters.userId, profiles.id), eq(characters.serverId, serverId)),
      )
      .where(eq(profiles.id, userId))
      .limit(1),
    3500,
    'settings.profile',
  ).catch(() => []);
  const [p] = pRows;
  const verified = p?.verifiedAt != null;

  return (
    <div className="space-y-4 px-4 py-4">
      <header className="flex items-baseline gap-2">
      </header>

      <Section title="알림 / 사운드">
        <LocalToggle storageKey="ig:sound" label="효과음" />
        <Divider />
        <PushSettings
          initialEnhance={p?.pushEnhance ?? true}
          initialRaid={p?.pushRaid ?? true}
          initialProfile={p?.pushProfile ?? true}
          initialReferral={p?.pushReferral ?? true}
          initialEnhanceMode={p?.pushEnhanceMode ?? 'instant'}
        />
      </Section>

      {serverCount > 1 && (
        <Section title="서버">
          <Row label="현재 서버">
            <span className="text-sm font-semibold">{serverName}</span>
          </Row>
          <Divider />
          <p className="px-3 py-2 text-[11px] leading-relaxed text-zinc-500">
            서버 변경은 로그아웃 후 로그인 화면에서 선택하세요.
          </p>
        </Section>
      )}

      <Section title="계정">
        <Row label="닉네임">
          <NicknameRow
            current={p?.nickname ?? '플레이어'}
            changedCount={p?.nicknameChangedCount ?? 0}
            diamond={String(p?.diamond ?? 0n)}
          />
        </Row>
        <Divider />
        <Row label="로그인 방식">
          <span className="text-sm text-zinc-500">카카오</span>
        </Row>
        <Divider />
        <Row label="본인인증">
          <span className={`text-sm ${verified ? 'text-emerald-600' : 'text-zinc-500'}`}>
            {verified ? '완료' : '미인증 (결제 시 진행)'}
          </span>
        </Row>
      </Section>

      <Section title="결제 / 영수증">
        <p className="px-3 py-2.5 text-[11px] leading-relaxed text-zinc-500">
          결제 영수증은 전자상거래법에 따라 가입 이메일로 자동 발송되며 끌 수 없습니다. 결제·환불
          문의는 고객센터를 이용해 주세요.
        </p>
      </Section>

      <Section title="약관 / 문의">
        <SettingLink href="/legal/terms" label="이용약관" />
        <Divider />
        <SettingLink href="/legal/privacy" label="개인정보처리방침" />
        <Divider />
        <SettingLink href="/legal/refund" label="환불·청약철회 안내" />
        <Divider />
        <SettingLink href="/legal/youth" label="청소년보호정책" />
        <Divider />
        <SettingLink href="/probability" label="확률 공시" />
        <Divider />
        <DisabledRow label="고객센터 문의" />
      </Section>

      <Section title="앱 정보">
        <Row label="버전">
          <span className="text-sm text-zinc-500">insaengganghwa v{APP_VERSION}</span>
        </Row>
        <Divider />
        <InstallAppButton />
      </Section>

      <form action={signOut}>
        <button
          type="submit"
          className="w-full rounded-xl border border-zinc-200 py-3 text-sm font-medium text-red-600 dark:border-zinc-800"
        >
          로그아웃
        </button>
      </form>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-1.5 px-1 text-xs font-semibold text-zinc-500">{title}</h2>
      <div className="isolate overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        {children}
      </div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-3 py-2.5">
      <span className="text-sm">{label}</span>
      {children}
    </div>
  );
}

function SettingLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="flex items-center justify-between px-3 py-2.5">
      <span className="text-sm">{label}</span>
      <span aria-hidden className="text-zinc-400">
        ›
      </span>
    </Link>
  );
}

function DisabledRow({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-between px-3 py-2.5">
      <span className="text-sm text-zinc-400">{label}</span>
      <span className="text-[11px] text-zinc-400">준비 중</span>
    </div>
  );
}

function Divider() {
  return <div className="mx-3 border-t border-zinc-100 dark:border-zinc-900" />;
}
