/**
 * PROFILE — createProfileJob 에러 타입. 'use server' 파일(actions.ts)은 async 함수만
 * export 가능하므로 에러 클래스/코드는 별도 모듈로 분리(서버/클라 양쪽 import 가능).
 */
export type CreateProfileJobErrorCode =
  | 'UNAUTHORIZED'
  | 'INVALID_OPTIONS'
  | 'NO_EQUIPMENT'
  | 'INSUFFICIENT_DIAMOND'
  | 'PROFILE_GEN_IN_PROGRESS'
  | 'PROFILE_LIMIT';

export class CreateProfileJobError extends Error {
  constructor(public code: CreateProfileJobErrorCode) {
    super(code);
    this.name = 'CreateProfileJobError';
  }
}
