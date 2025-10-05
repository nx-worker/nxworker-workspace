const core = require('@actions/core');
const github = require('@actions/github');

/**
 * Map of check run IDs stored by check name for this workflow run.
 * This allows us to update the same check run when moving from pending to completed.
 */
const checkRunIds = new Map();
let identityReported = false;
let cachedIdentity = null;

async function reportAuthenticationIdentity(octokit) {
  if (identityReported) {
    return cachedIdentity;
  }

  identityReported = true;

  try {
    const { data } = await octokit.rest.apps.getAuthenticated();
    const appName = data?.name || data?.slug || 'unknown';
    const appSlug = data?.slug;

    core.info(
      `Using GitHub App token '${appName}' (slug: ${appSlug || 'n/a'}).`,
    );

    if (appSlug && appSlug !== 'github-actions') {
      core.warning(
        `Check runs created with this token will appear under '${appName}' in the Checks UI. Pass the workflow's GITHUB_TOKEN to display them under GitHub Actions instead.`,
      );
    }

    cachedIdentity = {
      source: 'app',
      appName,
      appSlug,
    };

    return cachedIdentity;
  } catch (error) {
    if (error.status === 403 || error.status === 404) {
      try {
        const { data } = await octokit.rest.users.getAuthenticated();
        const login = data?.login || 'unknown';
        const name = data?.name || login;

        core.info(
          `Using user token '${name}' (login: ${login}). Check runs will appear under this user in the Checks UI.`,
        );

        cachedIdentity = {
          source: 'user',
          userLogin: login,
          userName: name,
        };

        return cachedIdentity;
      } catch (userError) {
        core.debug(
          `Unable to resolve token identity via users.getAuthenticated: ${userError.message}`,
        );
      }

      core.info(
        'Using a token that does not identify as a GitHub App or user. Check runs may appear under a fallback identity.',
      );

      cachedIdentity = {
        source: 'unknown',
      };

      return cachedIdentity;
    } else {
      core.debug(
        `Unable to resolve authenticated app identity: ${error.message}`,
      );
    }
  }

  cachedIdentity = {
    source: 'unknown',
  };

  return cachedIdentity;
}

function describeIdentity(identity) {
  if (!identity) {
    return null;
  }

  if (identity.source === 'app' && identity.appSlug) {
    return `GitHub App (${identity.appName || identity.appSlug})`;
  }

  if (identity.source === 'user' && identity.userLogin) {
    return `User token (${identity.userName || identity.userLogin})`;
  }

  if (identity.source === 'unknown') {
    return 'Unknown token identity';
  }

  return null;
}

function buildSummaryHeader(metadata) {
  const identityDescription = describeIdentity(metadata.identity);
  const identityLine = identityDescription
    ? `\n**Token Identity**: ${identityDescription}`
    : '';

  return `**Workflow**: ${metadata.workflow} (${metadata.workflowFile})\n**Job**: ${metadata.job}\n**Run**: #${metadata.runNumber}\n**Event**: ${metadata.eventName}\n**Actor**: ${metadata.actor}\n**Ref**: ${metadata.ref}${identityLine}`;
}

function buildDetailsList(metadata) {
  return `- **Workflow Run**: [#${metadata.runNumber}](${metadata.workflowRunUrl})\n- **Job**: ${metadata.job}\n- **Triggered by**: ${metadata.actor}\n- **Event**: ${metadata.eventName}\n- **Branch/Tag**: ${metadata.ref}`;
}

function buildPendingOutput(metadata) {
  const summary = `${buildSummaryHeader(metadata)}\n\nCheck is currently in progress...`;
  const text = `### 🔄 Check Run Details\n\n${buildDetailsList(metadata)}\n\nThe check is currently running. Results will be available once the job completes.`;

  return {
    status: 'in_progress',
    conclusion: null,
    summary,
    text,
  };
}

function buildOutcomeOutput(jobStatus, metadata) {
  const outcomeConfig = {
    success: {
      conclusion: 'success',
      summarySuffix: '✅ Check completed successfully!',
      textHeader: '### ✅ Check Run Details',
      textMessage: () => 'All checks passed successfully.',
    },
    cancelled: {
      conclusion: 'cancelled',
      summarySuffix: '🚫 Check was cancelled.',
      textHeader: '### 🚫 Check Run Details',
      textMessage: () => 'The check was cancelled before completion.',
    },
    skipped: {
      conclusion: 'skipped',
      summarySuffix: '⏭️ Check was skipped.',
      textHeader: '### ⏭️ Check Run Details',
      textMessage: () => 'The check was skipped based on workflow conditions.',
    },
    failure: {
      conclusion: 'failure',
      summarySuffix: '❌ Check failed.',
      textHeader: '### ❌ Check Run Details',
      textMessage: (meta) =>
        `The check failed. Please review the [workflow run](${meta.workflowRunUrl}) for details.`,
    },
  };

  const config = outcomeConfig[jobStatus] || outcomeConfig.failure;
  const summary = `${buildSummaryHeader(metadata)}\n\n${config.summarySuffix}`;
  const text = `${config.textHeader}\n\n${buildDetailsList(metadata)}\n\n${config.textMessage(metadata)}`;

  return {
    status: 'completed',
    conclusion: config.conclusion,
    summary,
    text,
  };
}

async function run() {
  try {
    const state = core.getInput('state', { required: true });
    const checkName = core.getInput('name', { required: true });
    const jobStatus = core.getInput('job-status', { required: false });
    const workflowFile = core.getInput('workflow-file', { required: true });
    const sha = core.getInput('sha', { required: true });
    const checkRunIdInput = core.getInput('check-run-id', { required: false });

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

    const workflowRunUrl = `${serverUrl}/${repository}/actions/runs/${runId}`;
    const detailsUrl = workflowRunUrl;

    const metadata = {
      workflow,
      workflowFile,
      job,
      runNumber,
      eventName,
      actor,
      ref,
      workflowRunUrl,
    };

    let status;
    let conclusion;
    let summary;
    let text;

    if (state === 'pending') {
      ({ status, conclusion, summary, text } = buildPendingOutput(metadata));
    } else if (state === 'outcome') {
      ({ status, conclusion, summary, text } = buildOutcomeOutput(
        jobStatus,
        metadata,
      ));
    } else {
      core.setFailed(`Invalid state: ${state}. Must be 'pending' or 'outcome'`);
      return;
    }

    await reportAuthenticationIdentity(octokit);

    const targetUrl = detailsUrl;
    const existingCheckRunId = checkRunIdInput || checkRunIds.get(checkName);

    if (state === 'pending' && !existingCheckRunId) {
      const createResponse = await octokit.rest.checks.create({
        owner,
        repo,
        name: checkName,
        head_sha: sha,
        status,
        details_url: targetUrl,
        output: {
          title: checkName,
          summary,
          text,
        },
      });

      checkRunIds.set(checkName, createResponse.data.id);
      core.setOutput('check-run-id', createResponse.data.id);
      core.info(
        `Created check run ${checkName} with ID ${createResponse.data.id}`,
      );
    } else if (state === 'outcome') {
      if (existingCheckRunId) {
        await octokit.rest.checks.update({
          owner,
          repo,
          check_run_id: existingCheckRunId,
          status,
          conclusion,
          details_url: targetUrl,
          output: {
            title: checkName,
            summary,
            text,
          },
        });

        core.setOutput('check-run-id', existingCheckRunId);
        core.info(
          `Updated check run ${checkName} (ID ${existingCheckRunId}) to ${conclusion}`,
        );
      } else {
        const createResponse = await octokit.rest.checks.create({
          owner,
          repo,
          name: checkName,
          head_sha: sha,
          status,
          conclusion,
          details_url: targetUrl,
          output: {
            title: checkName,
            summary,
            text,
          },
        });

        core.setOutput('check-run-id', createResponse.data.id);
        core.info(
          `Created completed check run ${checkName} with ${conclusion}`,
        );
      }
    } else {
      await octokit.rest.checks.update({
        owner,
        repo,
        check_run_id: existingCheckRunId,
        status,
        details_url: targetUrl,
        output: {
          title: checkName,
          summary,
          text,
        },
      });

      core.setOutput('check-run-id', existingCheckRunId);
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
