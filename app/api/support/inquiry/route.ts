import { getSessionUserId } from '@/lib/auth/session';
import { getActiveServerId } from '@/lib/game/servers';
import { rateLimited } from '@/lib/ratelimit';
import {
  submitInquiry,
  uploadInquiryImages,
  removeInquiryImages,
} from '@/lib/game/support/inquiry';
import { INQUIRY_IDS, BODY_MIN, BODY_MAX, type InquiryType } from '@/lib/game/support/types';

/**
 * 문의 접수(POST, multipart) — 이미지 첨부 지원(0116). 서버 액션 대신 라우트 핸들러:
 * 액션 기본 바디 1MB 제한이 폰 스크린샷을 막음(클라가 압축해도 여유 확보).
 * 업로드 성공 후 insert 실패 시 파일 롤백(고아 방지). 검증: 유형·길이·레이트리밋·
 * 파일 수(≤3)·크기(≤5MB)·매직바이트(JPEG/PNG/WebP만).
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_FILES = 3;
const MAX_FILE_BYTES = 5 * 1024 * 1024;

/** 이미지 매직바이트 — content-type 헤더는 위조 가능하므로 실바이트 검증. */
function sniffImage(buf: Buffer): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47)
    return 'image/png';
  if (
    buf.length >= 12 &&
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  )
    return 'image/webp';
  return null;
}

const err = (message: string, status = 400) =>
  Response.json({ status: 'error', message }, { status });

export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return err('로그인이 필요합니다.', 401);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return err('요청 형식이 올바르지 않습니다.');
  }
  const type = String(form.get('type') ?? '');
  const body = String(form.get('body') ?? '').trim();
  if (!INQUIRY_IDS.has(type)) return err('문의 유형을 선택해 주세요.');
  if (body.length < BODY_MIN) return err(`문의 내용을 ${BODY_MIN}자 이상 적어주세요.`);
  if (body.length > BODY_MAX) return err(`문의 내용은 ${BODY_MAX}자 이내로 적어주세요.`);
  if (await rateLimited(userId, 'support')) return err('잠시 후 다시 시도해 주세요.', 429);

  // 파일 검증 — 수·크기·매직바이트. 클라가 JPEG로 압축해 보내지만 서버는 재검증.
  const files = form.getAll('images').filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length > MAX_FILES) return err(`이미지는 최대 ${MAX_FILES}장까지 첨부할 수 있어요.`);
  const validated: { bytes: Buffer; contentType: string }[] = [];
  for (const f of files) {
    if (f.size > MAX_FILE_BYTES) return err('이미지는 장당 5MB 이하만 첨부할 수 있어요.');
    const bytes = Buffer.from(await f.arrayBuffer());
    const contentType = sniffImage(bytes);
    if (!contentType) return err('이미지 파일(JPEG/PNG/WebP)만 첨부할 수 있어요.');
    validated.push({ bytes, contentType });
  }

  try {
    const imagePaths = validated.length ? await uploadInquiryImages(userId, validated) : [];
    try {
      const serverId = await getActiveServerId();
      await submitInquiry({ userId, serverId, type: type as InquiryType, body, imagePaths });
    } catch (e) {
      await removeInquiryImages(imagePaths); // insert 실패 — 업로드 롤백(고아 방지)
      throw e;
    }
    return Response.json({ status: 'success' });
  } catch (e) {
    console.error('[support] submit failed', (e as Error).message);
    return err('접수 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.', 500);
  }
}
