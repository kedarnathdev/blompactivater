# ── Stage 1: Install dependencies ──────────────────────────
FROM node:20-slim AS deps

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# ── Stage 2: Runtime with Playwright ──────────────────────
FROM node:20-slim

WORKDIR /app

# Install system dependencies required by Playwright browsers
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget \
    gnupg \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxrandr2 \
    libxshmfence1 \
    libxss1 \
    libxtst6 \
    xdg-utils \
    cron \
    && rm -rf /var/lib/apt/lists/*

# Copy node_modules from deps
COPY --from=deps /app/node_modules ./node_modules

# Copy app files
COPY package.json index.js ./

# Install Playwright browsers (multi-arch compatible)
RUN npx playwright install --with-deps

# Create cron schedule (7 AM & 9 PM IST = 1:30 & 15:30 UTC)
RUN echo "30 1 * * * cd /app && /usr/local/bin/node index.js >> /var/log/blomp.log 2>&1" > /etc/cron.d/blomp-cron \
    && echo "30 15 * * * cd /app && /usr/local/bin/node index.js >> /var/log/blomp.log 2>&1" >> /etc/cron.d/blomp-cron \
    && echo "" >> /etc/cron.d/blomp-cron \
    && chmod 0644 /etc/cron.d/blomp-cron \
    && crontab /etc/cron.d/blomp-cron \
    && touch /var/log/blomp.log

# Start cron + run once
CMD ["sh", "-c", "\
echo '🚀 Blomp Activater started — running on cron (7 AM & 9 PM IST)' && \
echo '▶ Running once now on startup…' && \
node index.js 2>&1 | tee -a /var/log/blomp.log && \
echo '⏰ Cron scheduled. Waiting for next run…' && \
cron && tail -f /var/log/blomp.log"]
