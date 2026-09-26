FROM node:20-alpine AS deps
WORKDIR /app
# openssl serve a Prisma per generare il motore corretto (OpenSSL 3 su Alpine)
RUN apk add --no-cache openssl
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# Stage "migrate": include la CLI Prisma e lo schema per le migrazioni in prod.
FROM deps AS migrate
WORKDIR /app
COPY prisma ./prisma
CMD ["npx", "prisma", "migrate", "deploy"]

FROM node:20-alpine AS build
WORKDIR /app
# openssl serve a Prisma per riconoscere la versione corretta del motore (e quindi agli script del servizio "tools")
RUN apk add --no-cache openssl
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
# Senza questo Next.js si mette in ascolto solo sul nome interno del contenitore
# e non è raggiungibile dagli altri servizi (Caddy) né dal controllo di salute.
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
# libssl: necessaria al motore di Prisma a runtime
RUN apk add --no-cache openssl
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
