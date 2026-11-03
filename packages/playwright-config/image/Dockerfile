# The e2e runner image that goes with @wshno/playwright-config: node slim plus chromium-headless-shell
# for the package's pinned @playwright/test version, and nothing else. Published as
# ghcr.io/wshno/playwright-config:<package version> next to the npm package, so an app bumps both
# references together and Playwright always finds its own browser revision.
#
# Meant for runners that can only reach a container registry: a job in this image needs nothing from
# the internet except npm packages. Headless shell only (no headed Chromium, Firefox or WebKit) keeps
# it at about a third of Microsoft's image (363 MB against 991 MB compressed for 1.64.1).

ARG BASE_IMAGE=node:26-bookworm-slim
FROM ${BASE_IMAGE}

ARG PLAYWRIGHT_VERSION

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# curl and jq for wait and summary steps in CI jobs; git and zstd for checkout and the actions cache.
RUN test -n "$PLAYWRIGHT_VERSION" \
 && apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl git jq zstd \
 && npx -y "playwright@${PLAYWRIGHT_VERSION}" install --with-deps --only-shell chromium \
 && rm -rf /root/.npm /tmp/* /var/lib/apt/lists/*

# Anything that still tries to download a browser at runtime fails loudly instead of quietly reaching
# the internet.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    PLAYWRIGHT_DOWNLOAD_HOST=https://browser-downloads.invalid

LABEL org.opencontainers.image.source="https://github.com/wshno/frontend-packages" \
      org.opencontainers.image.description="Playwright runner: node slim + chromium-headless-shell for @wshno/playwright-config" \
      org.opencontainers.image.licenses="MIT"
