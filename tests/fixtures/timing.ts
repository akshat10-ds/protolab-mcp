/**
 * Timing utilities for integration benchmarks.
 * Uses performance.now() for sub-ms resolution.
 */

export interface TimingResult {
  durationMs: number;
  responseSizeChars: number;
}

/** Run a function once and measure duration + response size */
export async function measureTime(
  fn: () => Promise<unknown>,
): Promise<TimingResult & { result: unknown }> {
  const start = performance.now();
  const result = await fn();
  const durationMs = performance.now() - start;
  const json = JSON.stringify(result);
  return { durationMs, responseSizeChars: json.length, result };
}

export interface BenchmarkStats {
  iterations: number;
  min: number;
  max: number;
  mean: number;
  p50: number;
  p95: number;
  p99: number;
}

/** Run a function N times with warmup, return percentile stats */
export async function runBenchmark(
  fn: () => Promise<unknown>,
  iterations: number = 100,
): Promise<BenchmarkStats> {
  const times: number[] = [];

  // Warm up (3 iterations)
  for (let i = 0; i < 3; i++) await fn();

  // Measured iterations
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    times.push(performance.now() - start);
  }

  times.sort((a, b) => a - b);

  return {
    iterations,
    min: round(times[0]),
    max: round(times[times.length - 1]),
    mean: round(times.reduce((s, t) => s + t, 0) / times.length),
    p50: round(times[Math.floor(times.length * 0.5)]),
    p95: round(times[Math.floor(times.length * 0.95)]),
    p99: round(times[Math.floor(times.length * 0.99)]),
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
