const {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
} = require('@jest/globals');
const core = require('@actions/core');
const github = require('@actions/github');

// Mock modules
jest.mock('@actions/core');
jest.mock('@actions/github');

// Set test environment
process.env.NODE_ENV = 'test';

describe('post-status-check action', () => {
  let mockOctokit;
  let mockCreateCommitStatus;
  let getInputValues;

  beforeEach(() => {
    // Setup default mocks
    mockCreateCommitStatus = jest.fn().mockResolvedValue({});
    mockOctokit = {
      rest: {
        repos: {
          createCommitStatus: mockCreateCommitStatus,
        },
      },
    };

    github.getOctokit = jest.fn().mockReturnValue(mockOctokit);
    github.context = {
      eventName: 'workflow_dispatch',
      repo: {
        owner: 'test-owner',
        repo: 'test-repo',
      },
      runId: 123456,
    };

    // Default inputs
    getInputValues = {
      state: 'pending',
      context: 'test-context',
      'job-status': 'success',
      'workflow-file': 'ci.yml',
      sha: 'abc123def456',
    };

    core.getInput = jest.fn((name) => getInputValues[name] || '');
    core.setFailed = jest.fn();
    core.info = jest.fn();

    process.env.GITHUB_TOKEN = 'test-token';
  });

  afterEach(() => {
    delete process.env.GITHUB_TOKEN;
    delete process.env.GH_TOKEN;
  });

  const runAction = async () => {
    // Dynamically require to get fresh module
    delete require.cache[require.resolve('../main')];
    const { run } = require('../main');
    await run();
  };

  it('should post pending status for workflow_dispatch event', async () => {
    // Arrange
    getInputValues = {
      state: 'pending',
      context: 'build',
      'job-status': '',
      'workflow-file': 'ci.yml',
      sha: 'abc123def456',
    };

    // Act
    await runAction();

    // Assert
    expect(mockCreateCommitStatus).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      sha: 'abc123def456',
      state: 'pending',
      context: 'build',
      description: 'ci.yml (workflow_dispatch) in progress',
      target_url: 'https://github.com/test-owner/test-repo/actions/runs/123456',
    });
  });

  it('should post success status for successful job outcome', async () => {
    // Arrange
    getInputValues = {
      state: 'outcome',
      context: 'test',
      'job-status': 'success',
      'workflow-file': 'ci.yml',
      sha: 'abc123def456',
    };

    // Act
    await runAction();

    // Assert
    expect(mockCreateCommitStatus).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      sha: 'abc123def456',
      state: 'success',
      context: 'test',
      description: 'ci.yml (workflow_dispatch) succeeded',
      target_url: 'https://github.com/test-owner/test-repo/actions/runs/123456',
    });
    expect(core.setFailed).not.toHaveBeenCalled();
  });

  it('should post failure status for failed job outcome', async () => {
    // Arrange
    getInputValues = {
      state: 'outcome',
      context: 'e2e',
      'job-status': 'failure',
      'workflow-file': 'ci.yml',
      sha: 'abc123def456',
    };

    // Act
    await runAction();

    // Assert
    expect(mockCreateCommitStatus).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      sha: 'abc123def456',
      state: 'failure',
      context: 'e2e',
      description: 'ci.yml (workflow_dispatch) failed',
      target_url: 'https://github.com/test-owner/test-repo/actions/runs/123456',
    });
    expect(core.setFailed).toHaveBeenCalledWith('Job status is failure');
  });

  it('should skip posting status for non-workflow_dispatch events', async () => {
    // Arrange
    github.context.eventName = 'push';

    // Act
    await runAction();

    // Assert
    expect(mockCreateCommitStatus).not.toHaveBeenCalled();
    expect(core.info).toHaveBeenCalledWith(
      'Skipping status check - not a workflow_dispatch event',
    );
  });

  it('should fail if GitHub token is not available', async () => {
    // Arrange
    delete process.env.GITHUB_TOKEN;

    // Act
    await runAction();

    // Assert
    expect(core.setFailed).toHaveBeenCalledWith(
      'GitHub token not found. Please provide it as an action input, or ensure it is available in the context or environment.',
    );
    expect(mockCreateCommitStatus).not.toHaveBeenCalled();
  });

  it('should use GH_TOKEN if GITHUB_TOKEN is not set', async () => {
    // Arrange
    delete process.env.GITHUB_TOKEN;
    process.env.GH_TOKEN = 'gh-token';

    // Act
    await runAction();

    // Assert
    expect(github.getOctokit).toHaveBeenCalledWith('gh-token');
    expect(mockCreateCommitStatus).toHaveBeenCalled();
  });

  it('should handle errors gracefully', async () => {
    // Arrange
    mockCreateCommitStatus.mockRejectedValue(new Error('API error'));

    // Act
    await runAction();

    // Assert
    expect(core.setFailed).toHaveBeenCalledWith('API error');
  });

  it('should fail for invalid state input', async () => {
    // Arrange
    getInputValues = {
      state: 'invalid',
      context: 'test',
      'job-status': 'success',
      'workflow-file': 'ci.yml',
      sha: 'abc123def456',
    };

    // Act
    await runAction();

    // Assert
    expect(core.setFailed).toHaveBeenCalledWith(
      "Invalid state: invalid. Must be 'pending' or 'outcome'",
    );
    expect(mockCreateCommitStatus).not.toHaveBeenCalled();
  });

  it('should use provided SHA input', async () => {
    // Arrange
    const customSha = 'custom-sha-123';
    getInputValues = {
      state: 'pending',
      context: 'build',
      'job-status': '',
      'workflow-file': 'ci.yml',
      sha: customSha,
    };

    // Act
    await runAction();

    // Assert
    expect(mockCreateCommitStatus).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      sha: customSha,
      state: 'pending',
      context: 'build',
      description: 'ci.yml (workflow_dispatch) in progress',
      target_url: 'https://github.com/test-owner/test-repo/actions/runs/123456',
    });
  });
});
