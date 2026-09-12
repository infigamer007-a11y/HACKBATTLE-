FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG NEXT_PUBLIC_BACKEND_HTTP_URL=https://truevoice-backend-1mh1.onrender.com
ARG NEXT_PUBLIC_BACKEND_WS_URL=wss://truevoice-backend-1mh1.onrender.com
ARG BACKEND_HTTP_ORIGIN=https://truevoice-backend-1mh1.onrender.com
ENV NEXT_PUBLIC_BACKEND_HTTP_URL=$NEXT_PUBLIC_BACKEND_HTTP_URL
ENV NEXT_PUBLIC_BACKEND_WS_URL=$NEXT_PUBLIC_BACKEND_WS_URL
ENV BACKEND_HTTP_ORIGIN=$BACKEND_HTTP_ORIGIN

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next

EXPOSE 3000

CMD ["npm", "run", "start"]
