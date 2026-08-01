export type WahaMessage = {
  id?: string;
  _data?: {
    id?: { _serialized?: string; id?: string };
    notifyName?: string;
    body?: string;
    type?: string;
    t?: number;
    from?: string;
    author?: string;
    chatId?: string;
  };
  body?: string;
  type?: string;
  timestamp?: number;
  from?: string;
  author?: string;
  chatId?: string;
  fromMe?: boolean;
  hasMedia?: boolean;
  media?: Record<string, unknown> | null;
};

export type WahaWebhookPayload = {
  event?: string;
  session?: string;
  payload?: WahaMessage;
};

export type WahaConfig = {
  baseUrl: string;
  apiKey?: string;
  session: string;
};
