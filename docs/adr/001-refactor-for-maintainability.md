# ADR 001: Refactor move-file Generator for Maintainability

## Status

In Progress (Phase 1 Complete)

**Latest Update**: 2025-10-13

- ✅ Phase 1 completed: Constants and types extracted
- 📋 Phase 2 ready: Cache functions implementation guide created

## Context

The `@nxworker/workspace:move-file` generator has grown to ~2,000 lines in a single file (`generator.ts`) with 54 functions. The main test file (`generator.spec.ts`) has grown to ~2,700 lines. This monolithic structure makes the codebase difficult to:

- **Navigate**: Finding specific functionality requires scrolling through thousands of lines
- **Understand**: Complex interactions between functions are not immediately clear
- **Test**: Tests are scattered across a single large file, making it hard to find tests for specific functions
- **Modify**: Changes to one function risk affecting others due to shared state and unclear dependencies
- **Review**: PRs with changes to the generator file are difficult to review due to file size
- **Optimize**: Performance bottlenecks are hard to identify and benchmark

The codebase has already undergone several performance optimizations (glob batching, AST caching, tree caching, smart file cache, dependency graph cache) that are well-documented but scattered throughout the monolithic file.

### Current Metrics

- **generator.ts**: ~2,000 lines, 54 functions
- **generator.spec.ts**: ~2,700 lines, 141 tests
- **Test coverage**: Good (all tests passing)
- **Performance**: Good (already optimized with multiple caches)
- **Maintainability**: Poor (monolithic structure)

### Issue Requirements

The issue requests:

1. One function per file (or logically grouped functions)
2. One unit test suite per file
3. Optional performance benchmark test per function

## Decision

We will refactor the move-file generator using an **incremental, phased approach** with the following principles:

### Core Principles

1. **One Function Per File** (or small, tightly-related functions)
   - Each file contains a single, focused function or a small group of related helper functions
   - File name matches function name (kebab-case)
   - Maximum ~100 lines per file

2. **One Test Suite Per File**
   - Each function file has a corresponding `.spec.ts` file
   - Test file name matches source file name
   - Tests are focused and fast

3. **Organized by Domain**
   - Functions grouped into directories by domain (cache, path-utils, import-updates, etc.)
   - Direct imports from specific files (no barrel exports)
   - Clear separation of concerns

4. **Performance Benchmarks**
   - Critical path functions have `.bench.ts` files
   - Benchmarks prevent performance regressions
   - Baseline metrics documented

### Directory Structure

```
move-file/
├── cache/              # Cache operations
├── validation/         # Validation and resolution
├── path-utils/         # Path manipulation
├── import-updates/     # Import path updates
├── export-management/  # Export management
├── project-analysis/   # Project utilities
├── core-operations/    # Core move logic
├── constants/          # Shared constants
├── types/              # Shared types
├── security-utils/     # Security (already done)
├── benchmarks/         # Performance tests
└── generator.ts        # Main orchestration (<200 lines)
```

### Implementation Phases

1. **Phase 1**: Extract constants and types (low risk)
2. **Phase 2**: Extract cache functions (low-medium risk)
3. **Phase 3**: Extract path utilities (low-medium risk)
4. **Phase 4**: Extract project analysis (medium risk)
5. **Phase 5**: Extract import updates (medium-high risk)
6. **Phase 6**: Extract export management (medium risk)
7. **Phase 7**: Extract validation (low-medium risk)
8. **Phase 8**: Extract core operations (medium-high risk)
9. **Phase 9**: Split test suites (low risk)
10. **Phase 10**: Add benchmarks (low risk)
11. **Phase 11**: Documentation (low risk)

### Testing Strategy

- **All existing tests must pass** after each phase
- **New unit tests** for extracted functions
- **Integration tests** for module interactions
- **E2E tests** remain unchanged (already comprehensive)
- **Benchmark tests** for critical paths

### Migration Approach

```typescript
// Before (in generator.ts):
function buildTargetPath(...) {
  // 20 lines of implementation
}

// After:
// File: path-utils/build-target-path.ts
export function buildTargetPath(...) {
  // 20 lines of implementation
}

// File: path-utils/build-target-path.spec.ts
describe('buildTargetPath', () => {
  // Unit tests
});

// File: generator.ts
import { buildTargetPath } from './path-utils/build-target-path';
```

## Consequences

### Positive

1. **Improved Discoverability**
   - Easy to find specific functionality by file name
   - IDE autocomplete works better with smaller files
   - New developers can navigate the codebase faster

2. **Better Testability**
   - Each function has focused unit tests
   - Test failures point to specific files
   - Easier to achieve high test coverage
   - Faster test execution (can run specific suites)

3. **Easier Maintenance**
   - Changes isolated to specific files
   - Smaller PRs that are easier to review
   - Less risk of unintended side effects
   - Clear dependencies between modules

4. **Performance Visibility**
   - Benchmark tests establish baselines
   - Performance bottlenecks easier to identify
   - Optimization targets are clear
   - Prevent performance regressions

5. **Code Reusability**
   - Functions can be imported by other generators
   - Clear module boundaries
   - Easier to extract to shared libraries

### Negative

1. **More Files**
   - Directory structure is more complex
   - More files to navigate (but easier to find specific functionality)
   - More test files to maintain

2. **More Imports**
   - More import statements at top of files
   - Risk of circular dependencies (mitigated by clear module boundaries)

3. **Initial Time Investment**
   - ~35-42 hours of refactoring work
   - Need to update all imports
   - Need to write new tests

4. **Potential for Over-Engineering**
   - Risk of splitting too aggressively
   - Need to balance "one function per file" with practicality
   - Some small helper functions may not need separate files

### Neutral

1. **No Functional Changes**
   - All existing functionality preserved
   - No API changes
   - All existing tests continue to pass
   - Performance characteristics unchanged

2. **Backwards Compatible**
   - Public API (`moveFileGenerator`) unchanged
   - Internal refactoring only
   - No breaking changes

## Alternatives Considered

### Alternative 1: Keep Current Structure

**Decision**: Rejected

**Rationale**: Technical debt is already high. The monolithic structure makes it difficult to onboard new developers and maintain the codebase. The issue explicitly requests refactoring.

### Alternative 2: Complete Rewrite

**Decision**: Rejected

**Rationale**: Too risky. The current implementation is well-tested and optimized. A rewrite would take months and introduce risk of bugs. The incremental approach provides the same benefits with lower risk.

### Alternative 3: Extract Only Critical Functions

**Decision**: Rejected

**Rationale**: Partial refactoring would result in an inconsistent structure with some functions in separate files and others in the monolith. Better to be comprehensive for long-term maintainability.

### Alternative 4: Group Multiple Functions Per File

**Decision**: Considered but decided against

**Rationale**: While this would reduce the number of files, it goes against the "one function per file" principle requested in the issue. However, we will allow small, tightly-related helper functions in the same file as the main function.

### Alternative 5: Use Class-Based Structure

**Decision**: Rejected

**Rationale**: The current functional approach works well. Classes would add unnecessary complexity. The existing caching classes (`ASTCache`, `TreeReadCache`) demonstrate that classes are used where appropriate, but most of the logic is better suited to pure functions.

## Implementation Notes

### File Naming Convention

- **Functions**: `kebab-case.ts` (e.g., `build-target-path.ts`)
- **Tests**: `kebab-case.spec.ts` (e.g., `build-target-path.spec.ts`)
- **Benchmarks**: `kebab-case.bench.ts` (e.g., `import-updates.bench.ts`)
- **Types**: `kebab-case.ts` (e.g., `move-context.ts`)

### Module Organization

Each directory will have function files and their corresponding test files:

```
directory/
├── function-1.ts
├── function-1.spec.ts
├── function-2.ts
└── function-2.spec.ts
```

Import directly from specific files:

```typescript
import { function1 } from './directory/function-1';
import { function2 } from './directory/function-2';
```

**Note:** We avoid barrel exports (index.ts files that re-export from multiple modules) within the codebase. Barrel exports are only used for package entrypoints (e.g., `packages/workspace/src/index.ts`). This keeps imports explicit and improves tree-shaking.

### State Management

- Module-level caches will be moved to dedicated cache modules
- Four caches are currently in use:
  - `projectSourceFilesCache` - caches source file lists per project
  - `fileExistenceCache` - caches file existence checks
  - `compilerPathsCache` - caches TypeScript compiler paths
  - `dependencyGraphCache` - caches dependent project lookups (newly added)
- Cache state will be explicit and documented
- Cache lifecycle (clear, update, invalidate) will be clear

### Documentation

- All exported functions will have JSDoc comments
- Each directory will have a README explaining its purpose
- Module-level documentation will describe relationships

### Performance Considerations

- No performance regression allowed
- Benchmark tests will establish baselines
- Critical path functions will be monitored
- Consider lazy loading for less frequently used modules

## Success Criteria

- [x] ✅ All 141+ existing tests pass (Phase 1)
- [x] ✅ 160+ new unit tests added (20 + 37 + 103 from Phases 1-3)
- [x] ✅ Test coverage maintained or improved (Phases 1-3)
- [x] ✅ No performance regression in benchmarks (Phases 1-3)
- [ ] `generator.ts` reduced to <200 lines (currently 1790, was 1921)
- [x] ✅ Constants and types have JSDoc documentation (Phase 1)
- [x] ✅ Constants have unit tests (Phase 1)
- [x] ✅ Cache functions have unit tests (Phase 2)
- [x] ✅ Path utilities have unit tests (Phase 3)
- [ ] Critical path functions have benchmarks
- [ ] Documentation updated (README, ADR, inline docs)

**Phase 1 Status**: ✅ Complete  
**Phase 2 Status**: ✅ Complete  
**Phase 3 Status**: ✅ Complete  
**Phase 4 Status**: ✅ Complete  
**Phase 5 Status**: 📋 Ready to implement (guide created)

## References

- [Issue: Refactor for maintainability](../../../issues)
- [REFACTORING_PLAN.md](../../REFACTORING_PLAN.md)
- ✅ [REFACTORING_PHASE_1_GUIDE.md](../../REFACTORING_PHASE_1_GUIDE.md) - Complete
- ✅ [REFACTORING_PHASE_2_GUIDE.md](../../REFACTORING_PHASE_2_GUIDE.md) - Complete
- ✅ Phase 3: Path Utilities - Complete
- ✅ [REFACTORING_PHASE_4_GUIDE.md](../../REFACTORING_PHASE_4_GUIDE.md) - Complete
- 📋 [REFACTORING_PHASE_5_GUIDE.md](../../REFACTORING_PHASE_5_GUIDE.md) - Ready to implement
- [Existing Performance Documentation](../../PERFORMANCE_OPTIMIZATION_SUGGESTIONS.md)
- [Glob Optimization](../../GLOB_OPTIMIZATION.md)
- [AST Cache Optimization](../../INCREMENTAL_UPDATES_OPTIMIZATION.md)
- [Dependency Graph Cache](../../DEPENDENCY_GRAPH_CACHE_RESULTS.md)

## Timeline

- **Phase 1** (Low risk): ✅ Complete - Constants & Types extracted
- **Phase 2-3** (Low-Med risk): 📋 Ready - Cache & Path utilities (3-7 hours)
- **Phase 4-7** (Medium risk): ⏳ Planned - Analysis, Imports, Exports, Validation (2-3 days)
- **Phase 8** (High risk): ⏳ Planned - Core operations (1-2 days)
- **Phase 9-11** (Low risk): ⏳ Planned - Tests, Benchmarks, Docs (1 day)

**Total**: ~5-8 days of focused work  
**Completed**: Phase 1 (1-2 hours)  
**Remaining**: ~33-40 hours

## Approval

This ADR requires approval from:

- [x] ✅ Project maintainers (Approved for Phase 1)
- [ ] Technical lead (For subsequent phases)
- [ ] Code reviewers (Ongoing)

## Updates

- 2025-10-12: Initial draft created
- 2025-10-13: Phase 1 completed, Phase 2 guide created, status updated
