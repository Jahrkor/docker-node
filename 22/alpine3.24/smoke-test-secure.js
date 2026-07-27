'use strict';

const childProcess = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const run = (executable, arguments_, options = {}) => {
  console.log(`$ ${[executable, ...arguments_].join(' ')}`);
  childProcess.execFileSync(executable, arguments_, {
    encoding: 'utf8',
    stdio: 'inherit',
    ...options,
  });
};

const output = (executable, arguments_) => {
  const value = childProcess
    .execFileSync(executable, arguments_, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit'],
    })
    .trim();
  console.log(`$ ${[executable, ...arguments_].join(' ')}`);
  console.log(value);
  return value;
};

const main = () => {
  const temporaryDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'docker-node-secure-smoke-'),
  );

  try {
    output('node', ['--version']);
    output('npm', ['--version']);
    output('npx', ['--version']);
    output('yarn', ['--version']);
    output('cat', ['/etc/alpine-release']);

    const uid = output('id', ['-u']);
    const username = output('id', ['-un']);
    const npmCache = output('npm', ['config', 'get', 'cache']);
    run('npm', ['help']);

    if (uid !== '1000') {
      throw new Error(`Expected UID 1000, found ${uid}`);
    }
    if (username !== 'node') {
      throw new Error(`Expected user node, found ${username}`);
    }
    if (
      npmCache !== '/home/node/.npm' &&
      !npmCache.startsWith('/home/node/.npm/')
    ) {
      throw new Error(
        `Expected npm cache below /home/node/.npm, found ${npmCache}`,
      );
    }
    fs.accessSync('/home/node', fs.constants.R_OK | fs.constants.W_OK);

    fs.writeFileSync(
      path.join(temporaryDirectory, 'package.json'),
      `${JSON.stringify(
        {
          name: 'docker-node-secure-smoke-test',
          private: true,
          version: '1.0.0',
        },
        null,
        2,
      )}\n`,
    );
    run(
      'npm',
      [
        'install',
        '--save-exact',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        'is-number@7.0.0',
      ],
      { cwd: temporaryDirectory },
    );
    console.log('Runtime smoke test passed');
  } finally {
    fs.rmSync(temporaryDirectory, { force: true, recursive: true });
    console.log(`Removed temporary directory: ${temporaryDirectory}`);
  }
};

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}
