# Племенная книга — прототип

Информационная система учёта племенной ценности КРС голштинской породы.
Прототип с рабочей логикой: авторизация, ролевой доступ, поиск с фильтрами,
импорт/экспорт данных, карточка животного с оценкой и экстерьером.

## Стек

| Слой | Технология |
| --- | --- |
| Фронтенд | Next.js 16.3 (App Router, Turbopack), React 19.2 |
| Стили | Tailwind CSS v4, шрифт Onest (@fontsource) |
| Бэкенд / CMS | Payload CMS 3.85 (в том же процессе Next.js) |
| БД | PostgreSQL 16 (`@payloadcms/db-postgres`, Drizzle) |
| Деплой | Docker (`output: standalone`), Timeweb Cloud |

## Экраны

| Маршрут | Что это |
| --- | --- |
| `/` | Племенная книга — просмотр анонимом, поиск и расширенный фильтр |
| `/login`, `/register` | Вход и регистрация в 4 шага |
| `/account` | Личный кабинет: `?tab=profile\|animals\|events\|documents\|settings` |
| `/animals/[id]` | Карточка животного: `?tab=general\|evaluation\|origin\|documents\|media` |
| `/analytics`, `/auctions` | Разделы под замком для анонимов |
| `/admin` | Административная панель Payload |
| `/api`, `/api/graphql` | REST и GraphQL API |

## Быстрый старт (локально)

```bash
cp .env.example .env          # пропишите DATABASE_URI и PAYLOAD_SECRET
npm install
npm run generate:types        # типы Payload → src/payload-types.ts
npm run seed                  # демо-данные: 181 животное, 7 организаций, 5 пользователей
npm run dev
```

Демо-доступы после `npm run seed`:

| Роль | Логин | Пароль |
| --- | --- | --- |
| Фермер (ЗАО «Назаровское») | `farmer@nazarovskoe.ru` | `plemkniga123` |
| Администратор Ассоциации | `admin@holstein-russia.ru` | `plemkniga123` |
| Сервисная организация | `service@sc-volga.ru` | `plemkniga123` |

> `npm run seed` **очищает** коллекции animals / herds / users / organizations / events / documents.

## Запуск в Docker

```bash
cp .env.example .env
echo "PAYLOAD_SECRET=$(openssl rand -base64 32)" >> .env
docker compose up -d --build
```

Приложение — на `http://localhost:3000`, база — во внутренней сети Compose
(наружу порт не публикуется). Медиафайлы и данные БД лежат в томах `media` и `pgdata`.

## Деплой на Timeweb Cloud

Есть два рабочих сценария.

### 1. Приложение из Git (рекомендуется)

1. Запушьте репозиторий в GitHub / GitLab.
2. Timeweb Cloud → **Приложения** → *Создать* → тип **Docker**, укажите репозиторий
   и ветку. Dockerfile в корне подхватится автоматически.
3. Timeweb Cloud → **Базы данных** → создайте **PostgreSQL 16**. Скопируйте строку
   подключения; для внешнего подключения добавьте `?sslmode=verify-full`
   (или `?sslmode=require`, если сертификат не устанавливаете).
4. В переменных окружения приложения задайте:

   | Переменная | Значение |
   | --- | --- |
   | `DATABASE_URI` | строка подключения из панели |
   | `PAYLOAD_SECRET` | `openssl rand -base64 32` |
   | `NEXT_PUBLIC_SERVER_URL` | `https://<ваш-домен>` |
   | `PAYLOAD_DB_PUSH` | `true` при первом запуске, затем `false` |
   | `PORT` | `3000` |

5. Первый деплой создаст схему БД (`push: true`). После этого переключите
   `PAYLOAD_DB_PUSH=false` и работайте через миграции.
6. Домен и бесплатный TLS — в разделе «Домены» приложения.

### 2. Облачный сервер + docker compose

```bash
ssh root@<ip>
git clone <repo> /opt/plemkniga && cd /opt/plemkniga
cp .env.example .env && nano .env       # PAYLOAD_SECRET, NEXT_PUBLIC_SERVER_URL
docker compose up -d --build
```

Дальше — nginx или Caddy как reverse-proxy на порт 3000 и сертификат Let's Encrypt.

### Важно про хранение медиа

Локальный диск контейнера в облаке эфемерен. Для продакшена подключите
S3 Timeweb Cloud вместо `staticDir`:

```bash
npm i @payloadcms/storage-s3
```

```ts
// payload.config.ts
import { s3Storage } from '@payloadcms/storage-s3'

plugins: [
  s3Storage({
    collections: { media: true },
    bucket: process.env.S3_BUCKET!,
    config: {
      endpoint: 'https://s3.twcstorage.ru',
      region: 'ru-1',
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY!,
        secretAccessKey: process.env.S3_SECRET_KEY!,
      },
    },
  }),
]
```

## Модель данных

```
organizations ──< herds ──< animals >── users (author)
                              │
                              ├──< events
                              └──< documents ──> media
```

`animals` содержит вкладки:

* **Общие данные** — идентификация, владелец, стадо, флаги публичности;
* **Оценка** — ИПЦ, продуктивные признаки, воспроизводство, здоровье
  (каждый признак = `прогноз` + `R,%`), 18 линейных признаков экстерьера и 3 композита;
* **Фенотип** — сводка для таблицы поиска и массив лактаций;
* **Происхождение** — связи `father` / `mother` + текстовая родословная, инбридинг.

### Правила доступа

| Кто | Что видит |
| --- | --- |
| Аноним | животные с `publicVisible = true`; карточка открывается только при `publicDetails = true` |
| Авторизованный | своя организация полностью + чужие публичные записи |
| Администратор | всё |

Владелец управляет этими флагами в **Личный кабинет → Настройки** —
переключатель применяется сразу ко всему стаду.

## Импорт и экспорт

* **Импорт** (`Личный кабинет → Мои животные → Загрузить данные`) — CSV с разделителем `;`.
  Распознаются колонки: `Инд.№`, `Кличка`, `Пол`, `Дата рождения`, `Удой, л`,
  `Жир, %`, `Белок, %`, `Жир, кг`, `Белок, кг`, `ИПЦ`.
  Существующие животные обновляются по `Инд.№`, чужие записи пропускаются.
* **Экспорт** — `GET /account/export?format=csv|json`, только животные своей организации.

## Полезные команды

```bash
npm run dev                 # разработка
npm run build && npm start  # прод-сборка
npm run generate:types      # перегенерировать src/payload-types.ts после правки коллекций
npm run generate:importmap  # после добавления кастомных компонентов в админку
npm run payload migrate:create
npm run payload migrate
```

## Что осталось за рамками прототипа

* Расчёт ИПЦ (сейчас значения загружаются извне или генерируются сидом).
* Аукционы, аналитические дашборды с графиками, генерация PDF-свидетельств.
* Реальные фотографии — в hero-блоках стоят векторные заглушки
  (`src/components/CowIllustration.tsx`), замена на `<Image />` из `/public`.
* Почтовый адаптер (подтверждение e-mail, восстановление пароля).
