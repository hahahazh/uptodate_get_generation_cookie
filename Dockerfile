FROM ghcr.io/puppeteer/puppeteer:latest

# Báo cho Puppeteer biết không cần tải lại Chrome (đã có sẵn trong Docker image gốc)
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

WORKDIR /usr/src/app

COPY --chown=pptruser:pptruser package*.json ./
RUN npm install

COPY --chown=pptruser:pptruser . .

CMD ["node", "server.js"]
