# Tinybench lifecycle

_Initial research by Claude Code_

Based on my research of the [tinybench](https://www.npmjs.com/package/tinybench) implementation (`v5.1.0`) and [documentation](https://tinylibs.github.io/tinybench/), here's a comprehensive overview of all supported hooks and their execution lifecycle:

## Supported hooks

### Bench-level hooks ([BenchOptions](https://tinylibs.github.io/tinybench/interfaces/BenchOptions.html))

These hooks apply to the entire benchmark suite and receive the [Task](https://tinylibs.github.io/tinybench/classes/Task.html) instance:

- [setup](https://tinylibs.github.io/tinybench/interfaces/BenchOptions.html#setup): Function to run before each benchmark task (cycle) begins
  - Signature: `(task?: Task, mode?: 'run' | 'warmup') => Promise<void> | void`
- [teardown](https://tinylibs.github.io/tinybench/interfaces/BenchOptions.html#teardown): Function to run after each benchmark task (cycle) completes
  - Signature: `(task?: Task, mode?: 'run' | 'warmup') => Promise<void> | void`

### Task-level hooks ([FnOptions](https://tinylibs.github.io/tinybench/interfaces/FnOptions.html))

These hooks are specific to individual tasks and have `this` bound to the [Task](https://tinylibs.github.io/tinybench/classes/Task.html) instance:

- [beforeAll](https://tinylibs.github.io/tinybench/interfaces/FnOptions.html#beforeall): Runs before iterations of this task begin
  - Signature: `(this: Task, mode?: 'run' | 'warmup') => Promise<void> | void`
- [beforeEach](https://tinylibs.github.io/tinybench/interfaces/FnOptions.html#beforeeach): Runs before each iteration of this task
  - Signature: `(this: Task, mode?: 'run' | 'warmup') => Promise<void> | void`
- [afterEach](https://tinylibs.github.io/tinybench/interfaces/FnOptions.html#aftereach): Runs after each iteration of this task
  - Signature: `(this: Task, mode?: 'run' | 'warmup') => Promise<void> | void`
- [afterAll](https://tinylibs.github.io/tinybench/interfaces/FnOptions.html#afterall): Runs after all iterations of this task end
  - Signature: `(this: Task, mode?: 'run' | 'warmup') => Promise<void> | void`

## Lifecycle execution order

[tinybench](https://www.npmjs.com/package/tinybench) runs benchmarks in two phases (if `warmup` is enabled):

1. Warmup Phase (mode = `'warmup'`)

```
setup(task, 'warmup')
  ├─ beforeAll('warmup')
  |     ├─ beforeEach('warmup') ← iteration 1
  |     ├─ [task execution]
  |     ├─ afterEach('warmup')
  |     ├─ beforeEach('warmup') ← iteration 2
  |     ├─ [task execution]
  |     ├─ afterEach('warmup')
  |     └─ ... (continues for `warmupIterations` or `warmupTime`)
  └─ afterAll('warmup')
teardown(task, 'warmup')
```

2. Run Phase (mode = `'run'`)

```
setup(task, 'run')
  ├─ beforeAll('run')
  |     ├─ beforeEach('run') ← iteration 1
  |     ├─ [task execution]
  |     ├─ afterEach('run')
  |     ├─ beforeEach('run') ← iteration 2
  |     ├─ [task execution]
  |     ├─ afterEach('run')
  |     └─ ... (continues for iterations or time)
  └─ afterAll('run')
teardown(task, 'run')
```

## Key lifecycle details

In terms of [Bench](https://tinylibs.github.io/tinybench/classes/Bench.html):

- Each [Task](https://tinylibs.github.io/tinybench/classes/Task.html) in the [Bench](https://tinylibs.github.io/tinybench/classes/Bench.html) goes through the complete lifecycle independently
- [setup](https://tinylibs.github.io/tinybench/interfaces/BenchOptions.html#setup)/[teardown](https://tinylibs.github.io/tinybench/interfaces/BenchOptions.html#teardown) are called once per [Task](https://tinylibs.github.io/tinybench/classes/Task.html) per phase (warmup + run)

In terms of [Task](https://tinylibs.github.io/tinybench/classes/Task.html)/_cycle_:

- A _cycle_ represents one complete run of a [Task](https://tinylibs.github.io/tinybench/classes/Task.html) (including all iterations)
- [beforeAll](https://tinylibs.github.io/tinybench/interfaces/FnOptions.html#beforeall)/[afterAll](https://tinylibs.github.io/tinybench/interfaces/FnOptions.html#afterall) execute once per cycle (once for warmup, once for run)
- Each cycle event is dispatched after all iterations complete

In terms of _iterations_:

- [beforeEach](https://tinylibs.github.io/tinybench/interfaces/FnOptions.html#beforeeach)/[afterEach](https://tinylibs.github.io/tinybench/interfaces/FnOptions.html#aftereach) run for every single iteration
- Number of iterations determined by [iterations](https://tinylibs.github.io/tinybench/interfaces/BenchOptions.html#iterations) option (default: `64`) or [time](https://tinylibs.github.io/tinybench/interfaces/BenchOptions.html#time) option (default: `1000ms`)

In terms of _warmup iterations_:

- Warmup phase runs first (default: enabled)
- Uses [warmupIterations](https://tinylibs.github.io/tinybench/interfaces/BenchOptions.html#warmupiterations) (default: `16`) or [warmupTime](https://tinylibs.github.io/tinybench/interfaces/BenchOptions.html#warmuptime) (default: `250ms`)
- All hooks receive `'warmup'` as the `mode` parameter during this phase
- Warmup results are not included in benchmark statistics

## Configuration example

```typescript
const bench = new Bench({
  // Bench-level hooks
  setup: async (task, mode) => {
    console.log(`Setting up ${task.name} for ${mode}`);
  },
  teardown: async (task, mode) => {
    console.log(`Tearing down ${task.name} after ${mode}`);
  },
  iterations: 64,
  warmup: true,
  warmupIterations: 16,
});

bench.add(
  'myTask',
  () => {
    // task code
  },
  {
    // Task-level hooks
    beforeAll: async function (mode) {
      console.log(`beforeAll: ${this.name} - ${mode}`);
    },
    beforeEach: async function (mode) {
      // runs before each iteration
    },
    afterEach: async function (mode) {
      // runs after each iteration
    },
    afterAll: async function (mode) {
      console.log(`afterAll: ${this.name} - ${mode}`);
    },
  },
);
```

## Important notes

1. All hooks can be `async` or `sync` - they return `Promise<void> | void`
2. `mode` parameter allows conditional logic based on `warmup` vs. `run` phase
3. Error handling: Errors in hooks are caught and stored in the `task` result
4. Concurrency: When using `concurrency: 'task'`, `beforeEach`/`afterEach` still wrap each concurrent iteration

This hook system provides fine-grained control over benchmark setup, execution, and teardown across both `warmup` and measurement phases.
