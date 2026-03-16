FROM node:18-alpine

# install FFmpeg — this is the key line
RUN apk add --no-cache ffmpeg

WORKDIR /app

COPY package*.json ./
RUN npm install

# copy prisma schema and generate client
COPY prisma ./prisma
RUN npx prisma generate

COPY . .

RUN npm run build

CMD ["npm", "start"]