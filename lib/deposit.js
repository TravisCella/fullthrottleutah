// lib/deposit.js
// Single source of truth for package-specific security deposit amounts.
// The authoritative value is the `deposit` field on each PACKAGES entry
// (lib/pricing.js). Name heuristics remain only as a fallback for legacy or
// expanded package names that don't exactly match a current PACKAGES entry.
//   Sea-Doo Spark Trixx (3UP) → $750 · Spark Duo → $1,000 · GTX Limited Duo → $2,000

import { getPackage } from './pricing.js';

export const DEPOSIT_TRIXX = 750;
export const DEPOSIT_SPARK = 1000;
export const DEPOSIT_GTX = 2000;

export function getDepositAmount(packageName) {
  const pkg = getPackage(packageName);
  if (pkg && typeof pkg.deposit === 'number') return pkg.deposit;

  // Fallbacks for names that don't exactly match a current package.
  if (packageName?.includes('GTX')) return DEPOSIT_GTX;
  if (packageName?.includes('Trixx')) return DEPOSIT_TRIXX;
  return DEPOSIT_SPARK;
}
