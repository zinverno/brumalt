export function plural(n: number, one: string, few: string, many: string): string {
  const last = Math.abs(n) % 100;
  return last >= 11 && last <= 14 ? many : last % 10 === 1 ? one : last % 10 >= 2 && last % 10 <= 4 ? few : many;
}
export const amount = (n: number, one: string, few: string, many: string): string => `${n} ${plural(n, one, few, many)}`;
