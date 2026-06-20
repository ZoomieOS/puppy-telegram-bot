import { MongoClient, type Collection } from "mongodb";
import type { BotState } from "./types.js";

const initialState: BotState = {
  chatIds: [],
  pausedChatIds: [],
  sentKeys: []
};

type StateDocument = BotState & { _id: "singleton" };

let client: MongoClient | undefined;
let collection: Collection<StateDocument> | undefined;

async function getCollection(): Promise<Collection<StateDocument>> {
  if (collection) return collection;

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI не задан. Добавь MongoDB-сервис и reference variable в Railway.");
  }

  client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 10_000
  });
  await client.connect();

  const dbName = process.env.MONGODB_DB ?? "puppy_bot";
  collection = client.db(dbName).collection<StateDocument>("bot_state");

  await collection.updateOne(
    { _id: "singleton" },
    { $setOnInsert: { _id: "singleton", ...initialState } },
    { upsert: true }
  );

  console.log(`MongoDB подключена. Database: ${dbName}`);
  return collection;
}

export async function loadState(): Promise<BotState> {
  const states = await getCollection();
  const document = await states.findOne({ _id: "singleton" });

  return {
    chatIds: document?.chatIds ?? [],
    pausedChatIds: document?.pausedChatIds ?? [],
    sentKeys: document?.sentKeys ?? []
  };
}

export async function saveState(state: BotState): Promise<void> {
  const states = await getCollection();
  await states.updateOne(
    { _id: "singleton" },
    {
      $set: {
        chatIds: state.chatIds,
        pausedChatIds: state.pausedChatIds,
        sentKeys: state.sentKeys.slice(-500)
      }
    },
    { upsert: true }
  );
}

export async function closeStateStore(): Promise<void> {
  await client?.close();
}
