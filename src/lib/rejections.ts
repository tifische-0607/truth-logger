/** Rejection rate in percent of items received; null when nothing was received. */
export function rejectionRate(accepted: number, rejected: number): number | null {
  const total = accepted + rejected;
  return total === 0 ? null : (rejected / total) * 100;
}
