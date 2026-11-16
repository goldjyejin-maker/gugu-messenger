export const uid = () => crypto.randomUUID();
export const fmtTime = (t: number) =>
  new Date(t).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: true });
export const fmtDay = (t: number) =>
  new Date(t).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
export const sameDay = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString();
export const fmtSize = (n: number) =>
  n < 1024 ? `${n}B` : n < 1048576 ? `${(n / 1024).toFixed(1)}KB` : `${(n / 1048576).toFixed(1)}MB`;
export const MAX_FILE = 25 * 1024 * 1024; // 무료 저장소 보호용 25MB 제한

/** @이름 멘션에 해당하는 사용자 id 추출 (긴 이름 우선 매칭) */
export function extractMentions(text: string, users: { id: string; name: string }[]): string[] {
  const sorted = [...users].sort((a, b) => b.name.length - a.name.length);
  return sorted.filter(u => text.includes('@' + u.name)).map(u => u.id);
}
