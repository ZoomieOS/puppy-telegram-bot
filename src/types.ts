export type ScheduleItem = {
  id: string;
  time: string;
  text: string;
  weekdays?: number[];
  from?: string;
  to?: string;
};

export type SpecialEvent = {
  id: string;
  date: string;
  time: string;
  text: string;
};

export type BotState = {
  chatIds: number[];
  pausedChatIds: number[];
  sentKeys: string[];
};
