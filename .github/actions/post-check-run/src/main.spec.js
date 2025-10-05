const mockCore = {
  getInput: jest.fn(),
  setFailed: jest.fn(),
  info: jest.fn(),
};

const mockGithub = {
  getOctokit: jest.fn(),
  context: {},
};

jest.mock('@actions/core', () => mockCore);
jest.mock('@actions/github', () => mockGithub);

const core = require('@actions/core');
const github = require('@actions/github');

// Set test environment
process.env.NODE_ENV = 'test';

describe('post-check-run action', () => {
  let mockOctokit;
  let mockCreateCheckRun;
  let mockUpdateCheckRun;
  let getInputValues;

  beforeEach(() => {
    // Clear the check run IDs map before each test
    const { checkRunIds } = require('./main');
    checkRunIds.clear();

    // Setup default mocks
    mockCreateCheckRun = jest.fn().mockResolvedValue({
      data: { id: 12345 },
    });
    mockUpdateCheckRun = jest.fn().mockResolvedValue({});
    mockOctokit = {
      rest: {
        checks: {
          create: mockCreateCheckRun,
          update: mockUpdateCheckRun,
        },
      },
    };

    github.getOctokit.mockReturnValue(mockOctokit);
    github.context = {
      eventName: 'pull_request',
      repo: {
        owner: 'test-owner',
        repo: 'test-repo',
      },
      runId: 123456,
      runNumber: 42,
      workflow: 'CI',
      job: 'test',
      actor: 'test-user',
      ref: 'refs/heads/main',
      serverUrl: 'https://github.com',
      payload: {
        repository: {
          full_name: 'test-owner/test-repo',
        },
      },
    };

    // Default inputs
    getInputValues = {
      state: 'pending',
      name: 'ci/test',
      'job-status': 'success',
      'workflow-file': 'ci.yml',
      sha: 'abc123def456',
    };

    core.getInput.mockImplementation((name) => getInputValues[name] || '');
    core.setFailed.mockImplementation(() => {
      // No-op
    });
    core.info.mockImplementation(() => {
      // No-op
    });

    process.env.GITHUB_TOKEN = 'test-token';
  });

  afterEach(() => {
    delete process.env.GITHUB_TOKEN;
    delete process.env.GH_TOKEN;
    jest.clearAllMocks();
  });

  const runAction = async () => {
    // Dynamically require to get fresh module
    delete require.cache[require.resolve('./main')];
    const { run } = require('./main');
    await run();
  };

  describe('pending check runs', () => {
    it('should create a new check run in pending state', async () => {
      // Arrange
      getInputValues = {
        state: 'pending',
        name: 'ci/build',
        'job-status': '',
        'workflow-file': 'ci.yml',
        sha: 'abc123def456',
      };

      // Act
      await runAction();

      // Assert
      expect(mockCreateCheckRun).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        name: 'ci/build',
        head_sha: 'abc123def456',
        status: 'in_progress',
        details_url:
          'https://github.com/test-owner/test-repo/actions/runs/123456',
        output: {
          title: 'ci/build',
          summary: expect.stringContaining('Check is currently in progress'),
          text: expect.stringContaining('Check Run Details'),
        },
      });
      expect(mockUpdateCheckRun).not.toHaveBeenCalled();
    });

    it('should include workflow metadata in summary', async () => {
      // Arrange
      getInputValues = {
        state: 'pending',
        name: 'ci/lint',
        'job-status': '',
        'workflow-file': 'ci.yml',
        sha: 'abc123def456',
      };

      // Act
      await runAction();

      // Assert
      expect(mockCreateCheckRun).toHaveBeenCalledWith(
        expect.objectContaining({
          output: {
            title: 'ci/lint',
            summary: expect.stringMatching(/Workflow.*ci\.yml/),
            text: expect.stringContaining('Check Run Details'),
          },
        }),
      );
    });

    it('should store check run ID for later updates', async () => {
      // Arrange
      getInputValues = {
        state: 'pending',
        name: 'ci/test',
        'job-status': '',
        'workflow-file': 'ci.yml',
        sha: 'abc123def456',
      };

      // Act
      await runAction();

      // Assert
      const { checkRunIds } = require('./main');
      expect(checkRunIds.get('ci/test')).toBe(12345);
    });
  });

  describe('outcome check runs', () => {
    it('should update check run to success when job succeeds', async () => {
      // Arrange - first create pending
      const { checkRunIds } = require('./main');
      checkRunIds.set('ci/build', 12345);

      getInputValues = {
        state: 'outcome',
        name: 'ci/build',
        'job-status': 'success',
        'workflow-file': 'ci.yml',
        sha: 'abc123def456',
      };

      // Act
      await runAction();

      // Assert
      expect(mockUpdateCheckRun).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        check_run_id: 12345,
        status: 'completed',
        conclusion: 'success',
        details_url:
          'https://github.com/test-owner/test-repo/actions/runs/123456',
        output: {
          title: 'ci/build',
          summary: expect.stringContaining('✅ Check completed successfully'),
          text: expect.stringContaining('Check Run Details'),
        },
      });
      expect(core.setFailed).not.toHaveBeenCalled();
    });

    it('should update check run to failure when job fails', async () => {
      // Arrange - first create pending
      const { checkRunIds } = require('./main');
      checkRunIds.set('ci/test', 12345);

      getInputValues = {
        state: 'outcome',
        name: 'ci/test',
        'job-status': 'failure',
        'workflow-file': 'ci.yml',
        sha: 'abc123def456',
      };

      // Act
      await runAction();

      // Assert
      expect(mockUpdateCheckRun).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        check_run_id: 12345,
        status: 'completed',
        conclusion: 'failure',
        details_url:
          'https://github.com/test-owner/test-repo/actions/runs/123456',
        output: {
          title: 'ci/test',
          summary: expect.stringContaining('❌ Check failed'),
          text: expect.stringContaining('Check Run Details'),
        },
      });
      expect(core.setFailed).not.toHaveBeenCalled();
    });

    it('should handle cancelled job status', async () => {
      // Arrange - first create pending
      const { checkRunIds } = require('./main');
      checkRunIds.set('ci/test', 12345);

      getInputValues = {
        state: 'outcome',
        name: 'ci/test',
        'job-status': 'cancelled',
        'workflow-file': 'ci.yml',
        sha: 'abc123def456',
      };

      // Act
      await runAction();

      // Assert
      expect(mockUpdateCheckRun).toHaveBeenCalledWith(
        expect.objectContaining({
          conclusion: 'cancelled',
        }),
      );
      expect(core.setFailed).not.toHaveBeenCalled();
    });

    it('should handle skipped job status', async () => {
      // Arrange - first create pending
      const { checkRunIds } = require('./main');
      checkRunIds.set('ci/test', 12345);

      getInputValues = {
        state: 'outcome',
        name: 'ci/test',
        'job-status': 'skipped',
        'workflow-file': 'ci.yml',
        sha: 'abc123def456',
      };

      // Act
      await runAction();

      // Assert
      expect(mockUpdateCheckRun).toHaveBeenCalledWith(
        expect.objectContaining({
          conclusion: 'skipped',
        }),
      );
      expect(core.setFailed).not.toHaveBeenCalled();
    });

    it('should create check run directly if no pending check exists', async () => {
      // Arrange - no pending check run
      getInputValues = {
        state: 'outcome',
        name: 'ci/test',
        'job-status': 'success',
        'workflow-file': 'ci.yml',
        sha: 'abc123def456',
      };

      // Act
      await runAction();

      // Assert
      expect(mockCreateCheckRun).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        name: 'ci/test',
        head_sha: 'abc123def456',
        status: 'completed',
        conclusion: 'success',
        details_url:
          'https://github.com/test-owner/test-repo/actions/runs/123456',
        output: {
          title: 'ci/test',
          summary: expect.stringContaining('✅'),
          text: expect.stringContaining('Check Run Details'),
        },
      });
      expect(mockUpdateCheckRun).not.toHaveBeenCalled();
    });
  });

  describe('matrix job support', () => {
    it('should support matrix-specific check names', async () => {
      // Arrange
      getInputValues = {
        state: 'pending',
        name: 'ci/test (ubuntu-latest, Node.js 18)',
        'job-status': '',
        'workflow-file': 'ci.yml',
        sha: 'abc123def456',
      };

      // Act
      await runAction();

      // Assert
      expect(mockCreateCheckRun).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'ci/test (ubuntu-latest, Node.js 18)',
        }),
      );
    });

    it('should handle multiple matrix check runs independently', async () => {
      // Arrange - First matrix entry
      getInputValues = {
        state: 'pending',
        name: 'ci/test (ubuntu-latest, Node.js 18)',
        'job-status': '',
        'workflow-file': 'ci.yml',
        sha: 'abc123def456',
      };
      await runAction();

      // Arrange - Second matrix entry
      mockCreateCheckRun.mockResolvedValue({
        data: { id: 67890 },
      });
      getInputValues = {
        state: 'pending',
        name: 'ci/test (windows-latest, Node.js 20)',
        'job-status': '',
        'workflow-file': 'ci.yml',
        sha: 'abc123def456',
      };

      // Act
      await runAction();

      // Assert
      const { checkRunIds } = require('./main');
      expect(checkRunIds.get('ci/test (ubuntu-latest, Node.js 18)')).toBe(
        12345,
      );
      expect(checkRunIds.get('ci/test (windows-latest, Node.js 20)')).toBe(
        67890,
      );
    });
  });

  describe('error handling', () => {
    it('should fail if GitHub token is not available', async () => {
      // Arrange
      delete process.env.GITHUB_TOKEN;

      // Act
      await runAction();

      // Assert
      expect(core.setFailed).toHaveBeenCalledWith(
        'GitHub token not found. Please provide it as an action input, or ensure it is available in the context or environment.',
      );
      expect(mockCreateCheckRun).not.toHaveBeenCalled();
    });

    it('should use GH_TOKEN if GITHUB_TOKEN is not set', async () => {
      // Arrange
      delete process.env.GITHUB_TOKEN;
      process.env.GH_TOKEN = 'gh-token';

      // Act
      await runAction();

      // Assert
      expect(github.getOctokit).toHaveBeenCalledWith('gh-token');
      expect(mockCreateCheckRun).toHaveBeenCalled();
    });

    it('should handle API errors gracefully', async () => {
      // Arrange
      mockCreateCheckRun.mockRejectedValue(new Error('API error'));

      // Act
      await runAction();

      // Assert
      expect(core.setFailed).toHaveBeenCalledWith('API error');
    });

    it('should fail for invalid state input', async () => {
      // Arrange
      getInputValues = {
        state: 'invalid',
        name: 'ci/test',
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
      expect(mockCreateCheckRun).not.toHaveBeenCalled();
    });
  });

  describe('context information', () => {
    it('should use provided SHA input', async () => {
      // Arrange
      const customSha = 'custom-sha-123';
      getInputValues = {
        state: 'pending',
        name: 'ci/build',
        'job-status': '',
        'workflow-file': 'ci.yml',
        sha: customSha,
      };

      // Act
      await runAction();

      // Assert
      expect(mockCreateCheckRun).toHaveBeenCalledWith(
        expect.objectContaining({
          head_sha: customSha,
        }),
      );
    });

    it('should include actor and ref in summary', async () => {
      // Arrange
      github.context.actor = 'octocat';
      github.context.ref = 'refs/heads/feature-branch';

      getInputValues = {
        state: 'pending',
        name: 'ci/lint',
        'job-status': '',
        'workflow-file': 'ci.yml',
        sha: 'abc123def456',
      };

      // Act
      await runAction();

      // Assert
      expect(mockCreateCheckRun).toHaveBeenCalledWith(
        expect.objectContaining({
          output: {
            title: 'ci/lint',
            summary: expect.stringMatching(/Actor.*octocat/),
            text: expect.stringContaining('Check Run Details'),
          },
        }),
      );
      expect(mockCreateCheckRun).toHaveBeenCalledWith(
        expect.objectContaining({
          output: {
            title: 'ci/lint',
            summary: expect.stringMatching(/Ref.*refs\/heads\/feature-branch/),
            text: expect.stringContaining('Check Run Details'),
          },
        }),
      );
    });
  });

  describe('matrix metadata', () => {
    it('should include matrix-info in check run text when provided', async () => {
      // Arrange
      const matrixInfo = `| OS | Node.js |
|---|---|
| ubuntu-latest | 18 |
| ubuntu-latest | 20 |`;

      getInputValues = {
        state: 'outcome',
        name: 'ci/test',
        'job-status': 'success',
        'workflow-file': 'ci.yml',
        sha: 'abc123def456',
        'matrix-info': matrixInfo,
      };

      // Act
      await runAction();

      // Assert
      expect(mockCreateCheckRun).toHaveBeenCalledWith(
        expect.objectContaining({
          output: {
            title: 'ci/test',
            summary: expect.any(String),
            text: expect.stringContaining('Matrix Configuration'),
          },
        }),
      );
      expect(mockCreateCheckRun).toHaveBeenCalledWith(
        expect.objectContaining({
          output: {
            title: 'ci/test',
            summary: expect.any(String),
            text: expect.stringContaining(matrixInfo),
          },
        }),
      );
    });

    it('should not include matrix section when matrix-info is not provided', async () => {
      // Arrange
      getInputValues = {
        state: 'outcome',
        name: 'ci/build',
        'job-status': 'success',
        'workflow-file': 'ci.yml',
        sha: 'abc123def456',
        'matrix-info': '',
      };

      // Act
      await runAction();

      // Assert
      expect(mockCreateCheckRun).toHaveBeenCalledWith(
        expect.objectContaining({
          output: {
            title: 'ci/build',
            summary: expect.any(String),
            text: expect.not.stringContaining('Matrix Configuration'),
          },
        }),
      );
    });
  });
});
