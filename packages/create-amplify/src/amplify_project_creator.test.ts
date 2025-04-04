import { blue, bold, cyan, green, grey, underline } from 'kleur/colors';
import { beforeEach, describe, it, mock } from 'node:test';
import assert from 'assert';
import { AmplifyProjectCreator } from './amplify_project_creator.js';
import { printer } from '@aws-amplify/cli-core';
import { EOL } from 'os';

const logSpy = mock.method(printer, 'log');
const indicateProgressSpy = mock.method(printer, 'indicateProgress');

void describe('AmplifyProjectCreator', () => {
  beforeEach(() => {
    logSpy.mock.resetCalls();
    indicateProgressSpy.mock.resetCalls();
  });

  void it('create project if passing `--yes` or `-y` to `npm create`', async () => {
    const packageManagerControllerMock = {
      initializeProject: mock.fn(() => Promise.resolve()),
      initializeTsConfig: mock.fn(() => Promise.resolve()),
      installDependencies: mock.fn(() => Promise.resolve()),
      runWithPackageManager: mock.fn(() => Promise.resolve() as never),
      getCommand: (args: string[]) => `'npx ${args.join(' ')}'`,
    };
    const projectRootValidatorMock = { validate: mock.fn() };
    const initialProjectFileGeneratorMock = {
      generateInitialProjectFiles: mock.fn(),
    };
    const gitIgnoreInitializerMock = { ensureInitialized: mock.fn() };
    const amplifyProjectCreator = new AmplifyProjectCreator(
      'testProjectRoot',
      packageManagerControllerMock as never,
      projectRootValidatorMock as never,
      gitIgnoreInitializerMock as never,
      initialProjectFileGeneratorMock as never,
    );

    await amplifyProjectCreator.create();
    assert.equal(
      packageManagerControllerMock.installDependencies.mock.callCount(),
      2,
    );
    assert.equal(projectRootValidatorMock.validate.mock.callCount(), 1);
    assert.equal(
      initialProjectFileGeneratorMock.generateInitialProjectFiles.mock.callCount(),
      1,
    );
    assert.equal(
      logSpy.mock.calls[1].arguments[0],
      bold(blue(`Installing devDependencies:`)),
    );
    assert.equal(
      logSpy.mock.calls[3].arguments[0],
      bold(blue(`Installing dependencies:`)),
    );
    assert.equal(
      indicateProgressSpy.mock.calls[0].arguments[0],
      `Installing devDependencies`,
    );
    assert.equal(
      indicateProgressSpy.mock.calls[0].arguments[2],
      `DevDependencies installed`,
    );
    assert.equal(
      indicateProgressSpy.mock.calls[1].arguments[0],
      `Installing dependencies`,
    );
    assert.equal(
      indicateProgressSpy.mock.calls[1].arguments[2],
      `Dependencies installed`,
    );
    assert.equal(
      indicateProgressSpy.mock.calls[2].arguments[0],
      `Creating template files`,
    );
    assert.equal(
      indicateProgressSpy.mock.calls[2].arguments[2],
      `Template files created`,
    );
    // at least for one call of logSpy, its first argument will be Successfully created a new project!
    assert.equal(
      logSpy.mock.calls.some((call) => {
        return (
          call.arguments[0] === green('Successfully created a new project!')
        );
      }),
      true,
    );
    assert.equal(
      logSpy.mock.calls.some((call) => {
        return call.arguments[0] === bold(blue('Welcome to AWS Amplify!'));
      }),
      true,
    );
    assert.equal(
      logSpy.mock.calls.some((call) => {
        return (
          call.arguments[0] ===
          `Navigate to your project directory using ${cyan(
            'cd .testProjectRoot',
          )} and then:${EOL} - Get started by running ${cyan(
            'npx ampx sandbox',
          )}.${EOL} - Run ${cyan(
            'npx ampx help',
          )} for a list of available commands.`
        );
      }),
      true,
    );

    assert.equal(
      logSpy.mock.calls.some((call) => {
        return (
          call.arguments[0] ===
          grey(
            `Amplify collects anonymous telemetry data about general usage of the CLI. Participation is optional, and you may opt-out by using ${cyan(
              'npx ampx configure telemetry disable',
            )}. To learn more about telemetry, visit ${underline(
              blue('https://docs.amplify.aws/react/reference/telemetry'),
            )}`,
          )
        );
      }),
      true,
    );
  });
});
