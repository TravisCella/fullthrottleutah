// lib/deposit.js
// Single source of truth for package-specific security deposit amounts.
// Spark Duo → $1,000 · GTX Limited Duo → $2,000

export const DEPOSIT_SPARK = 1000;
export const DEPOSIT_GTX   = 2000;

export function getDepositAmount(packageName) {
  if (packageName?.includes('GTX')) return DEPOSIT_GTX;
  return DEPOSIT_SPARK;
}
