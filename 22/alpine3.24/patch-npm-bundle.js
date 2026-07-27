'use strict';

const fs = require('fs');
const path = require('path');

const EXPECTED_NPM_VERSION = '12.0.1';
const EXPECTED_BRACE_EXPANSION_VERSION = '5.0.8';
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

const findBraceExpansionPackages = (npmRoot) => {
  const matches = [];
  walk(npmRoot, (entryPath, entry) => {
    if (!entry.isFile() || entry.name !== 'package.json') {
      return;
    }
    const packageData = readPackage(entryPath);
    if (packageData.name === 'brace-expansion') {
      parseVersion(packageData.version);
      matches.push({
        directory: path.dirname(entryPath),
        packagePath: entryPath,
        version: packageData.version,
      });
    }
  });
  return matches.sort((left, right) =>
    left.packagePath.localeCompare(right.packagePath),
  );
};

const cleanStaleArtifacts = (npmRoot) => {
  const pathsToRemove = [];
  walk(npmRoot, (entryPath, entry) => {
    if (
      (entry.isFile() &&
        (STALE_FILES.has(entry.name) || entry.name.endsWith('.tgz'))) ||
      (entry.isDirectory() && STALE_DIRECTORIES.has(entry.name))
    ) {
      pathsToRemove.push(entryPath);
    }
  });

  pathsToRemove
    .sort((left, right) => right.length - left.length)
    .forEach((entryPath) => {
      console.log(`Removing stale artifact: ${entryPath}`);
      fs.rmSync(entryPath, { force: true, recursive: true });
    });
};

const main = () => {
  const [npmRootArgument, replacementRootArgument] = process.argv.slice(2);
  if (!npmRootArgument || !replacementRootArgument) {
    throw new Error(
      'Usage: node patch-npm-bundle.js <npm-root> <brace-expansion-root>',
    );
  }

  const npmRoot = path.resolve(npmRootArgument);
  const replacementRoot = path.resolve(replacementRootArgument);
  const npmPackage = readPackage(path.join(npmRoot, 'package.json'));
  const replacementPackage = readPackage(
    path.join(replacementRoot, 'package.json'),
  );

  if (
    npmPackage.name !== 'npm' ||
    npmPackage.version !== EXPECTED_NPM_VERSION
  ) {
    throw new Error(
      `Expected npm@${EXPECTED_NPM_VERSION}, found ${npmPackage.name}@${npmPackage.version}`,
    );
  }
  if (
    replacementPackage.name !== 'brace-expansion' ||
    replacementPackage.version !== EXPECTED_BRACE_EXPANSION_VERSION
  ) {
    throw new Error(
      `Expected brace-expansion@${EXPECTED_BRACE_EXPANSION_VERSION}, found ${replacementPackage.name}@${replacementPackage.version}`,
    );
  }

  const occurrences = findBraceExpansionPackages(npmRoot);
  if (occurrences.length === 0) {
    throw new Error('No bundled brace-expansion occurrence was found');
  }

  for (const occurrence of occurrences) {
    console.log(
      `Discovered brace-expansion@${occurrence.version}: ${occurrence.packagePath}`,
    );
    if (
      compareVersions(occurrence.version, EXPECTED_BRACE_EXPANSION_VERSION) < 0
    ) {
      fs.rmSync(occurrence.directory, { force: true, recursive: true });
      fs.cpSync(replacementRoot, occurrence.directory, { recursive: true });
      console.log(
        `Replaced with brace-expansion@${EXPECTED_BRACE_EXPANSION_VERSION}: ${occurrence.directory}`,
      );
    }
  }

  cleanStaleArtifacts(npmRoot);

  const finalOccurrences = findBraceExpansionPackages(npmRoot);
  if (finalOccurrences.length !== occurrences.length) {
    throw new Error(
      `brace-expansion occurrence count changed from ${occurrences.length} to ${finalOccurrences.length}`,
    );
  }
  for (const occurrence of finalOccurrences) {
    console.log(
      `Final brace-expansion@${occurrence.version}: ${occurrence.packagePath}`,
    );
    if (
      compareVersions(occurrence.version, EXPECTED_BRACE_EXPANSION_VERSION) < 0
    ) {
      throw new Error(
        `Vulnerable brace-expansion remains: ${occurrence.packagePath}`,
      );
    }
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

module.exports = { compareVersions, parseVersion };
