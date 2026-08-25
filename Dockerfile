# syntax=docker/dockerfile:1

############################  Зависимости  ############################
FROM node:22.12-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

##############################  Сборка  ###############################
FROM node:22.12-alpine AS builder
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Значения нужны только для прохождения сборки — реальные подставляются в рантайме
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URI=postgres://build:build@localhost:5432/build
ENV PAYLOAD_SECRET=build-time-placeholder-secret-value

RUN npm run build

# Замер собирается в один файл ради запуска в боевом контейнере.
#
# В рантайм-образе нет ни исходников, ни tsx, ни devDependencies — там
# только собранное приложение. А замер прода надо делать на проде: со своей
# машины против прод-базы меряется канал до неё, и на сценариях в двадцать
# миллисекунд задержка сети и будет всем результатом.
#
# Пакеты остаются внешними (--packages=external): бандлится только наш код,
# а зависимости берутся из node_modules, который Next кладёт в standalone.
# Собирать их внутрь значило бы дублировать в образе то, что в нём уже есть.
RUN npm run bench:bundle

##############################  Рантайм  ##############################
FROM node:22.12-alpine AS runner
RUN apk add --no-cache libc6-compat
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV MEDIA_DIR=/app/media

RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs \
 && mkdir -p /app/media && chown -R nextjs:nodejs /app

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Замер лежит рядом с приложением и сам по себе ничего не делает: он
# запускается руками через docker exec и пишет отчёт во временный каталог.
# Ручки наружу у него нет — открытый маршрут замера означал бы, что нагрузить
# боевую базу может кто угодно, кто узнал адрес.
COPY --from=builder --chown=nextjs:nodejs /app/dist/bench.mjs ./bench.mjs

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/healthz/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
