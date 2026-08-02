import { poissonBinomial, probBelow, percentile, shrunkProbability, PRIOR_M } from '../src/services/turnout';

let fail = 0;
const ok = (name: string, cond: boolean, extra = '') => {
  if (!cond) { fail++; console.log('FAIL', name, extra); } else console.log('ok  ', name);
};

// 1. Brute force: enumerate every subset for small n, compare to the DP.
const brute = (ps: number[]) => {
  const n = ps.length;
  const dist = new Array(n + 1).fill(0);
  for (let mask = 0; mask < (1 << n); mask++) {
    let prob = 1, k = 0;
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) { prob *= ps[i]; k++; } else prob *= 1 - ps[i];
    }
    dist[k] += prob;
  }
  return dist;
};
for (const ps of [[0.3], [0.5, 0.9], [0.1, 0.44, 0.77, 0.95], [0.2, 0.2, 0.6, 0.83, 0.5, 0.05]]) {
  const a = poissonBinomial(ps), b = brute(ps);
  const maxDiff = Math.max(...a.map((v, i) => Math.abs(v - b[i])));
  ok(`poissonBinomial n=${ps.length} matches brute force`, maxDiff < 1e-12, `maxDiff=${maxDiff}`);
}

// 2. Distribution sums to 1.
const big = Array.from({ length: 45 }, (_, i) => 0.05 + (i % 19) * 0.05);
const d = poissonBinomial(big);
ok('45-player distribution sums to 1', Math.abs(d.reduce((a, b) => a + b, 0) - 1) < 1e-9);
ok('45-player distribution has n+1 entries', d.length === 46);

// 3. Degenerate cases.
ok('all-certain → mass at n', Math.abs(poissonBinomial([1, 1, 1])[3] - 1) < 1e-12);
ok('all-zero → mass at 0', Math.abs(poissonBinomial([0, 0, 0])[0] - 1) < 1e-12);
ok('empty → [1]', poissonBinomial([]).length === 1);

// 4. probBelow
const d2 = poissonBinomial([0.5, 0.5]); // [0.25, 0.5, 0.25]
ok('probBelow(0) = 0', probBelow(d2, 0) === 0);
ok('probBelow(1) = 0.25', Math.abs(probBelow(d2, 1) - 0.25) < 1e-12);
ok('probBelow(3) = 1', Math.abs(probBelow(d2, 3) - 1) < 1e-12);
ok('probBelow beyond length clamps', Math.abs(probBelow(d2, 99) - 1) < 1e-12);

// 5. percentile on the real 2026 turnout distribution
const real = [14,16,18,18,19,20,20,21,22,22,22,22,23,23,24,24,24,25,25,26,26,26,27,27,28,28,28].sort((a,b)=>a-b);
// `real` is a synthetic stand-in shaped like the 2026 season, not the exact
// rows — assert the nearest-rank contract, not a remembered value.
ok('median = element at floor((n-1)/2)', percentile(real, 0.5) === real[Math.floor((real.length - 1) * 0.5)]);
ok('median lands in the plausible middle', percentile(real, 0.5)! >= 22 && percentile(real, 0.5)! <= 23);
ok('p50 >= p10', percentile(real, 0.5)! >= percentile(real, 0.1)!);
ok('p90 >= p50', percentile(real, 0.9)! >= percentile(real, 0.5)!);
ok('percentile(_,0) = min', percentile(real, 0) === real[0]);
ok('percentile(_,1) = max', percentile(real, 1) === real[real.length - 1]);
ok('p10 ~18', percentile(real, 0.1) === 18, String(percentile(real, 0.1)));
ok('percentile([]) is null', percentile([], 0.5) === null);

// 6. Shrinkage behaviour
const base = { yes: 0.8, maybe: 0.4, no: 0.05, silent: 0.1 };
const mk = (o: any) => ({ showedWhenCommitted: 0, committed: 0, converted: 0, maybed: 0, reversed: 0, declined: 0, ghost: 0, silent: 0, ...o }) as any;
ok('no history → exactly the league prior', shrunkProbability(undefined, 'yes', base).p === 0.8);
ok('zero-n player → exactly the league prior', Math.abs(shrunkProbability(mk({}), 'yes', base).p - 0.8) < 1e-12);
const oneForOne = shrunkProbability(mk({ committed: 1, showedWhenCommitted: 1 }), 'yes', base);
ok('1-for-1 does NOT read 100%', oneForOne.p < 0.9, `p=${oneForOne.p}`);
ok('1-for-1 = (1 + 5*0.8)/(1+5) = 0.8333', Math.abs(oneForOne.p - (1 + PRIOR_M * 0.8) / (1 + PRIOR_M)) < 1e-12);
const heavy = shrunkProbability(mk({ committed: 100, showedWhenCommitted: 20 }), 'yes', base);
ok('large sample converges toward own rate (0.2)', heavy.p < 0.25 && heavy.p > 0.2, `p=${heavy.p}`);
ok('ghost bucket reads the silent counters', shrunkProbability(mk({ silent: 10, ghost: 5 }), 'silent', base).n === 10);

console.log(fail === 0 ? '\nALL PASS' : `\n${fail} FAILURES`);
process.exit(fail === 0 ? 0 : 1);
