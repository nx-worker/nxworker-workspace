#!/usr/bin/env node

/**
 * Test script to demonstrate benchmark regression detection.
 * 
 * This script simulates a performance regression by temporarily modifying
 * a benchmark baseline and showing how the comparison script detects it.
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const baselineFile = join(
  __dirname,
  '../../packages/workspace/src/generators/move-file/benchmarks/baselines.json'
);

console.log('🧪 Testing Benchmark Regression Detection\n');

// Load current baseline
const originalBaseline = readFileSync(baselineFile, 'utf-8');
const baseline = JSON.parse(originalBaseline);

console.log('📊 Current baselines loaded');
console.log(`   Benchmarks: ${baseline.benchmarks.length}`);
console.log(`   Captured: ${baseline.capturedAt}\n`);

// Save original
const backupFile = baselineFile + '.backup';
writeFileSync(backupFile, originalBaseline);

try {
  // Test 1: No regression (should pass)
  console.log('✅ Test 1: No regression (should pass)\n');
  const result1 = execSync(
    'npx tsx tools/scripts/compare-benchmark-results.ts',
    {
      cwd: join(__dirname, '../..'),
      encoding: 'utf-8',
      stdio: 'pipe',
    }
  );
  console.log(result1);
  console.log('✅ Test 1 passed: No regressions detected\n');
  
  // Test 2: Introduce regression
  console.log('❌ Test 2: Introduce regression (should fail)\n');
  
  // Make cache operations 2x slower (exceeds 50% threshold)
  const modifiedBaseline = JSON.parse(originalBaseline);
  modifiedBaseline.benchmarks = modifiedBaseline.benchmarks.map((b: any) => {
    if (b.name.toLowerCase().includes('cache')) {
      return { ...b, averageMs: b.averageMs / 2 };
    }
    return b;
  });
  
  writeFileSync(baselineFile, JSON.stringify(modifiedBaseline, null, 2) + '\n');
  
  try {
    execSync('npx tsx tools/scripts/compare-benchmark-results.ts', {
      cwd: join(__dirname, '../..'),
      encoding: 'utf-8',
      stdio: 'pipe',
    });
    console.log('❌ Test 2 FAILED: Should have detected regression!\n');
    process.exitCode = 1;
  } catch (error: any) {
    // Expected to fail
    const output = error.stdout?.toString() || '';
    console.log(output);
    console.log('✅ Test 2 passed: Regression correctly detected\n');
  }
  
} finally {
  // Restore original baseline
  writeFileSync(baselineFile, originalBaseline);
  console.log('✨ Original baseline restored\n');
}

console.log('🎉 All regression detection tests completed successfully!');
