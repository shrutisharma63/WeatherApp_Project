# Build stage
FROM node:18-alpine as build

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

RUN npm run build

# Production stage
FROM node:18-alpine

WORKDIR /app

COPY --from=build /app/dist/my-angular-mysoundappclone /app/dist

COPY --from=build /app/package*.json ./

RUN npm ci --only=production

EXPOSE 4000

CMD ["node", "dist/server/server.mjs"]
