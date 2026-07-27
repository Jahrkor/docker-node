'use strict';

const childProcess = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const EXPECTED_NODE_VERSION = '22.23.1';
const EXPECTED_NPM_VERSION = '12.0.1';
const EXPECTED_ALPINE_VERSION = '3.24';
const EXPECTED_UID = 1000;
const EXPECTED_USER = 'node';
const NPM_ROOT = '/usr/local/lib/node_modules/npm';
const INSTALLATION_SEARCH_ROOT = '/usr/local';
const TARGETS = new Map([
  ['brace-expansion', '5.0.8'],
  ['sigstore', '4.1.1'],
  ['tar', '7.5.19'],
]);
const STALE_FILES = new Set([
  '.package-lock.json',
  'npm-shrinkwrap.json',
  'package-lock.json',
]);
const STALE_DIRECTORIES = new Set(['.npm', '_cacache']);

const parseVersion = (value) => {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?$/.exec(value);
  if (!match) {
    throw new Error(`Invalid semantic version: ${JSON.stringify(value)}`);
  }
  return match.slice(1, 4).map(Number);
};

const compareVersions = (left, right) => {
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);
  for (let index = 0; index < leftParts.length; index += 1) {
    if (leftParts[index] !== rightParts[index]) {
      return leftParts[index] < rightParts[index] ? -1 : 1;
    }
  }
  return 0;
};

const walk = (directory, visitor) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      continue;
    }
    visitor(entryPath, entry);
    if (entry.isDirectory()) {
      walk(entryPath, visitor);
    }
  }
};

const readPackage = (packagePath) => {
  try {
    return JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  } catch (error) {
    throw new Error(`Cannot read ${packagePath}: ${error.message}`);
  }
};

const commandVersion = (executable) =>
  childProcess
    .execFileSync(executable, ['--version'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    .trim();

const runSelfTest = () => {
  const cases = [
    ['7.5.19', '7.5.19', 0],
    ['7.5.18', '7.5.19', -1],
    ['7.6.0', '7.5.19', 1],
    ['4.1.1', '5.0.0', -1],
    ['5.0.8', '5.0.7', 1],
  ];
  for (const [left, right, expected] of cases) {
    const actual = compareVersions(left, right);
    if (actual !== expected) {
      throw new Error(
        `Version comparison failed: ${left} vs ${right}; expected ${expected}, got ${actual}`,
      );
    }
  }
  for (const invalid of ['', '5', '5.0', 'v5.0.8', 'not-a-version']) {
    try {
      parseVersion(invalid);
      throw new Error(`Invalid version was accepted: ${invalid}`);
    } catch (error) {
      if (error.message.startsWith('Invalid version was accepted')) {
        throw error;
      }
    }
  }
  console.log('Version comparison self-test passed');
};

const main = () => {
  if (process.argv.includes('--self-test')) {
    runSelfTest();
    return;
  }

  const failures = [];
  const reportFailure = (message) => {
    failures.push(message);
    console.error(`ERROR: ${message}`);
  };

  if (!fs.existsSync(NPM_ROOT)) {
    throw new Error(`npm installation not found: ${NPM_ROOT}`);
  }

  const nodeVersion = process.versions.node;
  const alpineVersion = fs.readFileSync('/etc/alpine-release', 'utf8').trim();
  const uid = typeof process.getuid === 'function' ? process.getuid() : null;
  const username = os.userInfo().username;

  console.log(`Node version: ${nodeVersion}`);
  console.log(`Alpine version: ${alpineVersion}`);
  console.log(`Runtime UID: ${uid}`);
  console.log(`Runtime username: ${username}`);

  if (nodeVersion !== EXPECTED_NODE_VERSION) {
    reportFailure(
      `Expected Node ${EXPECTED_NODE_VERSION}, found ${nodeVersion}`,
    );
  }
  if (
    alpineVersion !== EXPECTED_ALPINE_VERSION &&
    !alpineVersion.startsWith(`${EXPECTED_ALPINE_VERSION}.`)
  ) {
    reportFailure(
      `Expected Alpine ${EXPECTED_ALPINE_VERSION}, found ${alpineVersion}`,
    );
  }
  if (uid !== EXPECTED_UID) {
    reportFailure(`Expected UID ${EXPECTED_UID}, found ${uid}`);
  }
  if (username !== EXPECTED_USER) {
    reportFailure(`Expected user ${EXPECTED_USER}, found ${username}`);
  }

  const npmExecutables = new Map([
    ['npm', '/usr/local/bin/npm'],
    ['npx', '/usr/local/bin/npx'],
  ]);
  for (const [name, executable] of npmExecutables) {
    if (!fs.existsSync(executable)) {
      reportFailure(`${name} executable not found: ${executable}`);
      continue;
    }
    try {
      const resolved = fs.realpathSync(executable);
      const version = commandVersion(executable);
      console.log(`${name} version: ${version}`);
      console.log(`${name} executable: ${executable} -> ${resolved}`);
      if (version !== EXPECTED_NPM_VERSION) {
        reportFailure(
          `Expected ${name} ${EXPECTED_NPM_VERSION}, found ${version}`,
        );
      }
      if (!resolved.startsWith(`${NPM_ROOT}${path.sep}`)) {
        reportFailure(
          `${name} does not resolve inside ${NPM_ROOT}: ${resolved}`,
        );
      }
    } catch (error) {
      reportFailure(`Cannot execute ${name}: ${error.message}`);
    }
  }

  const npmInstallations = [];
  walk(INSTALLATION_SEARCH_ROOT, (entryPath, entry) => {
    if (!entry.isFile() || entry.name !== 'package.json') {
      return;
    }
    try {
      const packageData = JSON.parse(fs.readFileSync(entryPath, 'utf8'));
      if (packageData.name === 'npm') {
        npmInstallations.push({
          packagePath: entryPath,
          version: packageData.version,
        });
      }
    } catch {
      // The npm tree is checked strictly below. Unrelated package metadata
      // outside npm does not affect duplicate npm installation detection.
    }
  });

  npmInstallations
    .sort((left, right) => left.packagePath.localeCompare(right.packagePath))
    .forEach((installation) =>
      console.log(
        `npm installation: npm@${installation.version} ${installation.packagePath}`,
      ),
    );

  if (npmInstallations.length !== 1) {
    reportFailure(
      `Expected exactly one npm installation, found ${npmInstallations.length}`,
    );
  }
  for (const installation of npmInstallations) {
    if (installation.version === '10.9.8') {
      reportFailure(`npm 10.9.8 remains: ${installation.packagePath}`);
    }
    if (installation.version !== EXPECTED_NPM_VERSION) {
      reportFailure(
        `Unexpected npm version ${installation.version}: ${installation.packagePath}`,
      );
    }
    if (
      path.resolve(path.dirname(installation.packagePath)) !==
      path.resolve(NPM_ROOT)
    ) {
      reportFailure(
        `Unexpected npm installation path: ${installation.packagePath}`,
      );
    }
  }

  const occurrences = new Map(
    [...TARGETS.keys()].map((packageName) => [packageName, []]),
  );

  walk(NPM_ROOT, (entryPath, entry) => {
    if (
      (entry.isFile() &&
        (STALE_FILES.has(entry.name) || entry.name.endsWith('.tgz'))) ||
      (entry.isDirectory() && STALE_DIRECTORIES.has(entry.name))
    ) {
      reportFailure(`Stale dependency artifact remains: ${entryPath}`);
    }
    if (!entry.isFile() || entry.name !== 'package.json') {
      return;
    }

    let packageData;
    try {
      packageData = readPackage(entryPath);
    } catch (error) {
      reportFailure(error.message);
      return;
    }

    if (!TARGETS.has(packageData.name)) {
      return;
    }

    try {
      parseVersion(packageData.version);
      occurrences.get(packageData.name).push({
        packagePath: entryPath,
        version: packageData.version,
      });
    } catch (error) {
      reportFailure(
        `${packageData.name} has an invalid version at ${entryPath}: ${error.message}`,
      );
    }
  });

  for (const [packageName, minimumVersion] of TARGETS) {
    const packageOccurrences = occurrences.get(packageName);
    if (packageOccurrences.length === 0) {
      reportFailure(`No ${packageName} occurrence found below ${NPM_ROOT}`);
      continue;
    }
    packageOccurrences
      .sort((left, right) => left.packagePath.localeCompare(right.packagePath))
      .forEach((occurrence) => {
        console.log(
          `${packageName}@${occurrence.version}: ${occurrence.packagePath}`,
        );
        if (compareVersions(occurrence.version, minimumVersion) < 0) {
          reportFailure(
            `${packageName}@${occurrence.version} is below ${minimumVersion}: ${occurrence.packagePath}`,
          );
        }
      });
  }

  if (failures.length > 0) {
    throw new Error(
      `Security verification failed with ${failures.length} error(s)`,
    );
  }
  console.log('Security package verification passed');
};

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

module.exports = { compareVersions, parseVersion, runSelfTest };
