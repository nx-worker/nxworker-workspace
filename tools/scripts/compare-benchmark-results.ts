#!/usr/bin/env node

/**
 * Compares current benchmark results against baselines to detect regressions.
 * 
 * This script runs the benchmark tests, compares the results against stored
 * baselines, and reports any performance regressions that exceed the thresholds.
 * 
 * Exit codes:
 *   0 - No regressions detected
 *   1 - Regressions detected or script error
 * 
 * Usage:
 *   npx tsx tools/scripts/compare-benchmark-results.ts
 * 
 * Regression thresholds:
 *   - Cache operations: 50% slower
 *   - Path operations: 25% slower
 *   - Import/Export operations: 20% slower
 */

import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';

interface BenchmarkResult {
  name: string;
  averageMs: number;
  unit: string;
}

interface BaselineData {
  capturedAt: string;
  nodeVersion: string;
  platform: string;
  benchmarks: BenchmarkResult[];
}

interface RegressionResult {
  name: string;
  baseline: number;
  current: number;
  percentChange: number;
  threshold: number;
  isRegression: boolean;
}

function parseBenchmarkOutput(output: string): BenchmarkResult[] {
  const results: BenchmarkResult[] = [];
  
  // Match patterns like:
  // "Cache hit average: 0.0000ms per lookup"
  // "Source file retrieval average: 0.0001ms"
  const benchmarkPattern = /(.+?) average: ([\d.]+)(ms|s)(?: per [\w\s]+)?/gi;
  
  let match;
  while ((match = benchmarkPattern.exec(output)) !== null) {
    const name = match[1].trim();
    const value = parseFloat(match[2]);
    const unit = match[3];
    
    // Convert to milliseconds if needed
    const averageMs = unit === 's' ? value * 1000 : value;
    
    results.push({
      name,
      averageMs,
      unit: 'ms',
    });
  }
  
  return results;
}

function getRegressionThreshold(benchmarkName: string): number {
  const lowerName = benchmarkName.toLowerCase();
  
  // Cache operations: 50% threshold
  if (lowerName.includes('cache')) {
    return 50;
  }
  
  // Path operations: 25% threshold
  if (lowerName.includes('path') || 
      lowerName.includes('buildfilenames') ||
      lowerName.includes('buildpatterns') ||
      lowerName.includes('getrelativeimportspecifier') ||
      lowerName.includes('toabsoluteworkspacepath') ||
      lowerName.includes('removesourcefileextension')) {
    return 25;
  }
  
  // Import/Export operations: 20% threshold (default)
  return 20;
}

function compareResults(
  baselines: BenchmarkResult[],
  current: BenchmarkResult[]
): RegressionResult[] {
  const results: RegressionResult[] = [];
  
  // Create a map of current results for easy lookup
  const currentMap = new Map(
    current.map((b) => [b.name, b.averageMs])
  );
  
  for (const baseline of baselines) {
    const currentValue = currentMap.get(baseline.name);
    
    if (currentValue === undefined) {
      console.warn(`⚠️  Baseline "${baseline.name}" not found in current results`);
      continue;
    }
    
    const percentChange = ((currentValue - baseline.averageMs) / baseline.averageMs) * 100;
    const threshold = getRegressionThreshold(baseline.name);
    const isRegression = percentChange > threshold;
    
    results.push({
      name: baseline.name,
      baseline: baseline.averageMs,
      current: currentValue,
      percentChange,
      threshold,
      isRegression,
    });
  }
  
  // Check for new benchmarks not in baseline
  for (const curr of current) {
    if (!baselines.find((b) => b.name === curr.name)) {
      console.warn(`⚠️  New benchmark "${curr.name}" not in baseline (skipping comparison)`);
    }
  }
  
  return results;
}

function printResults(results: RegressionResult[]): void {
  console.log('\n📊 Benchmark Comparison Results\n');
  console.log('┌─────────────────────────────────────────────────────────────────────────────┐');
  console.log('│ Benchmark                           Baseline    Current    Change  Threshold │');
  console.log('├─────────────────────────────────────────────────────────────────────────────┤');
  
  for (const result of results) {
    const icon = result.isRegression ? '❌' : '✅';
    const nameDisplay = result.name.substring(0, 33).padEnd(33);
    const baselineDisplay = `${result.baseline.toFixed(4)}ms`.padStart(10);
    const currentDisplay = `${result.current.toFixed(4)}ms`.padStart(10);
    const changeDisplay = `${result.percentChange >= 0 ? '+' : ''}${result.percentChange.toFixed(1)}%`.padStart(7);
    const thresholdDisplay = `${result.threshold}%`.padStart(9);
    
    console.log(
      `│ ${icon} ${nameDisplay} ${baselineDisplay} ${currentDisplay} ${changeDisplay} ${thresholdDisplay} │`
    );
  }
  
  console.log('└─────────────────────────────────────────────────────────────────────────────┘');
}

function compareWithBaseline(): number {
  console.log('📂 Loading baseline data...');
  
  const baselineFile = join(
    __dirname,
    '../../packages/workspace/src/generators/move-file/benchmarks/baselines.json'
  );
  
  let baseline: BaselineData;
  try {
    const content = readFileSync(baselineFile, 'utf-8');
    baseline = JSON.parse(content);
  } catch (error: any) {
    console.error(`❌ Failed to load baseline file: ${error.message}`);
    console.error(`   Expected at: ${baselineFile}`);
    console.error('\n💡 Run this command to create baselines:');
    console.error('   npx tsx tools/scripts/capture-benchmark-baselines.ts\n');
    return 1;
  }
  
  console.log(`   Baseline captured: ${baseline.capturedAt}`);
  console.log(`   Platform: ${baseline.platform}`);
  console.log(`   Node version: ${baseline.nodeVersion}\n`);
  
  console.log('🏃 Running current benchmarks...');
  
  let output: string;
  try {
    output = execSync(
      "npx nx test workspace --testPathPattern='\\.bench\\.spec\\.ts$' --verbose",
      {
        encoding: 'utf-8',
        cwd: join(__dirname, '../..'),
        stdio: 'pipe',
      }
    );
  } catch (error: any) {
    // Tests may fail but we still get output
    output = error.stdout?.toString() || '';
    if (!output) {
      console.error('❌ Failed to run benchmarks:', error.message);
      return 1;
    }
  }
  
  console.log('📊 Parsing current results...');
  const currentResults = parseBenchmarkOutput(output);
  
  if (currentResults.length === 0) {
    console.error('❌ No benchmark results found in output');
    return 1;
  }
  
  console.log(`   Found ${currentResults.length} benchmark results\n`);
  
  const comparisonResults = compareResults(baseline.benchmarks, currentResults);
  printResults(comparisonResults);
  
  const regressions = comparisonResults.filter((r) => r.isRegression);
  
  if (regressions.length > 0) {
    console.log(`\n❌ Performance Regression Detected!\n`);
    console.log(`Found ${regressions.length} benchmark(s) exceeding threshold:\n`);
    
    regressions.forEach((r) => {
      console.log(`  • ${r.name}`);
      console.log(`    Baseline: ${r.baseline.toFixed(4)}ms`);
      console.log(`    Current:  ${r.current.toFixed(4)}ms`);
      console.log(`    Change:   ${r.percentChange >= 0 ? '+' : ''}${r.percentChange.toFixed(1)}% (threshold: ${r.threshold}%)\n`);
    });
    
    console.log('💡 If this regression is intentional, update the baseline:');
    console.log('   npx tsx tools/scripts/capture-benchmark-baselines.ts\n');
    
    return 1;
  }
  
  console.log('\n✅ No performance regressions detected!\n');
  
  // Show improvements if any
  const improvements = comparisonResults.filter((r) => r.percentChange < -5);
  if (improvements.length > 0) {
    console.log('🎉 Performance Improvements:\n');
    improvements.forEach((r) => {
      console.log(`  • ${r.name}: ${Math.abs(r.percentChange).toFixed(1)}% faster`);
    });
    console.log();
  }
  
  return 0;
}

// Run if executed directly
if (require.main === module) {
  const exitCode = compareWithBaseline();
  process.exit(exitCode);
}

export { compareWithBaseline, compareResults, getRegressionThreshold };
