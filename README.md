# Blomp Activater

Automated login and session activation for [Blomp Cloud Storage](https://blomp.com) accounts.

## Quick Start (Local)

1. Edit `accounts.json` with your credentials
2. Install dependencies:
   ```bash
   npm install
   npx playwright install chromium
   ```
3. Run once:
   ```bash
   npm start
   ```

## Docker (Scheduled — Twice Daily)

The Docker image runs the script **once on startup**, then automatically via cron at **7:00 AM** and **9:00 PM IST** every day.

> **Note:** `accounts.json` is **not** baked into the image — it's mounted at runtime for security.

```bash
# Build
docker build -t blomp-activater .

# Run (mount your credentials file)
docker run -d --name blomp-activater \
  -v /path/to/accounts.json:/app/accounts.json \
  blomp-activater

# View logs
docker logs -f blomp-activater
```

To change the schedule, edit the cron lines in the `Dockerfile`.

## Setup

1. Copy `accounts.example.json` → `accounts.json`
2. Fill in your real credentials (this file is gitignored)

## License

MIT
