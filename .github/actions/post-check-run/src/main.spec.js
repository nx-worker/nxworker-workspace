const core = require('@actions/core');
const github = require('@actions/github');
const { run } = require('./main');

// Mock the modules
jest.mock('@actions/core');
jest.mock('@actions/github');

describe('post-check-run action', () => {
  let mockCreateCommitStatus;
  let getInputValues;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Mock octokit
    mockCreateCommitStatus = jest.fn().mockResolvedValue({});
    github.getOctokit = jest.fn().mockReturnValue({
      rest: {
        repos: {
          createCommitStatus: mockCreateCommitStatus,
        },
      },
    });

    // Mock github context
    github.context = {
      repo: { owner: 'test-owner', repo: 'test-repo' },
      runId: 123456,
      serverUrl: 'https://github.com',
      payload: {
        repository: { full_name: 'test-owner/test-repo' },
      },
    };

    // Default input values
    getInputValues = {
      state: 'pending',
      name: 'ci/build',
      sha: 'abc123def456',
      token: 'test-token',
    };

    core.getInput = jest.fn((name) => getInputValues[name] || '');
    core.setFailed = jest.fn();
    core.info = jest.fn();
  });

  describe('pending status', () => {
    it('should create a pending commit status', async () => {
      // Arrange
      getInputValues = {
        state: 'pending',
        name: 'ci/build',
        sha: 'abc123def456',
        token: 'test-token',
      };

      // Act
      await run();

      // Assert
      expect(mockCreateCommitStatus).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        sha: 'abc123def456',
        state: 'pending',
        target_url:
          'https://github.com/test-owner/test-repo/actions/runs/123456',
        description: 'Check is currently in progress...',
        context: 'ci/build',
      });
      expect(core.setFailed).not.toHaveBeenCalled();
    });
  });

  describe('outcome status', () => {
    it('should create a success status when job succeeds', async () => {
      // Arrange
      getInputValues = {
        state: 'outcome',
        name: 'ci/test',
        'job-status': 'success',
        sha: 'abc123def456',
        token: 'test-token',
      };

      // Act
      await run();

      // Assert
      expect(mockCreateCommitStatus).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        sha: 'abc123def456',
        state: 'success',
        target_url:
          'https://github.com/test-owner/test-repo/actions/runs/123456',
        description: '✅ Check completed successfully!',
        context: 'ci/test',
      });
      expect(core.setFailed).not.toHaveBeenCalled();
    });

    it('should create a failure status when job fails', async () => {
      // Arrange
      getInputValues = {
        state: 'outcome',
        name: 'ci/test',
        'job-status': 'failure',
        sha: 'abc123def456',
        token: 'test-token',
      };

      // Act
      await run();

      // Assert
      expect(mockCreateCommitStatus).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        sha: 'abc123def456',
        state: 'failure',
        target_url:
          'https://github.com/test-owner/test-repo/actions/runs/123456',
        description: '❌ Check failed.',
        context: 'ci/test',
      });
      expect(core.setFailed).toHaveBeenCalledWith('❌ Check failed.');
    });

    it('should handle cancelled job status', async () => {
      // Arrange
      getInputValues = {
        state: 'outcome',
        name: 'ci/test',
        'job-status': 'cancelled',
        sha: 'abc123def456',
        token: 'test-token',
      };

      // Act
      await run();

      // Assert
      expect(mockCreateCommitStatus).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        sha: 'abc123def456',
        state: 'error',
        target_url:
          'https://github.com/test-owner/test-repo/actions/runs/123456',
        description: '🚫 Check was cancelled.',
        context: 'ci/test',
      });
      expect(core.setFailed).not.toHaveBeenCalled();
    });

    it('should handle skipped job status', async () => {
      // Arrange
      getInputValues = {
        state: 'outcome',
        name: 'ci/test',
        'job-status': 'skipped',
        sha: 'abc123def456',
        token: 'test-token',
      };

      // Act
      await run();

      // Assert
      expect(mockCreateCommitStatus).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        sha: 'abc123def456',
        state: 'success',
        target_url:
          'https://github.com/test-owner/test-repo/actions/runs/123456',
        description: '⏭️ Check was skipped.',
        context: 'ci/test',
      });
      expect(core.setFailed).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should fail if GitHub token is not available', async () => {
      // Arrange
      core.getInput = jest.fn((name) => '');
      github.context.token = undefined;
      delete process.env.GITHUB_TOKEN;
      delete process.env.GH_TOKEN;

      // Act
      await run();

      // Assert
      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining('GitHub token not found'),
      );
    });

    it('should use GH_TOKEN if GITHUB_TOKEN is not set', async () => {
      // Arrange
      core.getInput = jest.fn((name) => {
        if (name === 'token') return '';
        return getInputValues[name] || '';
      });
      github.context.token = undefined;
      delete process.env.GITHUB_TOKEN;
      process.env.GH_TOKEN = 'gh-token';

      // Act
      await run();

      // Assert
      expect(github.getOctokit).toHaveBeenCalledWith('gh-token');
      delete process.env.GH_TOKEN;
    });

    it('should handle API errors gracefully', async () => {
      // Arrange
      mockCreateCommitStatus.mockRejectedValue(new Error('API Error'));

      // Act
      await run();

      // Assert
      expect(core.setFailed).toHaveBeenCalledWith('API Error');
    });

    it('should fail for invalid state input', async () => {
      // Arrange
      getInputValues.state = 'invalid';

      // Act
      await run();

      // Assert
      expect(core.setFailed).toHaveBeenCalledWith(
        "Invalid state: invalid. Must be 'pending' or 'outcome'",
      );
    });
  });

  describe('context information', () => {
    it('should use provided SHA input', async () => {
      // Arrange
      getInputValues.sha = 'custom-sha-123';

      // Act
      await run();

      // Assert
      expect(mockCreateCommitStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          sha: 'custom-sha-123',
        }),
      );
    });

    it('should use correct context name', async () => {
      // Arrange
      getInputValues.name = 'ci/custom-check';

      // Act
      await run();

      // Assert
      expect(mockCreateCommitStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          context: 'ci/custom-check',
        }),
      );
    });
  });
});
