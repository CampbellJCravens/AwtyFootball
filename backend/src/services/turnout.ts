import { ReliabilityPlayer, RsvpBucket } from './reliability';

// Turnout projection. Every roster player sits in exactly one response bucket
// and contributes an independent Bernoulli show-probability; the sum is a
// Poisson-binomial, which we evaluate exactly rather than approximating.

// Prior strength for empirical-Bayes shrinkage. At n=0 a player's estimate is
// exactly the league base rate for their bucket; it converges on their own rate
// as their sample grows. This is what stops a newcomer who came once from
// reading as "100% reliable".
export const PRIOR_M = 5;

export interface BaseRates {
  yes: number;
  maybe: number;
  no: number;
  silent: number;
}

// Per-bucket (successes, trials) for one player, matching the base-rate buckets.
const bucketCounts = (p: ReliabilityPlayer, bucket: RsvpBucket): { hits: number; n: number } => {
  switch (bucket) {
    case 'yes': return { hits: p.showedWhenCommitted, n: p.committed };
    case 'maybe': return { hits: p.converted, n: p.maybed };
    case 'no': return { hits: p.reversed, n: p.declined };
    case 'silent': return { hits: p.ghost, n: p.silent };
  }
};

export function shrunkProbability(
  player: ReliabilityPlayer | undefined,
  bucket: RsvpBucket,
  base: BaseRates
): { p: number; n: number } {
  const prior = base[bucket];
  if (!player) return { p: prior, n: 0 };
  const { hits, n } = bucketCounts(player, bucket);
  return { p: (hits + PRIOR_M * prior) / (n + PRIOR_M), n };
}

// Exact Poisson-binomial PMF. dist[k] = P(exactly k of them show).
// O(n²) over a few dozen players — microseconds, and it avoids a normal
// approximation that would be poor in exactly the tail we care about.
export function poissonBinomial(ps: number[]): number[] {
  let dist = [1];
  for (const p of ps) {
    const next = new Array<number>(dist.length + 1).fill(0);
    for (let k = 0; k < dist.length; k++) {
      next[k] += dist[k] * (1 - p);
      next[k + 1] += dist[k] * p;
    }
    dist = next;
  }
  return dist;
}

// P(X < threshold)
export function probBelow(dist: number[], threshold: number): number {
  let acc = 0;
  for (let k = 0; k < Math.min(threshold, dist.length); k++) acc += dist[k];
  return acc;
}

// Percentile of an ASCENDING-sorted array, nearest-rank.
export function percentile(sorted: number[], q: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * q)));
  return sorted[idx];
}
