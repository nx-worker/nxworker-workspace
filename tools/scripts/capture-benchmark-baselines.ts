#!/usr/bin/env node

/**
 * Captures benchmark baseline results from test output.
 * 
 * This script runs the benchmark tests, parses the console output to extract
 * performance metrics, and stores them in a baseline file for regression detection.
 * 
 * Usage:
 *   npx tsx tools/scripts/capture-benchmark-baselines.ts
 * 
 * The baseline file is stored at:
 *   packages/workspace/src/generators/move-file/benchmarks/baselines.json
 */

import { execSync } from 'child_process';
import { writeFileSync } from 'fs';
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

function captureBaselines(): void {
  console.log('🏃 Running benchmark tests...');
  
  let output: string;
  try {
    // Run benchmarks and capture output
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
      process.exit(1);
    }
  }
  
  console.log('📊 Parsing benchmark results...');
  const benchmarks = parseBenchmarkOutput(output);
  
  if (benchmarks.length === 0) {
    console.error('❌ No benchmark results found in output');
    process.exit(1);
  }
  
  const baseline: BaselineData = {
    capturedAt: new Date().toISOString(),
    nodeVersion: process.version,
    platform: `${process.platform}-${process.arch}`,
    benchmarks,
  };
  
  // Write baseline file
  const baselineFile = join(
    __dirname,
    '../../packages/workspace/src/generators/move-file/benchmarks/baselines.json'
  );
  
  writeFileSync(baselineFile, JSON.stringify(baseline, null, 2) + '\n');
  
  console.log(`✅ Captured ${benchmarks.length} benchmark baselines`);
  console.log(`📝 Written to: ${baselineFile}`);
  console.log('\nBaseline summary:');
  
  benchmarks.forEach((b) => {
    console.log(`  - ${b.name}: ${b.averageMs.toFixed(4)}${b.unit}`);
  });
}

// Run if executed directly
if (require.main === module) {
  captureBaselines();
}

export { captureBaselines, parseBenchmarkOutput };
