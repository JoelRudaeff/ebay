FROM node:20-alpine

RUN apk add --no-cache tini
WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY src ./src

USER node
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/index.js"]
