FROM node:20-slim

WORKDIR /app

# Layer 1 — OS deps for Chromium (rarely changes, cached long-term)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
    libxkbcommon0 libxcomposite1 libxdamage1 libxrandr2 libgbm1 \
    libpango-1.0-0 libcairo2 libasound2 libxshmfence1 libx11-6 \
    libxext6 libxfixes3 libx11-xcb1 libxcb1 fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

# Layer 2 — npm deps (only re-runs when package*.json changes)
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Layer 3 — Playwright browser (only re-runs when Playwright version changes)
RUN npx playwright install chromium && rm -rf /tmp/*

# Layer 4 — App code (changes most often, rebuilds instantly)
COPY index.js ./

# accounts.json mounted at runtime:
#   docker run -v ./accounts.json:/app/accounts.json ...
CMD ["node", "index.js"]
