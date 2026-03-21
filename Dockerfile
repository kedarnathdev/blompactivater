# ── Stage 1: Install dependencies ──────────────────────────
FROM node:20-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# ── Stage 2: Production image with Playwright + cron ──────
FROM mcr.microsoft.com/playwright:v1.52.0-noble

WORKDIR /app

# Install cron
RUN apt-get update && apt-get install -y --no-install-recommends cron \
    && rm -rf /var/lib/apt/lists/*

# Copy node_modules from deps stage and app source
COPY --from=deps /app/node_modules ./node_modules
# accounts.json is NOT baked in — mount it at runtime via:
#   docker run -v /path/to/accounts.json:/app/accounts.json ...
COPY package.json index.js ./

# Create the cron schedule: runs at 7 AM and 9 PM IST (1:30 UTC and 15:30 UTC)
# Adjust the times below to your preference.
RUN echo "30 1 * * * cd /app && /usr/local/bin/node index.js >> /var/log/blomp.log 2>&1" > /etc/cron.d/blomp-cron \
    && echo "30 15 * * * cd /app && /usr/local/bin/node index.js >> /var/log/blomp.log 2>&1" >> /etc/cron.d/blomp-cron \
    && echo "" >> /etc/cron.d/blomp-cron \
    && chmod 0644 /etc/cron.d/blomp-cron \
    && crontab /etc/cron.d/blomp-cron \
    && touch /var/log/blomp.log

# Start cron in foreground and tail the log so docker logs works
CMD ["sh", "-c", "echo '🚀 Blomp Activater started — running on cron (7 AM & 9 PM IST)' && echo '▶ Running once now on startup…' && node index.js 2>&1 | tee -a /var/log/blomp.log && echo '⏰ Cron scheduled. Waiting for next run…' && cron && tail -f /var/log/blomp.log"]
