import type { Vehicle } from './types';

export interface ValueEstimate {
  available: boolean;
  low?: number;
  mid?: number;
  high?: number;
  currency: 'AED';
  method: string;
  basis: string[];
  caveats: string[];
  comparables: 'unknown';
}

/**
 * Illustrative depreciation model - NOT market data.
 * It exists so the product surface (labelled "Estimated") can be designed and tested. It must be
 * replaced by a real market-data source (listings / dealer / auction data) before any user relies on it.
 */
export function estimateValue(v: Vehicle): ValueEstimate {
  const base = {
    currency: 'AED' as const,
    comparables: 'unknown' as const,
    caveats: [
      'Illustrative model only - not derived from live UAE market data.',
      'Real values depend on specification, condition, service history, colour and current demand.',
      'Comparable vehicles are unknown until a market-data source is connected.',
    ],
  };
  if (!v.originalPrice) {
    return {
      ...base,
      available: false,
      method: 'Requires the original purchase price',
      basis: ['Add the original purchase price to the vehicle to see an illustrative estimate.'],
    };
  }
  const age = Math.max(0, new Date().getFullYear() - v.year);
  const ageFactor = Math.pow(0.86, age);
  const expectedKm = Math.max(1, age) * 15000;
  const kmFactor = Math.min(1.08, Math.max(0.85, 1 - ((v.mileage - expectedKm) / 100000) * 0.5));
  const mid = Math.round((v.originalPrice * ageFactor * kmFactor) / 1000) * 1000;
  return {
    ...base,
    available: true,
    mid,
    low: Math.round((mid * 0.92) / 1000) * 1000,
    high: Math.round((mid * 1.08) / 1000) * 1000,
    method: 'Illustrative depreciation model (age and mileage vs. an expected 15,000 km/year)',
    basis: [
      `Original price AED ${v.originalPrice.toLocaleString('en-US')} (user-provided)`,
      `${age} year${age === 1 ? '' : 's'} old`,
      `${v.mileage.toLocaleString('en-US')} km vs. ~${expectedKm.toLocaleString('en-US')} km expected`,
    ],
  };
}
