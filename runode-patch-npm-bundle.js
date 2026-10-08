'use strict';

const fs = require('fs');
const path = require('path');

const npmRoot = process.argv[2];
if (!npmRoot) {
  throw new Error('usage: node runode-patch-npm-bundle.js <npm-root>');
}

const expectedVersions = {
  'brace-expansion': '5.0.12',
  undici: '6.28.1',
  'ip-address': '10.7.3',
  'postcss-selector-parser': '7.1.6',
  'http-cache-semantics': '4.3.0',
};

for (const [name, expectedVersion] of Object.entries(expectedVersions)) {
  const packageJsonPath = path.join(
    npmRoot,
    'node_modules',
    name,
    'package.json',
  );
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  if (packageJson.version !== expectedVersion) {
    throw new Error(
      `${name}: expected ${expectedVersion}, found ${packageJson.version}`,
    );
  }
}

const cachePackageRoot = path.join(
  npmRoot,
  'node_modules',
  'http-cache-semantics',
);
const cacheSourcePath = path.join(cachePackageRoot, 'index.js');
const cachePackageJsonPath = path.join(cachePackageRoot, 'package.json');
const cacheSource = fs.readFileSync(cacheSourcePath, 'utf8');
const vulnerableSource = `            const allowsStaleWithoutRevalidation = 'max-stale' in requestCC &&
                (true === requestCC['max-stale'] || requestCC['max-stale'] > this.age() - this.maxAge());`;
const patchedSource = `            // CVE-2026-93748: max-stale must not override response directives
            // that deliberately prohibit shared-cache reuse.
            const staleReuseProhibited = this._rescc['no-cache'] ||
                (this._isShared && this._resHeaders['set-cookie'] && !this._rescc.public && !this._rescc.immutable) ||
                (this._isShared && this._rescc['proxy-revalidate']);
            const allowsStaleWithoutRevalidation = !staleReuseProhibited && 'max-stale' in requestCC &&
                (true === requestCC['max-stale'] || requestCC['max-stale'] > this.age() - this.maxAge());`;

if (!cacheSource.includes(vulnerableSource)) {
  throw new Error('http-cache-semantics patch context not found');
}
fs.writeFileSync(
  cacheSourcePath,
  cacheSource.replace(vulnerableSource, patchedSource),
);

const cachePackageJson = JSON.parse(
  fs.readFileSync(cachePackageJsonPath, 'utf8'),
);
cachePackageJson.version = '4.3.0-runode.1';
fs.writeFileSync(
  cachePackageJsonPath,
  `${JSON.stringify(cachePackageJson, null, 2)}\n`,
);

const CachePolicy = require(cachePackageRoot);
const baseRequest = {
  url: 'https://example.test/private',
  method: 'GET',
  headers: { host: 'example.test' },
};
const staleRequest = {
  ...baseRequest,
  headers: {
    ...baseRequest.headers,
    'cache-control': 'max-stale=9999',
  },
};

function assertMaxStaleRejected(responseHeaders, description) {
  const policy = new CachePolicy(
    baseRequest,
    { status: 200, headers: responseHeaders },
    { shared: true },
  );
  if (policy.satisfiesWithoutRevalidation(staleRequest)) {
    throw new Error(`CVE-2026-93748 regression: ${description}`);
  }
}

const responseDate = new Date().toUTCString();
assertMaxStaleRejected(
  {
    date: responseDate,
    'cache-control': 'max-age=60',
    'set-cookie': 'session=redacted',
  },
  'shared Set-Cookie response was reused',
);
assertMaxStaleRejected(
  {
    date: responseDate,
    'cache-control': 'max-age=0, proxy-revalidate',
  },
  'proxy-revalidate response was reused',
);
assertMaxStaleRejected(
  {
    date: responseDate,
    'cache-control': 'no-cache',
  },
  'no-cache response was reused',
);

const ordinaryStalePolicy = new CachePolicy(
  baseRequest,
  {
    status: 200,
    headers: { date: responseDate, 'cache-control': 'max-age=0' },
  },
  { shared: true },
);
if (!ordinaryStalePolicy.satisfiesWithoutRevalidation(staleRequest)) {
  throw new Error('max-stale behavior changed for an ordinary cache entry');
}

console.log('Runode npm dependency verification passed');
