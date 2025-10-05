const core = require('@actions/core');
const github = require('@actions/github');

async function run() {
  try {
    const state = core.getInput('state', { required: true });
    const checkName = core.getInput('name', { required: true });
    const jobStatus = core.getInput('job-status', { required: false });
    const sha = core.getInput('sha', { required: true });

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
    const runId = github.context.runId;
    const serverUrl = github.context.serverUrl || 'https://github.com';
    const repository =
      github.context.payload.repository?.full_name || `${owner}/${repo}`;

    const workflowRunUrl = `${serverUrl}/${repository}/actions/runs/${runId}`;

    // Map state and jobStatus to Status API values
    let statusState;
    let statusDescription;

    if (state === 'pending') {
      statusState = 'pending';
      statusDescription = 'Check is currently in progress...';
    } else if (state === 'outcome') {
      if (jobStatus === 'success') {
        statusState = 'success';
        statusDescription = '✅ Check completed successfully!';
      } else if (jobStatus === 'cancelled') {
        statusState = 'error';
        statusDescription = '🚫 Check was cancelled.';
      } else if (jobStatus === 'skipped') {
        statusState = 'success';
        statusDescription = '⏭️ Check was skipped.';
      } else {
        statusState = 'failure';
        statusDescription = '❌ Check failed.';
      }
    } else {
      core.setFailed(`Invalid state: ${state}. Must be 'pending' or 'outcome'`);
      return;
    }

    // Use Status API instead of Checks API to avoid app categorization issues
    await octokit.rest.repos.createCommitStatus({
      owner,
      repo,
      sha,
      state: statusState,
      target_url: workflowRunUrl,
      description: statusDescription,
      context: checkName,
    });

    core.info(
      `Created/updated commit status '${checkName}' to ${statusState} on ${sha}`,
    );

    // Fail the action if outcome is failure
    if (state === 'outcome' && jobStatus === 'failure') {
      core.setFailed(statusDescription);
    }
  } catch (error) {
    core.setFailed(error.message);
  }
}
// Only run if not in test environment
if (process.env.NODE_ENV !== 'test') {
  run();
}

module.exports = { run };
