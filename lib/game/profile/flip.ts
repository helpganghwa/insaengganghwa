import 'server-only';

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import sharp from 'sharp';
import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { userProfiles } from '@/lib/db/schema/avatar';
import { parseFaceBox } from '@/components/faceCrop';

import { serviceClient, STORAGE_BUCKET } from './pipeline';

/**
 * 아바타 좌우 반전(2026-08-28) — 화면마다 CSS 반전을 거는 대신 **반전 PNG를 저장해 rotations.south를
 * 교체**한다. 아바타를 읽는 곳이 15곳+(헤더·채팅·랭킹·OG 합성)이라 URL 교체가 유일하게 전부를
 * 한 번에 맞추는 길이다. 원본은 `south_alt`/`face_alt`로 남겨 두 번째 탭부터는 업로드 없이 스왑만.
 * options.faceBox(정규화 cx)는 거울상으로 cx → 1-cx.
 */
export async function flipProfileImage(
  userId: string,
  profileId: string,
  serverId: number,
): Promise<'ok' | 'NOT_FOUND' | 'FAILED'> {
  const [row] = await db
    .select({ rotations: userProfiles.rotations, options: userProfiles.options })
    .from(userProfiles)
    .where(and(eq(userProfiles.id, profileId), eq(userProfiles.userId, userId), eq(userProfiles.serverId, serverId)))
    .limit(1);
  if (!row) return 'NOT_FOUND';
  const rot = { ...(row.rotations as Record<string, string>) };
  const opts = { ...((row.options ?? {}) as Record<string, unknown>) };
  if (!rot.south) return 'FAILED';

  try {
    if (rot.south_alt) {
      [rot.south, rot.south_alt] = [rot.south_alt, rot.south];
      if (rot.face || rot.face_alt) {
        const f = rot.face, fa = rot.face_alt;
        if (fa) rot.face = fa; else delete rot.face;
        if (f) rot.face_alt = f; else delete rot.face_alt;
      }
    } else {
      const supabase = serviceClient();
      const mirrorUpload = async (src: string, name: string): Promise<string> => {
        const buf = src.startsWith('/')
          ? await readFile(path.join(process.cwd(), 'public', src)) // 기본 아바타(상대경로)
          : Buffer.from(await (await fetch(src, { cache: 'no-store' })).arrayBuffer());
        const png = await sharp(buf).flop().png().toBuffer();
        const p = `${userId}/${profileId}/${name}`;
        const up = await supabase.storage
          .from(STORAGE_BUCKET)
          .upload(p, png, { contentType: 'image/png', upsert: true, cacheControl: '604800' });
        if (up.error) throw new Error(up.error.message);
        return supabase.storage.from(STORAGE_BUCKET).getPublicUrl(p).data.publicUrl;
      };
      const south = await mirrorUpload(rot.south, 'south_flip.png');
      rot.south_alt = rot.south;
      rot.south = south;
      if (rot.face) {
        const face = await mirrorUpload(rot.face, 'face_flip.png');
        rot.face_alt = rot.face;
        rot.face = face;
      }
    }
    const fb = parseFaceBox(opts.faceBox);
    if (fb) opts.faceBox = { ...fb, cx: 1 - fb.cx };
    await db
      .update(userProfiles)
      .set({ rotations: rot, options: opts })
      .where(eq(userProfiles.id, profileId));
    return 'ok';
  } catch (e) {
    console.error('[profile.flip]', profileId, e);
    return 'FAILED';
  }
}
