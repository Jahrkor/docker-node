# Node 22 Alpine 3.24 security remediation

`Dockerfile.secure` is a temporary, separately maintained security variant of
the generated `Dockerfile` in this directory. It preserves the official
Alpine-based Node installation, architecture handling, checksums, GPG
verification, Yarn installation, entrypoint, and command without changing the
shared `Dockerfile-alpine.template`.

## Findings addressed

| Package or control | Original state | Required state             | Findings                                       |
| ------------------ | -------------- | -------------------------- | ---------------------------------------------- |
| `tar`              | 7.5.11         | every occurrence >= 7.5.19 | CVE-2026-59874, CVE-2026-59873, CVE-2026-59871 |
| `sigstore`         | 3.1.0          | every occurrence >= 4.1.1  | CVE-2026-48815                                 |
| `brace-expansion`  | 2.0.2          | every occurrence >= 5.0.8  | CVE-2026-33750, CVE-2026-14257, CVE-2026-13149 |
| Runtime user       | root           | `node` / UID 1000          | Container runs as root                         |

Node 22.23.1 bundles npm 10.9.8. npm 12.0.1 is compatible with Node 22.23.1
and bundles `tar` 7.5.19 and `sigstore` 5.0.0, but it was published with
`brace-expansion` 5.0.7. Because no stable npm release currently bundles
`brace-expansion` 5.0.8 or newer, this variant constructs an exact temporary
patch of npm 12.0.1.

## Patched npm construction

The disposable `npm-security-builder` stage downloads these exact registry
artifacts:

- `npm-12.0.1.tgz`
  - SHA-512:
    `2f94fd8bf600416416a934bfc59c4991e8bff7372ef7d842784e2a8b8d48c81555ee645069ddea73625fb8e92dc261feab0188fd5dab6c22fefd46316f5f9140`
- `brace-expansion-5.0.8.tgz`
  - SHA-512:
    `259c83caadc3e005227ca4cf381ec310b7fa5ec07759d3ee3710ada1bd6f1573ec49785d0221c1589fed27c1c073d687f3804afb924564b36424ac771bd93342`

Both downloads must pass `sha512sum -c` before extraction.
`patch-npm-bundle.js` recursively discovers every bundled
`brace-expansion` package, replaces each occurrence below 5.0.8 with the
verified official 5.0.8 package, removes stale lock/cache/tarball metadata, and
rescans the result. It does not change the brace-expansion source.

The patched tree is archived with sorted paths, a fixed timestamp, numeric
root ownership, and GNU tar format. The archive is bind-mounted from the
builder only for the final installation `RUN`, so the archive, builder
packages, downloaded tarballs, and temporary source trees do not create final
image layers.

The final image removes the npm tree installed by Node before the Node
installation layer is committed, extracts the patched npm tree, and recreates
the `npm` and `npx` links. This avoids retaining npm 10.9.8 in an earlier
final-image layer.

## Verification and runtime behavior

`verify-security-packages.js` runs during the build after `USER node`. It:

- requires Node 22.23.1, Alpine 3.24, npm/npx 12.0.1, UID 1000, and user
  `node`;
- requires exactly one npm installation below `/usr/local`;
- rejects npm 10.9.8 or an unexpected npm location/version;
- recursively prints every `tar`, `sigstore`, and `brace-expansion`
  occurrence;
- rejects invalid versions, missing target packages, stale lock metadata, or
  any target below its required floor.

The node user's home is `/home/node`, and the build asserts that npm's default
cache is `/home/node/.npm`.

This differs behaviorally from the official base image. A downstream
Dockerfile that installs Alpine packages must switch to root and then restore
the non-root user:

```dockerfile
USER root
RUN apk add --no-cache <package>
USER node
```

## Removing the temporary patch

Once npm publishes a stable release that is compatible with Node 22.23.1 and
whose complete bundled tree satisfies all three version floors:

1. Inspect the published npm tarball recursively.
2. Pin the exact compliant npm version and its artifact integrity.
3. Replace the custom brace-expansion patch stage with the unmodified verified
   npm artifact.
4. Keep the recursive verifier and final `USER node`.
5. Build and scan the image before deleting `patch-npm-bundle.js` or this
   rationale.

## Next-step commands

Run these commands from the repository root. They are intentionally not run as
part of the source-remediation step.

```powershell
$Image = 'docker-node:22.23.1-alpine3.24-secure-test'

docker build --pull --no-cache `
  --file .\22\alpine3.24\Dockerfile.secure `
  --tag $Image `
  .\22\alpine3.24

docker run --rm $Image node /usr/local/bin/smoke-test-secure.js

docker run --rm $Image node /usr/local/bin/verify-security-packages.js

docker inspect --format '{{.Config.User}}' $Image
docker run --rm $Image id -u
docker run --rm $Image id -un

docker scout cves `
  --only-severity critical,high `
  --locations `
  --exit-code `
  $Image
```
