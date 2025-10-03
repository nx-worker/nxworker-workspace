const core = require('@actions/core');
const github = require('@actions/github');
const { execSync } = require('node:child_process');

async function run() {
  try {
    // Get inputs
    const state = core.getInput('state', { required: true });
    const context = core.getInput('context', { required: true });
    const jobStatus = core.getInput('job-status', { required: false });
    const workflowFile = core.getInput('workflow-file', { required: true });

    // Only run for workflow_dispatch events
    if (github.context.eventName !== 'workflow_dispatch') {
      core.info('Skipping status check - not a workflow_dispatch event');
      return;
    }

    // Get the current commit SHA
    const sha = execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();

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

    let statusState;
    let description;

    if (state === 'pending') {
      statusState = 'pending';
      description = `${workflowFile} (${eventName}) in progress`;
    } else if (state === 'outcome') {
      if (jobStatus === 'success') {
        statusState = 'success';
        description = `${workflowFile} (${eventName}) succeeded`;
      } else {
        statusState = 'failure';
        description = `${workflowFile} (${eventName}) failed`;
      }
    } else {
      core.setFailed(`Invalid state: ${state}. Must be 'pending' or 'outcome'`);
      return;
    }

    // Post status to GitHub
    await octokit.rest.repos.createCommitStatus({
      owner,
      repo,
      sha,
      state: statusState,
      context,
      description,
      target_url: `https://github.com/${owner}/${repo}/actions/runs/${runId}`,
    });

    core.info(`Posted ${statusState} status for context: ${context}`);

    // Exit with error if job failed (for outcome state)
    if (state === 'outcome' && jobStatus !== 'success') {
      core.setFailed(`Job status is ${jobStatus}`);
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
