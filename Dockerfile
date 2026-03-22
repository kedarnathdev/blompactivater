FROM mcr.microsoft.com/playwright:v1.52.0-noble

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY index.js ./

# accounts.json mounted at runtime:
#   docker run -v ./accounts.json:/app/accounts.json ...
CMD ["node", "index.js"]
