import "dotenv/config";
import { createServer } from "node:http";
import { DateTime } from "luxon";
import { Telegraf } from "telegraf";
import { dailySchedule, phaseMessages, PLAN_END, PLAN_START, specialEvents } from "./config.js";
import { closeStateStore, loadState, saveState } from "./state.js";
import type { BotState, ScheduleItem } from "./types.js";

const token = process.env.BOT_TOKEN;
const timezone = process.env.TIMEZONE ?? "Europe/Warsaw";
const port = Number(process.env.PORT ?? 3000);

if (!token) {
  throw new Error("BOT_TOKEN не найден. Скопируй .env.example в .env и добавь токен.");
}

const bot = new Telegraf(token);

const healthServer = createServer((request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ status: "ok", timezone }));
    return;
  }

  response.writeHead(404, { "content-type": "application/json" });
  response.end(JSON.stringify({ error: "not_found" }));
});

healthServer.listen(port, "0.0.0.0", () => {
  console.log(`Health server запущен на порту ${port}`);
});

let state: BotState = await loadState();

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function inRange(date: string, item: ScheduleItem): boolean {
  return (!item.from || date >= item.from) && (!item.to || date <= item.to);
}

function isPlanActive(date: string): boolean {
  return date >= PLAN_START && date <= PLAN_END;
}

function todayItems(now: DateTime): Array<{ time: string; text: string }> {
  const date = now.toISODate()!;
  const weekday = now.weekday;

  const regular = isPlanActive(date)
    ? dailySchedule.filter((item) =>
        inRange(date, item) &&
        (!item.weekdays || item.weekdays.includes(weekday))
      )
    : [];

  const phases = phaseMessages.filter((item) => inRange(date, item));
  const specials = specialEvents.filter((item) => item.date === date);

  return [...regular, ...phases, ...specials]
    .map(({ time, text }) => ({ time, text }))
    .sort((a, b) => a.time.localeCompare(b.time));
}

async function registerChat(chatId: number): Promise<void> {
  state.chatIds = unique([...state.chatIds, chatId]);
  state.pausedChatIds = state.pausedChatIds.filter((id) => id !== chatId);
  await saveState(state);
}

bot.start(async (ctx) => {
  await registerChat(ctx.chat.id);
  await ctx.reply(
    [
      "🐶 Напоминания включены.",
      `Часовой пояс: ${timezone}.`,
      `Основной план: ${PLAN_START} — ${PLAN_END}.`,
      "Отдельные напоминания о прививке запланированы до 14 июля.",
      "",
      "Команды:",
      "/today — расписание на сегодня",
      "/pause — приостановить уведомления",
      "/resume — возобновить",
      "/status — состояние бота"
    ].join("\n")
  );
});

bot.command("today", async (ctx) => {
  const now = DateTime.now().setZone(timezone);
  const items = todayItems(now);
  const date = now.toFormat("dd.LL.yyyy");

  if (items.length === 0) {
    await ctx.reply(`На ${date} напоминаний нет.`);
    return;
  }

  await ctx.reply(
    [`📅 План на ${date}:`, ...items.map((item) => `${item.time} — ${item.text}`)].join("\n\n")
  );
});

bot.command("pause", async (ctx) => {
  state.pausedChatIds = unique([...state.pausedChatIds, ctx.chat.id]);
  await saveState(state);
  await ctx.reply("⏸ Уведомления приостановлены. Команда /resume включит их снова.");
});

bot.command("resume", async (ctx) => {
  await registerChat(ctx.chat.id);
  await ctx.reply("▶️ Уведомления снова включены.");
});

bot.command("status", async (ctx) => {
  const enabled =
    state.chatIds.includes(ctx.chat.id) &&
    !state.pausedChatIds.includes(ctx.chat.id);

  await ctx.reply(
    [
      enabled ? "✅ Уведомления включены." : "⏸ Уведомления выключены.",
      `Часовой пояс: ${timezone}`,
      `Основной план: ${PLAN_START} — ${PLAN_END}`,
      "Ветеринар: 23.06.2026",
      "Ориентировочная прививка от бешенства: 14.07.2026"
    ].join("\n")
  );
});

async function sendToActiveChats(text: string): Promise<void> {
  const activeChatIds = state.chatIds.filter(
    (chatId) => !state.pausedChatIds.includes(chatId)
  );

  for (const chatId of activeChatIds) {
    try {
      await bot.telegram.sendMessage(chatId, text);
    } catch (error) {
      console.error(`Не удалось отправить сообщение в chat ${chatId}:`, error);
    }
  }
}

async function schedulerTick(): Promise<void> {
  const now = DateTime.now().setZone(timezone);
  const date = now.toISODate()!;
  const time = now.toFormat("HH:mm");
  const weekday = now.weekday;
  const jobs: Array<{ key: string; text: string }> = [];

  if (isPlanActive(date)) {
    for (const item of dailySchedule) {
      const allowedWeekday = !item.weekdays || item.weekdays.includes(weekday);
      if (item.time === time && inRange(date, item) && allowedWeekday) {
        jobs.push({
          key: `${date}:${item.id}`,
          text: item.text
        });
      }
    }
  }

  for (const item of phaseMessages) {
    if (item.time === time && inRange(date, item)) {
      jobs.push({
        key: `${date}:${item.id}`,
        text: item.text
      });
    }
  }

  for (const event of specialEvents) {
    if (event.date === date && event.time === time) {
      jobs.push({
        key: `${date}:${event.id}`,
        text: event.text
      });
    }
  }

  for (const job of jobs) {
    if (state.sentKeys.includes(job.key)) continue;

    await sendToActiveChats(job.text);
    state.sentKeys.push(job.key);

    // Не даём файлу состояния бесконечно расти.
    state.sentKeys = state.sentKeys.slice(-500);
    await saveState(state);
  }
}

setInterval(() => {
  schedulerTick().catch((error) => console.error("Ошибка планировщика:", error));
}, 30_000);

await schedulerTick();

bot.catch((error) => {
  console.error("Ошибка Telegram-бота:", error);
});

await bot.launch();
console.log(`Puppy bot запущен. Timezone: ${timezone}`);

const shutdown = async (signal: string) => {
  console.log(`Получен ${signal}, бот останавливается.`);
  bot.stop(signal);
  healthServer.close();
  await closeStateStore();
};

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
