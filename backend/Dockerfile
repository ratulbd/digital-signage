FROM node:20-slim

WORKDIR /app

RUN apt-get update -y && apt-get install -y openssl curl ffmpeg

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY . .
RUN npm run build

EXPOSE 3001

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
