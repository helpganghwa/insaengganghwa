// 길드 에러 코드 → 사용자 메시지(클라이언트). 서버 액션의 { code }와 1:1.
const MAP: Record<string, string> = {
  ALREADY_IN_GUILD: '이미 길드에 소속되어 있습니다.',
  NOT_IN_GUILD: '길드에 소속되어 있지 않습니다.',
  NAME_INVALID: '길드 이름은 2~12자여야 합니다.',
  NAME_TAKEN: '이미 사용 중인 길드 이름입니다.',
  INSUFFICIENT_DIAMOND: '다이아가 부족합니다.',
  GUILD_NOT_FOUND: '길드를 찾을 수 없습니다.',
  GUILD_FULL: '길드 정원이 가득 찼습니다.',
  REJOIN_LOCKED: '탈퇴 후 24시간이 지나야 가입할 수 있습니다.',
  NOT_LEADER: '길드장만 할 수 있습니다.',
  LEADER_MUST_TRANSFER: '길드장은 위임하거나 해산해야 탈퇴할 수 있습니다.',
  DONATION_CAP_REACHED: '오늘 기부를 모두 했습니다.',
  TARGET_NOT_IN_GUILD: '대상이 같은 길드원이 아닙니다.',
  INVALID_TARGET: '대상이 올바르지 않습니다.',
  ZONE_NOT_FOUND: '구역을 찾을 수 없습니다.',
  NOT_LORD: '해당 구역의 영주가 아닙니다.',
  COLLECT_COOLDOWN: '아직 수금 쿨다운입니다.',
  NOTHING_TO_COLLECT: '수금할 다이아가 없습니다.',
  NOTHING_TO_DISTRIBUTE: '분배할 다이아가 없습니다.',
  UNAUTHENTICATED: '로그인이 필요합니다.',
  UNKNOWN: '오류가 발생했습니다.',
};

export function guildErrMsg(code: string): string {
  return MAP[code] ?? MAP.UNKNOWN!;
}
