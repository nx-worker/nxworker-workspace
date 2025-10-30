/**
 * End-to-end integration test demonstrating harness utilities usage
 *
 * This test shows how to use all the harness utilities together in a real scenario.
 */

import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import {
  startRegistry,
  stopRegistry,
  createWorkspace,
  addSourceFile,
  cleanupWorkspace,
  getProjectImportAlias,
} from '@internal/e2e-util';

describe('Harness Utilities End-to-End', () => {
  let workspacePath: string;

  afterAll(async () => {
    // Clean up workspace after test
    if (workspacePath) {
      await cleanupWorkspace({ workspacePath });
    }
    // Stop registry
    stopRegistry();
  });

  it('should create workspace, install plugin, and run generator', async () => {
    // 1. Start the local registry (reuses existing instance if already running)
    const registry = await startRegistry({ portPreferred: 4873 });
    console.log(`Registry running on ${registry.url}`);

    // 2. Create a test workspace with 2 libraries
    const workspace = await createWorkspace({
      libs: 2,
      includeApp: false,
      baseDir: join(process.cwd(), 'tmp', 'e2e-workflow-test'),
    });
    workspacePath = workspace.path;
    console.log(`Workspace created at ${workspace.path}`);
    console.log(`Libraries: ${workspace.libs.join(', ')}`);

    // 3. Install the plugin from the local registry
    console.log('Installing @nxworker/workspace@e2e...');
    execSync('npm install @nxworker/workspace@e2e --prefer-offline', {
      cwd: workspace.path,
      stdio: 'inherit',
      env: process.env,
    });

    // 4. Add a source file to the first library
    await addSourceFile({
      workspacePath: workspace.path,
      project: workspace.libs[0],
      relativePath: 'src/lib/utils.ts',
      contents: 'export function util() { return "hello from harness"; }',
    });

    // 5. Export the util from the library's index
    const indexPath = join(
      workspace.path,
      workspace.libs[0],
      'src',
      'index.ts',
    );
    writeFileSync(indexPath, "export * from './lib/utils';\n");

    // 6. Get the import alias for the first library
    const lib1Alias = getProjectImportAlias(workspace.path, workspace.libs[0]);
    console.log(`Library 1 import alias: ${lib1Alias}`);

    // 7. Create a consumer file in the second library
    await addSourceFile({
      workspacePath: workspace.path,
      project: workspace.libs[1],
      relativePath: 'src/lib/consumer.ts',
      contents: `import { util } from '${lib1Alias}';\nexport const result = util();`,
    });

    // 8. Run the move-file generator to move utils.ts to the second library
    console.log('Running move-file generator...');
    execSync(
      `npx nx generate @nxworker/workspace:move-file ${workspace.libs[0]}/src/lib/utils.ts --project ${workspace.libs[1]} --no-interactive`,
      {
        cwd: workspace.path,
        stdio: 'inherit',
      },
    );

    // 9. Verify the move was successful
    const lib2Alias = getProjectImportAlias(workspace.path, workspace.libs[1]);
    console.log(`Library 2 import alias: ${lib2Alias}`);

    console.log('✅ Harness utilities workflow completed successfully!');
  }, 300000); // 5 minutes timeout for full workflow
});
