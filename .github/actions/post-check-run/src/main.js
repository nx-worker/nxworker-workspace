const core = require('@actions/core');
const github = require('@actions/github');

/**
 * Map of check run IDs stored by check name for this workflow run.
 * This allows us to update the same check run when moving from pending to completed.
 */
const checkRunIds = new Map();

async function run() {
  try {
    // Get inputs
    const state = core.getInput('state', { required: true });
    const checkName = core.getInput('name', { required: true });
    const jobStatus = core.getInput('job-status', { required: false });
    const workflowFile = core.getInput('workflow-file', { required: true });
    const sha = core.getInput('sha', { required: true });

    // Get GitHub token from input, context, or environment (in order of preference)
    let token = core.getInput('token', { required: false });
    if (!token) {
      token = github.context.token;
    }
    if (!token) {
      token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
    }
    if (!token) {
      core.setFailed(
        'GitHub token not found. Please provide it as an action input, or ensure it is available in the context or environment.',
      );
      return;
    }

    const octokit = github.getOctokit(token);
    const { owner, repo } = github.context.repo;
    const eventName = github.context.eventName;
    const runId = github.context.runId;
    const runNumber = github.context.runNumber;
    const workflow = github.context.workflow;
    const job = github.context.job || 'unknown';
    const actor = github.context.actor || 'unknown';
    const ref = github.context.ref || 'unknown';
    const serverUrl = github.context.serverUrl || 'https://github.com';
    const repository =
      github.context.payload.repository?.full_name || `${owner}/${repo}`;

    let status;
    let conclusion;
    let summary;
    let text;

    const workflowRunUrl = `${serverUrl}/${repository}/actions/runs/${runId}`;
    const detailsUrl = workflowRunUrl;

    if (state === 'pending') {
      status = 'in_progress';
      conclusion = null;
      summary = `**Workflow**: ${workflow} (${workflowFile})\n**Job**: ${job}\n**Run**: #${runNumber}\n**Event**: ${eventName}\n**Actor**: ${actor}\n**Ref**: ${ref}\n\nCheck is currently in progress...`;
      text = `### 🔄 Check Run Details\n\n- **Workflow Run**: [#${runNumber}](${workflowRunUrl})\n- **Triggered by**: ${actor}\n- **Event**: ${eventName}\n- **Branch/Tag**: ${ref}\n\nThe check is currently running. Results will be available once the job completes.`;
    } else if (state === 'outcome') {
      status = 'completed';
      if (jobStatus === 'success') {
        conclusion = 'success';
        summary = `**Workflow**: ${workflow} (${workflowFile})\n**Job**: ${job}\n**Run**: #${runNumber}\n**Event**: ${eventName}\n**Actor**: ${actor}\n**Ref**: ${ref}\n\n✅ Check completed successfully!`;
        text = `### ✅ Check Run Details\n\n- **Workflow Run**: [#${runNumber}](${workflowRunUrl})\n- **Job**: ${job}\n- **Triggered by**: ${actor}\n- **Event**: ${eventName}\n- **Branch/Tag**: ${ref}\n\nAll checks passed successfully.`;
      } else if (jobStatus === 'cancelled') {
        conclusion = 'cancelled';
        summary = `**Workflow**: ${workflow} (${workflowFile})\n**Job**: ${job}\n**Run**: #${runNumber}\n**Event**: ${eventName}\n**Actor**: ${actor}\n**Ref**: ${ref}\n\n🚫 Check was cancelled.`;
        text = `### 🚫 Check Run Details\n\n- **Workflow Run**: [#${runNumber}](${workflowRunUrl})\n- **Job**: ${job}\n- **Triggered by**: ${actor}\n- **Event**: ${eventName}\n- **Branch/Tag**: ${ref}\n\nThe check was cancelled before completion.`;
      } else if (jobStatus === 'skipped') {
        conclusion = 'skipped';
        summary = `**Workflow**: ${workflow} (${workflowFile})\n**Job**: ${job}\n**Run**: #${runNumber}\n**Event**: ${eventName}\n**Actor**: ${actor}\n**Ref**: ${ref}\n\n⏭️ Check was skipped.`;
        text = `### ⏭️ Check Run Details\n\n- **Workflow Run**: [#${runNumber}](${workflowRunUrl})\n- **Job**: ${job}\n- **Triggered by**: ${actor}\n- **Event**: ${eventName}\n- **Branch/Tag**: ${ref}\n\nThe check was skipped based on workflow conditions.`;
      } else {
        conclusion = 'failure';
        summary = `**Workflow**: ${workflow} (${workflowFile})\n**Job**: ${job}\n**Run**: #${runNumber}\n**Event**: ${eventName}\n**Actor**: ${actor}\n**Ref**: ${ref}\n\n❌ Check failed.`;
        text = `### ❌ Check Run Details\n\n- **Workflow Run**: [#${runNumber}](${workflowRunUrl})\n- **Job**: ${job}\n- **Triggered by**: ${actor}\n- **Event**: ${eventName}\n- **Branch/Tag**: ${ref}\n\nThe check failed. Please review the [workflow run](${workflowRunUrl}) for details.`;
      }
    } else {
      core.setFailed(`Invalid state: ${state}. Must be 'pending' or 'outcome'`);
      return;
    }

    const targetUrl = detailsUrl;

    // Check if we already created a check run for this check name
    const existingCheckRunId = checkRunIds.get(checkName);

    if (state === 'pending' && !existingCheckRunId) {
      // Create a new check run
      const createResponse = await octokit.rest.checks.create({
        owner,
        repo,
        name: checkName,
        head_sha: sha,
        status: status,
        details_url: targetUrl,
        output: {
          title: checkName,
          summary: summary,
          text: text,
        },
      });

      // Store the check run ID for later updates
      checkRunIds.set(checkName, createResponse.data.id);
      core.info(
        `Created check run ${checkName} with ID ${createResponse.data.id}`,
      );
    } else if (state === 'outcome') {
      // Update existing check run to completed
      if (existingCheckRunId) {
        await octokit.rest.checks.update({
          owner,
          repo,
          check_run_id: existingCheckRunId,
          status: status,
          conclusion: conclusion,
          details_url: targetUrl,
          output: {
            title: checkName,
            summary: summary,
            text: text,
          },
        });

        core.info(
          `Updated check run ${checkName} (ID ${existingCheckRunId}) to ${conclusion}`,
        );
      } else {
        // No existing check run found, create one directly in completed state
        // This can happen if the pending state was skipped or the action is run independently
        await octokit.rest.checks.create({
          owner,
          repo,
          name: checkName,
          head_sha: sha,
          status: status,
          conclusion: conclusion,
          details_url: targetUrl,
          output: {
            title: checkName,
            summary: summary,
            text: text,
          },
        });

        core.info(
          `Created completed check run ${checkName} with ${conclusion}`,
        );
      }
    } else {
      // state is 'pending' but we already have a check run ID
      // This shouldn't normally happen, but we can update it to in_progress
      await octokit.rest.checks.update({
        owner,
        repo,
        check_run_id: existingCheckRunId,
        status: status,
        details_url: targetUrl,
        output: {
          title: checkName,
          summary: summary,
          text: text,
        },
      });

      core.info(
        `Updated existing check run ${checkName} (ID ${existingCheckRunId}) to in_progress`,
      );
    }
  } catch (error) {
    core.setFailed(error.message);
  }
}

// Only run if not in test environment
if (process.env.NODE_ENV !== 'test') {
  run();
}

module.exports = { run, checkRunIds };
