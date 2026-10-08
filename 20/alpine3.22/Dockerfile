FROM alpine:3.22

ENV NODE_VERSION=20.20.2
ENV NPM_VERSION=11.21.0

ARG SOURCE_REVISION=unknown
LABEL org.opencontainers.image.source="https://github.com/Jahrkor/docker-node" \
      org.opencontainers.image.revision="$SOURCE_REVISION" \
      org.opencontainers.image.title="Runode" \
      org.opencontainers.image.version="$NODE_VERSION-alpine3.22-security"

COPY runode20-patch-npm-bundle.js /tmp/

RUN apk upgrade --no-cache \
    && addgroup -g 1000 node \
    && adduser -u 1000 -G node -s /bin/sh -D node \
    && apk add --no-cache \
        libstdc++ \
    && apk add --no-cache --virtual .build-deps \
        curl \
    && ARCH= OPENSSL_ARCH='linux*' && alpineArch="$(apk --print-arch)" \
      && case "${alpineArch##*-}" in \
        x86_64) ARCH='x64' CHECKSUM="2b51a5388f6aaf8e2af65fe3bad6114db0ebd81a1ae1250b1de0cbf034b10c5d" OPENSSL_ARCH=linux-x86_64;; \
        x86) OPENSSL_ARCH=linux-elf;; \
        aarch64) OPENSSL_ARCH=linux-aarch64;; \
        arm*) OPENSSL_ARCH=linux-armv4;; \
        ppc64le) OPENSSL_ARCH=linux-ppc64le;; \
        s390x) OPENSSL_ARCH=linux-s390x;; \
        *) ;; \
      esac \
  && if [ -n "${CHECKSUM}" ]; then \
    set -eu; \
    curl -fsSLO --compressed "https://unofficial-builds.nodejs.org/download/release/v$NODE_VERSION/node-v$NODE_VERSION-linux-$ARCH-musl.tar.xz"; \
    echo "$CHECKSUM  node-v$NODE_VERSION-linux-$ARCH-musl.tar.xz" | sha256sum -c - \
      && tar -xJf "node-v$NODE_VERSION-linux-$ARCH-musl.tar.xz" -C /usr/local --strip-components=1 --no-same-owner \
      && ln -s /usr/local/bin/node /usr/local/bin/nodejs; \
  else \
    echo "Building from source" \
    # backup build
    && apk add --no-cache --virtual .build-deps-full \
        binutils-gold \
        g++ \
        gcc \
        gnupg \
        libgcc \
        linux-headers \
        make \
        python3 \
        py-setuptools \
    # use pre-existing gpg directory, see https://github.com/nodejs/docker-node/pull/1895#issuecomment-1550389150
    && export GNUPGHOME="$(mktemp -d)" \
    # gpg keys listed at https://github.com/nodejs/node#release-keys
    && for key in \
      5BE8A3F6C8A5C01D106C0AD820B1A390B168D356 \
      DD792F5973C6DE52C432CBDAC77ABFA00DDBF2B7 \
      CC68F5A3106FF448322E48ED27F5E38D5B0A215F \
      8FCCA13FEF1D0C2E91008E09770F7A9A5AE15600 \
      890C08DB8579162FEE0DF9DB8BEAB4DFCF555EF4 \
      C82FA3AE1CBEDC6BE46B9360C43CEC45C17AB93C \
      108F52B48DB57BB0CC439B2997B01419BD92F80A \
      A363A499291CBBC940DD62E41F10027AF002F8B0 \
    ; do \
      { gpg --batch --keyserver hkps://keys.openpgp.org --recv-keys "$key" && gpg --batch --fingerprint "$key"; } || \
      { gpg --batch --keyserver keyserver.ubuntu.com --recv-keys "$key" && gpg --batch --fingerprint "$key"; } ; \
    done \
    && curl -fsSLO --compressed "https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION.tar.xz" \
    && curl -fsSLO --compressed "https://nodejs.org/dist/v$NODE_VERSION/SHASUMS256.txt.asc" \
    && gpg --batch --decrypt --output SHASUMS256.txt SHASUMS256.txt.asc \
    && gpgconf --kill all \
    && rm -rf "$GNUPGHOME" \
    && grep " node-v$NODE_VERSION.tar.xz\$" SHASUMS256.txt | sha256sum -c - \
    && tar -xf "node-v$NODE_VERSION.tar.xz" \
    && cd "node-v$NODE_VERSION" \
    && ./configure \
    && make -j$(getconf _NPROCESSORS_ONLN) V= \
    && make install \
    && apk del .build-deps-full \
    && cd .. \
    && rm -Rf "node-v$NODE_VERSION" \
    && rm "node-v$NODE_VERSION.tar.xz" SHASUMS256.txt.asc SHASUMS256.txt; \
  fi \
  && rm -f "node-v$NODE_VERSION-linux-$ARCH-musl.tar.xz" \
  # Remove unused OpenSSL headers to save ~34MB. See this NodeJS issue: https://github.com/nodejs/node/issues/46451
  && find /usr/local/include/node/openssl/archs -mindepth 1 -maxdepth 1 ! -name "$OPENSSL_ARCH" -exec rm -rf {} \; \
  # Replace npm and vulnerable vendored packages with content-addressed releases.
  && mkdir -p /tmp/npm-security-patches \
  && cd /tmp/npm-security-patches \
  && npm pack --silent npm@11.21.0 \
  && npm pack --silent brace-expansion@5.0.12 \
  && npm pack --silent undici@6.28.1 \
  && npm pack --silent ip-address@10.7.3 \
  && npm pack --silent postcss-selector-parser@7.1.6 \
  && npm pack --silent http-cache-semantics@4.3.0 \
  && echo "668bfc2a16a63677a22dd10bb63e5800bb4d9895b82f87c22d3ce37e9cd71b6c3a3121dc7f453181d94ae6e9680ae92c593fbb986514ef08bbf5c3ba46a8af3e  npm-11.21.0.tgz" | sha512sum -c - \
  && echo "628bd0debce168b308ac38cd0cc90d4b4d6d79af77aa11211b9c72f1febe47497e770dca8bee6c0a822823de368ae2d94c75a881692d830543854d3d88d12299  brace-expansion-5.0.12.tgz" | sha512sum -c - \
  && echo "cd6a5d4d50f9e07e3c088c9b2f4ad6437ba4a5bf5ddb7c0cede1f946d7dd99e3fbd1c587363b5fa3b3f8bd95fee42a0370ee772783eee6e5e9ee535f8dce8344  undici-6.28.1.tgz" | sha512sum -c - \
  && echo "03591dabfb526f9423bcabc032022812f0c12202fba9aa953ff8e4bd2c1861167d884cef3e9a29c69db041fbb74ae6511eda47371327f05b346d2fa07f95e6c2  ip-address-10.7.3.tgz" | sha512sum -c - \
  && echo "eea0123f384a17697628b6e8459bb1f0209344c746895d3cbd69b22b33f3db6a99ed98d004e798eeb37336808b49489fb49ec752ad061111e6c70fedd1d09d33  postcss-selector-parser-7.1.6.tgz" | sha512sum -c - \
  && echo "339b792e52694b5507323bf045055d147bcf21219e2c0c4d72b5ae2647868742b1b2a0876753b7357654ffcc7b703d010dc196f246a9c4c293bf096aacd90790  http-cache-semantics-4.3.0.tgz" | sha512sum -c - \
  && rm -rf /usr/local/lib/node_modules/npm \
  && mkdir -p /usr/local/lib/node_modules/npm \
  && tar -xzf npm-11.21.0.tgz -C /usr/local/lib/node_modules/npm --strip-components=1 --no-same-owner \
  && for spec in \
      brace-expansion-5.0.12 \
      undici-6.28.1 \
      ip-address-10.7.3 \
      postcss-selector-parser-7.1.6 \
      http-cache-semantics-4.3.0 \
    ; do \
      package="${spec%-*}"; \
      target="/usr/local/lib/node_modules/npm/node_modules/$package"; \
      rm -rf "$target"; \
      mkdir -p "$target"; \
      tar -xzf "$spec.tgz" -C "$target" --strip-components=1 --no-same-owner; \
    done \
  && node /tmp/runode20-patch-npm-bundle.js /usr/local/lib/node_modules/npm \
  && ln -sf ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
  && ln -sf ../lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx \
  && apk del .build-deps \
  # smoke tests
  && node --version \
  && test "$(npm --version)" = "$NPM_VERSION" \
  && npm cache clean --force \
  && rm -rf /root/.npm /home/node/.npm /var/cache/apk/* /tmp/*

ENV YARN_VERSION=1.22.22

RUN apk add --no-cache --virtual .build-deps-yarn curl gnupg tar \
  # use pre-existing gpg directory, see https://github.com/nodejs/docker-node/pull/1895#issuecomment-1550389150
  && export GNUPGHOME="$(mktemp -d)" \
  && for key in \
    6A010C5166006599AA17F08146C2130DFD2497F5 \
  ; do \
    { gpg --batch --keyserver hkps://keys.openpgp.org --recv-keys "$key" && gpg --batch --fingerprint "$key"; } || \
    { gpg --batch --keyserver keyserver.ubuntu.com --recv-keys "$key" && gpg --batch --fingerprint "$key"; } ; \
  done \
  && curl -fsSLO --compressed "https://yarnpkg.com/downloads/$YARN_VERSION/yarn-v$YARN_VERSION.tar.gz" \
  && curl -fsSLO --compressed "https://yarnpkg.com/downloads/$YARN_VERSION/yarn-v$YARN_VERSION.tar.gz.asc" \
  && gpg --batch --verify yarn-v$YARN_VERSION.tar.gz.asc yarn-v$YARN_VERSION.tar.gz \
  && gpgconf --kill all \
  && rm -rf "$GNUPGHOME" \
  && mkdir -p /opt \
  && tar -xzf yarn-v$YARN_VERSION.tar.gz -C /opt/ \
  && ln -s /opt/yarn-v$YARN_VERSION/bin/yarn /usr/local/bin/yarn \
  && ln -s /opt/yarn-v$YARN_VERSION/bin/yarnpkg /usr/local/bin/yarnpkg \
  && rm yarn-v$YARN_VERSION.tar.gz.asc yarn-v$YARN_VERSION.tar.gz \
  && apk del .build-deps-yarn \
  # smoke test
  && yarn --version \
  && rm -rf /tmp/*

COPY docker-entrypoint.sh /usr/local/bin/
ENTRYPOINT ["docker-entrypoint.sh"]

USER node

CMD [ "node" ]
