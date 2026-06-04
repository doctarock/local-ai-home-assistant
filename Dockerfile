FROM node:22-slim

ARG NOVA_UID=1001
ARG NOVA_GID=1001

# Install system deps for npm/git and Playwright Chromium
USER root
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
    git \
    ca-certificates \
    zip \
    unzip \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libdbus-1-3 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libatspi2.0-0 \
    libxshmfence1 \
    libx11-xcb1 \
    libgtk-3-0 \
    libpango-1.0-0 \
    libcairo2 \
    fonts-liberation \
    xdg-utils \
 && rm -rf /var/lib/apt/lists/*

# Create a stable non-root user and pre-seed the sandbox state layout.
RUN groupadd --gid ${NOVA_GID} nova \
 && useradd -m --uid ${NOVA_UID} --gid ${NOVA_GID} nova \
 && install -d -o ${NOVA_UID} -g ${NOVA_GID} \
    /home/nova/.observer-sandbox \
    /home/nova/.observer-sandbox/workspace \
    /home/nova/.observer-sandbox/workspace/memory \
    /home/nova/.observer-sandbox/workspace/memory/questions \
    /home/nova/.observer-sandbox/workspace/memory/personal \
    /home/nova/.observer-sandbox/workspace/memory/briefings \
    /home/nova/.observer-sandbox/workspace/skills \
    /home/nova/observer-output

USER nova
WORKDIR /home/nova

# Install user-owned tool/runtime dependencies for observer sandbox jobs.
RUN npm config set prefix /home/nova/.npm-global \
 && npm install -g playwright \
 && /home/nova/.npm-global/bin/playwright install chromium

USER root
RUN ln -sf /home/nova/.npm-global/bin/playwright /usr/local/bin/playwright

USER nova
ENV PATH="/home/nova/.npm-global/bin:${PATH}"

CMD ["node", "--version"]
