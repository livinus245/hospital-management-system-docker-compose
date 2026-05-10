FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .

ARG APP_DIR
ENV NODE_ENV=production
WORKDIR /app/${APP_DIR}

CMD ["node", "src/index.js"]
