FROM ghcr.io/puppeteer/puppeteer:latest
WORKDIR /usr/src/app

COPY --chown=pptruser:pptruser package*.json ./
RUN npm install

COPY --chown=pptruser:pptruser . .

CMD ["node", "server.js"]
