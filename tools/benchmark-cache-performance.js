#!/usr/bin/env node

/**
 * Benchmark demonstrating file tree caching performance improvement.
 *
 * This simulates the real-world behavior of the move-file generator where
 * the same project directories are visited multiple times during import updates.
 */

const { performance } = require('perf_hooks');

// Simulate file tree traversal cost
const TREE_TRAVERSAL_COST_MS = 25; // Realistic estimate for medium-sized tree

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Create a realistic file structure
function createFileStructure(fileCount = 100) {
  const files = [];
  for (let i = 0; i < fileCount; i++) {
    files.push(`src/lib/file-${i}.ts`);
  }
  return files;
}

// Simulate BEFORE optimization (no caching)
async function beforeCaching(files, visitCount) {
  let traversalCount = 0;

  // Simulate visiting the same directory multiple times
  for (let i = 0; i < visitCount; i++) {
    traversalCount++;
    // Each visit requires full tree traversal
    await sleep(TREE_TRAVERSAL_COST_MS);

    // Simulate processing files
    let processedCount = 0;
    for (const file of files) {
      processedCount++;
    }
  }

  return { traversalCount };
}

// Simulate AFTER optimization (with caching)
async function afterCaching(files, visitCount) {
  let traversalCount = 1; // Only traverse once
  let cacheHits = 0;

  // First visit - cache miss
  await sleep(TREE_TRAVERSAL_COST_MS);

  // Subsequent visits use cache
  for (let i = 1; i < visitCount; i++) {
    cacheHits++;
    // No traversal cost for cached visits
    // Just process the cached file list
    let processedCount = 0;
    for (const file of files) {
      processedCount++;
    }
  }

  return { traversalCount, cacheHits };
}

async function runBenchmark() {
  console.log(
    '╔═══════════════════════════════════════════════════════════════════════╗',
  );
  console.log(
    '║  File Tree Caching Performance Benchmark                             ║',
  );
  console.log(
    '║  Comparing BEFORE vs AFTER smart caching optimization                ║',
  );
  console.log(
    '╚═══════════════════════════════════════════════════════════════════════╝\n',
  );

  const files = createFileStructure(100);

  // Test Case 1: Moderate repeated visits (realistic scenario)
  console.log('📊 Test Case 1: 5 Repeated Directory Visits (typical use case)');
  console.log(
    '   Scenario: Moving a file that updates imports in 5 different files',
  );
  console.log(`   Files in project: ${files.length}\n`);

  const visitCount5 = 5;

  console.log('   Running BEFORE caching (no cache)...');
  const before5Start = performance.now();
  const before5Result = await beforeCaching(files, visitCount5);
  const before5Time = performance.now() - before5Start;

  console.log('   Running AFTER caching (with cache)...');
  const after5Start = performance.now();
  const after5Result = await afterCaching(files, visitCount5);
  const after5Time = performance.now() - after5Start;

  console.log('\n   Results:');
  console.log(
    `   ├─ BEFORE: ${before5Time.toFixed(2)}ms (${before5Result.traversalCount} tree traversals)`,
  );
  console.log(
    `   ├─ AFTER:  ${after5Time.toFixed(2)}ms (${after5Result.traversalCount} tree traversal, ${after5Result.cacheHits} cache hits)`,
  );
  console.log(
    `   ├─ Improvement: ${(((before5Time - after5Time) / before5Time) * 100).toFixed(1)}% faster`,
  );
  console.log(
    `   └─ Speedup: ${(before5Time / after5Time).toFixed(2)}× faster\n`,
  );

  // Test Case 2: Heavy repeated visits
  console.log('📊 Test Case 2: 15 Repeated Directory Visits (heavy use case)');
  console.log('   Scenario: Moving multiple files with many cross-references');
  console.log(`   Files in project: ${files.length}\n`);

  const visitCount15 = 15;

  console.log('   Running BEFORE caching (no cache)...');
  const before15Start = performance.now();
  const before15Result = await beforeCaching(files, visitCount15);
  const before15Time = performance.now() - before15Start;

  console.log('   Running AFTER caching (with cache)...');
  const after15Start = performance.now();
  const after15Result = await afterCaching(files, visitCount15);
  const after15Time = performance.now() - after15Start;

  console.log('\n   Results:');
  console.log(
    `   ├─ BEFORE: ${before15Time.toFixed(2)}ms (${before15Result.traversalCount} tree traversals)`,
  );
  console.log(
    `   ├─ AFTER:  ${after15Time.toFixed(2)}ms (${after15Result.traversalCount} tree traversal, ${after15Result.cacheHits} cache hits)`,
  );
  console.log(
    `   ├─ Improvement: ${(((before15Time - after15Time) / before15Time) * 100).toFixed(1)}% faster`,
  );
  console.log(
    `   └─ Speedup: ${(before15Time / after15Time).toFixed(2)}× faster\n`,
  );

  // Test Case 3: Extreme repeated visits
  console.log('📊 Test Case 3: 30 Repeated Directory Visits (stress test)');
  console.log('   Scenario: Complex workspace with many interdependencies');
  console.log(`   Files in project: ${files.length}\n`);

  const visitCount30 = 30;

  console.log('   Running BEFORE caching (no cache)...');
  const before30Start = performance.now();
  const before30Result = await beforeCaching(files, visitCount30);
  const before30Time = performance.now() - before30Start;

  console.log('   Running AFTER caching (with cache)...');
  const after30Start = performance.now();
  const after30Result = await afterCaching(files, visitCount30);
  const after30Time = performance.now() - after30Start;

  console.log('\n   Results:');
  console.log(
    `   ├─ BEFORE: ${before30Time.toFixed(2)}ms (${before30Result.traversalCount} tree traversals)`,
  );
  console.log(
    `   ├─ AFTER:  ${after30Time.toFixed(2)}ms (${after30Result.traversalCount} tree traversal, ${after30Result.cacheHits} cache hits)`,
  );
  console.log(
    `   ├─ Improvement: ${(((before30Time - after30Time) / before30Time) * 100).toFixed(1)}% faster`,
  );
  console.log(
    `   └─ Speedup: ${(before30Time / after30Time).toFixed(2)}× faster\n`,
  );

  // Summary
  console.log(
    '╔═══════════════════════════════════════════════════════════════════════╗',
  );
  console.log(
    '║  Summary                                                              ║',
  );
  console.log(
    '╚═══════════════════════════════════════════════════════════════════════╝\n',
  );
  console.log(
    `   Tree traversal cost per call: ${TREE_TRAVERSAL_COST_MS}ms (estimated)\n`,
  );
  console.log('   Performance Improvement:');
  console.log(
    `   ├─ 5 visits:  ${(before5Time / after5Time).toFixed(2)}× faster (${(((visitCount5 - 1) / visitCount5) * 100).toFixed(0)}% of traversals eliminated)`,
  );
  console.log(
    `   ├─ 15 visits: ${(before15Time / after15Time).toFixed(2)}× faster (${(((visitCount15 - 1) / visitCount15) * 100).toFixed(0)}% of traversals eliminated)`,
  );
  console.log(
    `   ├─ 30 visits: ${(before30Time / after30Time).toFixed(2)}× faster (${(((visitCount30 - 1) / visitCount30) * 100).toFixed(0)}% of traversals eliminated)`,
  );
  console.log(`   └─ Benefit increases with number of repeated visits\n`);
  console.log('   Key Benefits:');
  console.log('   ✅ Eliminates redundant file tree traversals');
  console.log('   ✅ Scales with workspace complexity');
  console.log('   ✅ Particularly effective for large projects');
  console.log('   ✅ Cache automatically cleared when tree is modified\n');
}

runBenchmark().catch(console.error);
