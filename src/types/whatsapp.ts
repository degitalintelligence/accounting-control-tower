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
  session?: string;
  webhookUrl?: string;
  webhookToken?: string;
  engine: "WEBJS" | "GOWS";
};

export type WahaGroup = {
  id?: string;
  groupMetadata?: {
    id?: WahaSerializedId;
    subject?: string;
    participants?: WahaParticipant[];
    name?: string;
  };
  name?: string;
  subject?: string;
  title?: string;
  groupId?: string;
  addressingMode?: string;
};

export type WahaGroupCollection = WahaGroup[] | { groups?: WahaGroup[] } | Record<string, WahaGroup>;

export type WahaSerializedId = {
  user?: string;
  server?: string;
  _serialized?: string;
};

export type WahaParticipant = {
  id?: string | WahaSerializedId;
  lid?: string;
  phone?: string;
  displayName?: string;
  name?: string;
  isAdmin?: boolean;
  isSuperAdmin?: boolean;
};
