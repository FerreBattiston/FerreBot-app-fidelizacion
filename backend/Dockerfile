FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY db ./db

EXPOSE 3001

CMD ["node", "src/index.js"]
