# Puppy Telegram Bot — Railway + MongoDB

Telegram-бот с напоминаниями о кормлении, туалете, прогулках, дрессировке и вакцинации щенка.

## Что уже подготовлено

- long polling через Telegraf;
- постоянная работа как Railway service;
- MongoDB вместо локального `state.json`;
- Dockerfile;
- `/health` endpoint;
- автоматический restart при сбое;
- команды `/start`, `/today`, `/pause`, `/resume`, `/status`;
- часовой пояс `Europe/Warsaw`.

## Локальный запуск

```bash
npm install
cp .env.example .env
npm run dev
```

В `.env`:

```env
BOT_TOKEN=токен_от_BotFather
TIMEZONE=Europe/Warsaw
MONGODB_URI=mongodb://localhost:27017/puppy_bot
MONGODB_DB=puppy_bot
PORT=3000
```

## Деплой на Railway

### 1. Создай Telegram-бота

В Telegram открой `@BotFather`, выполни `/newbot` и сохрани токен.

### 2. Загрузи проект на GitHub

```bash
git init
git add .
git commit -m "Railway puppy bot"
git branch -M main
git remote add origin https://github.com/USERNAME/puppy-telegram-bot.git
git push -u origin main
```

Файл `.env` не коммить.

### 3. Создай Railway project

1. Нажми **New Project**.
2. Выбери **Deploy from GitHub repo**.
3. Выбери репозиторий бота.

Railway автоматически использует `Dockerfile` и `railway.json`.

### 4. Добавь MongoDB

На Project Canvas нажми:

```text
+ New → Database → MongoDB
```

После создания MongoDB открой сервис бота → **Variables** и добавь:

```env
BOT_TOKEN=токен_от_BotFather
TIMEZONE=Europe/Warsaw
MONGODB_DB=puppy_bot
MONGODB_URI=${{MongoDB.MONGO_URL}}
```

Если MongoDB-сервис называется иначе, выбери `MONGO_URL` через autocomplete Railway вместо ручного ввода ссылки.

`PORT` добавлять не нужно: Railway передаст его автоматически.

### 5. Примени изменения

Нажми **Deploy** или **Apply changes**.

В логах должны появиться строки:

```text
Health server запущен на порту ...
MongoDB подключена. Database: puppy_bot
Puppy bot запущен. Timezone: Europe/Warsaw
```

### 6. Запусти уведомления

Открой бота в Telegram и отправь:

```text
/start
```

Проверка:

```text
/status
/today
```

## Healthcheck

Railway проверяет:

```text
/health
```

Ожидаемый ответ:

```json
{"status":"ok","timezone":"Europe/Warsaw"}
```

## Изменение нормы корма

В `src/config.ts`:

```ts
export const DAILY_FOOD_GRAMS = 240;
```

Бот автоматически делит суточную норму на пять кормлений.

## Важно

MongoDB в Railway — отдельный оплачиваемый по использованию сервис. Для этого небольшого бота объём данных минимальный, но расход MongoDB и бота суммируется в биллинге проекта.
