/// <reference types="jest" />
/* eslint-env jest */
import { Bench, BenchOptions, Fn, FnOptions } from 'tinybench';

/**
 * Internal representation of a registered benchmark
 */
interface RegisteredBenchmark {
  name: string;
  fn: Fn;
  fnOptions: FnOptions;
  benchOptions?: Omit<BenchOptions, 'name'>;
}

/**
 * Represents a describe block with its benchmarks and hooks
 */
interface DescribeBlock {
  name: string;
  benchmarks: RegisteredBenchmark[];
  beforeAllHooks: Array<() => void | Promise<void>>;
  afterAllHooks: Array<() => void | Promise<void>>;
  beforeEachHooks: Array<() => void | Promise<void>>;
  afterEachHooks: Array<() => void | Promise<void>>;
  setupHooks: Array<() => void | Promise<void>>;
  teardownHooks: Array<() => void | Promise<void>>;
  setupSuiteHooks: Array<() => void | Promise<void>>;
  teardownSuiteHooks: Array<() => void | Promise<void>>;
  children: DescribeBlock[];
  parent?: DescribeBlock;
}

/**
 * Global state for tracking current describe block
 */
let currentDescribeBlock: DescribeBlock | null = null;
let rootDescribeBlock: DescribeBlock | null = null;

/**
 * Hook that runs once before all benchmarks in the current describe block
 */
export function beforeAll(fn: () => void | Promise<void>): void {
  if (!currentDescribeBlock) {
    throw new Error('beforeAll() must be called inside a describe() block');
  }
  currentDescribeBlock.beforeAllHooks.push(fn);
}

/**
 * Hook that runs once after all benchmarks in the current describe block
 */
export function afterAll(fn: () => void | Promise<void>): void {
  if (!currentDescribeBlock) {
    throw new Error('afterAll() must be called inside a describe() block');
  }
  currentDescribeBlock.afterAllHooks.push(fn);
}

/**
 * Hook that runs before each benchmark iteration in the current describe block
 */
export function beforeEach(fn: () => void | Promise<void>): void {
  if (!currentDescribeBlock) {
    throw new Error('beforeEach() must be called inside a describe() block');
  }
  currentDescribeBlock.beforeEachHooks.push(fn);
}

/**
 * Hook that runs after each benchmark iteration in the current describe block
 */
export function afterEach(fn: () => void | Promise<void>): void {
  if (!currentDescribeBlock) {
    throw new Error('afterEach() must be called inside a describe() block');
  }
  currentDescribeBlock.afterEachHooks.push(fn);
}

/**
 * Benchmark-level setup hook (runs once before benchmark)
 */
export function setup(fn: () => void | Promise<void>): void {
  if (!currentDescribeBlock) {
    throw new Error('setup() must be called inside a describe() block');
  }
  currentDescribeBlock.setupHooks.push(fn);
}

/**
 * Benchmark-level teardown hook (runs once after benchmark)
 */
export function teardown(fn: () => void | Promise<void>): void {
  if (!currentDescribeBlock) {
    throw new Error('teardown() must be called inside a describe() block');
  }
  currentDescribeBlock.teardownHooks.push(fn);
}

/**
 * Suite-level setup hook (runs once before all benchmarks in the suite)
 */
export function setupSuite(fn: () => void | Promise<void>): void {
  if (!currentDescribeBlock) {
    throw new Error('setupSuite() must be called inside a describe() block');
  }
  currentDescribeBlock.setupSuiteHooks.push(fn);
}

/**
 * Suite-level teardown hook (runs once after all benchmarks in the suite)
 */
export function teardownSuite(fn: () => void | Promise<void>): void {
  if (!currentDescribeBlock) {
    throw new Error('teardownSuite() must be called inside a describe() block');
  }
  currentDescribeBlock.teardownSuiteHooks.push(fn);
}

/**
 * Defines a benchmark task
 *
 * @example
 * ```ts
 * describe('My Suite', () => {
 *   it('should do work', () => {
 *     doWork();
 *   });
 *
 *   it('should do more work', () => {
 *     doMoreWork();
 *   }, { iterations: 100, warmup: true });
 * });
 * ```
 */
export function it(
  name: string,
  fn: Fn,
  options?: Omit<BenchOptions, 'name'>,
): void {
  if (!currentDescribeBlock) {
    throw new Error('it() must be called inside a describe() block');
  }

  // Collect hooks from current block and all ancestors
  const beforeAllHooks: Array<() => void | Promise<void>> = [];
  const afterAllHooks: Array<() => void | Promise<void>> = [];
  const beforeEachHooks: Array<() => void | Promise<void>> = [];
  const afterEachHooks: Array<() => void | Promise<void>> = [];
  const setupHooks: Array<() => void | Promise<void>> = [];
  const teardownHooks: Array<() => void | Promise<void>> = [];

  let block: DescribeBlock | undefined = currentDescribeBlock;
  const blocks: DescribeBlock[] = [];

  // Collect all blocks from current to root
  while (block) {
    blocks.unshift(block);
    block = block.parent;
  }

  // Collect hooks in order from root to current
  for (const b of blocks) {
    beforeAllHooks.push(...b.beforeAllHooks);
    afterAllHooks.push(...b.afterAllHooks);
    beforeEachHooks.push(...b.beforeEachHooks);
    afterEachHooks.push(...b.afterEachHooks);
    setupHooks.push(...b.setupHooks);
    teardownHooks.push(...b.teardownHooks);
  }

  const fnOptions: FnOptions = {};

  if (beforeAllHooks.length > 0) {
    fnOptions.beforeAll = async () => {
      for (const hook of beforeAllHooks) {
        await hook();
      }
    };
  }

  if (afterAllHooks.length > 0) {
    fnOptions.afterAll = async () => {
      for (const hook of afterAllHooks) {
        await hook();
      }
    };
  }

  if (beforeEachHooks.length > 0) {
    fnOptions.beforeEach = async () => {
      for (const hook of beforeEachHooks) {
        await hook();
      }
    };
  }

  if (afterEachHooks.length > 0) {
    fnOptions.afterEach = async () => {
      for (const hook of afterEachHooks) {
        await hook();
      }
    };
  }

  // Add setup/teardown as bench options if present
  let benchOptions = options;
  if (setupHooks.length > 0 || teardownHooks.length > 0) {
    benchOptions = { ...options };
    if (setupHooks.length > 0) {
      benchOptions.setup = async () => {
        for (const hook of setupHooks) {
          await hook();
        }
      };
    }
    if (teardownHooks.length > 0) {
      benchOptions.teardown = async () => {
        for (const hook of teardownHooks) {
          await hook();
        }
      };
    }
  }

  currentDescribeBlock.benchmarks.push({
    name,
    fn,
    fnOptions,
    benchOptions,
  });
}

/**
 * Defines a benchmark suite or group of benchmarks
 *
 * @example
 * ```ts
 * describe('Path Resolution', () => {
 *   describe('buildFileNames', () => {
 *     it('should build file names correctly', () => {
 *       buildFileNames(['index', 'main']);
 *     });
 *   });
 * });
 * ```
 */
export function describe(name: string, callback: () => void): void {
  const block: DescribeBlock = {
    name,
    benchmarks: [],
    beforeAllHooks: [],
    afterAllHooks: [],
    beforeEachHooks: [],
    afterEachHooks: [],
    setupHooks: [],
    teardownHooks: [],
    setupSuiteHooks: [],
    teardownSuiteHooks: [],
    children: [],
    parent: currentDescribeBlock,
  };

  if (currentDescribeBlock) {
    currentDescribeBlock.children.push(block);
  } else {
    // This is the root describe block
    rootDescribeBlock = block;
  }

  const previousBlock = currentDescribeBlock;
  currentDescribeBlock = block;

  // Execute the callback to register benchmarks and nested describes
  callback();

  currentDescribeBlock = previousBlock;

  // If this was the root describe, run the benchmarks
  if (!currentDescribeBlock && rootDescribeBlock === block) {
    runDescribeBlock(block);
    rootDescribeBlock = null;
  }
}

/**
 * Runs a describe block as a Jest describe with its benchmarks and nested describes
 */
function runDescribeBlock(block: DescribeBlock): void {
  (globalThis.describe as any)(block.name, () => {
    let summary: string;

    (globalThis.beforeAll as any)(() => {
      summary = '';
    });

    // Run setupSuite hooks
    for (const hook of block.setupSuiteHooks) {
      (globalThis.beforeAll as any)(hook);
    }

    // Run teardownSuite hooks
    for (const hook of block.teardownSuiteHooks) {
      (globalThis.afterAll as any)(hook);
    }

    (globalThis.afterAll as any)(() => {
      if (summary) {
        console.log(summary);
      }
    });

    // Run benchmarks defined directly in this describe block
    for (const benchmark of block.benchmarks) {
      (globalThis.it as any)(benchmark.name, async () => {
        const benchOptions: BenchOptions = {
          name: block.name,
          ...benchmark.benchOptions,
        };

        const bench = new Bench(benchOptions);
        bench.add(benchmark.name, benchmark.fn, benchmark.fnOptions);

        const tasks = await bench.run();

        for (const task of tasks) {
          const taskResult = task.result;

          if (!taskResult) {
            throw new Error(
              `[${block.name}] ${task.name} did not produce a result`,
            );
          }

          if (taskResult.error) {
            throw new Error(
              `[${block.name}] ${task.name} failed: ${taskResult.error.message}`,
              {
                cause: taskResult.error,
              },
            );
          }

          summary +=
            formatBenchmarkResult(
              `[${block.name}] ${task.name}`,
              taskResult.throughput.mean,
              taskResult.latency.rme,
              taskResult.latency.samples.length,
            ) + '\n';
        }
      });
    }

    // Recursively run nested describe blocks
    for (const child of block.children) {
      runDescribeBlock(child);
    }
  });
}

/**
 * Formats benchmark results in jest-bench format for compatibility with
 * benchmark-action/github-action-benchmark.
 *
 * Output format: "name  ops/sec  time ± percent %  (runs runs sampled)"
 * Example: "Cache hit  623 ops/sec   1.60 ms ±  0.42 %  (90 runs sampled)"
 */
export function formatBenchmarkResult(
  name: string,
  opsPerSec: number,
  rme: number,
  samples: number,
): string {
  // Format ops/sec with commas for thousands and up to 2 decimal places for less than 100 ops/sec
  const formattedOpsPerSec = opsPerSec.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: opsPerSec < 100 ? 2 : 0,
  });
  // Format percentage with 2 decimal places
  const formattedRme = rme.toFixed(2);

  const formattedRunsSampled = `${samples} run${samples === 1 ? '' : 's'} sampled`;

  // Example:
  // RegExp.test x 1,234,567 ops/sec ±1.23% (89 runs sampled)
  return `${name} x ${formattedOpsPerSec} ops/sec ±${formattedRme}% (${formattedRunsSampled})`;
}
