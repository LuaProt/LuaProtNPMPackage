declare class LuaProt {
  constructor(options: LuaProt.Options);
  getHubs(): Promise<LuaProt.HubsResponse>;
  apiStatus(): Promise<LuaProt.StatusResponse>;
  getStatus(): Promise<LuaProt.StatusResponse>;
  getStats(hub?: string): Promise<LuaProt.ApiResponse>;
  whitelist(user: string, hub?: string, days?: number, hours?: number, minutes?: number, note?: string): Promise<LuaProt.KeyResponse>;
  generateKeys(hub: string, amount: number, time?: number, note?: string, limitedScripts?: string | string[]): Promise<LuaProt.GeneratedKeysResponse>;
  massWhitelist(users: string | string[], hub: string, time?: number, note?: string, limitedScripts?: string | string[]): Promise<LuaProt.ApiResponse>;
  bulkDeleteKeys(keys: string | string[]): Promise<LuaProt.ApiResponse>;
  info(user?: string, key?: string): Promise<LuaProt.FindResponse>;
  removeWhitelist(user: string): Promise<LuaProt.BatchResponse>;
  resetHwid(user: string): Promise<LuaProt.BatchResponse>;
  freezeKey(query: string): Promise<LuaProt.BatchResponse>;
  unfreezeKey(query: string): Promise<LuaProt.BatchResponse>;
  setNote(query: string, note: string): Promise<LuaProt.BatchResponse>;
  compensate(query: string, time: string, includeAdvertise?: boolean): Promise<LuaProt.BatchResponse>;
  compensateAll(time: string, includeAdvertise?: boolean, keys?: string | string[]): Promise<LuaProt.ApiResponse>;
  redeemKey(key: string, user?: string): Promise<LuaProt.ApiResponse>;
  getScript(script?: string, user?: string): Promise<LuaProt.ApiResponse & { hubId: string; key: string; script: string }>;
  getKeys(hub?: string, page?: number, key?: string, user?: string, hwid?: string, note?: string, state?: LuaProt.KeyState, exact?: boolean, limit?: LuaProt.KeyLimit): Promise<LuaProt.KeysResponse>;
  blacklist(user?: string, hwid?: string, key?: string, hub?: string, reason?: string): Promise<LuaProt.ApiResponse | LuaProt.BatchResponse>;
  removeBlacklist(user?: string, hwid?: string, key?: string, hub?: string, id?: string): Promise<LuaProt.ApiResponse | LuaProt.BatchResponse>;
  getBlacklists(hub: string, hwid?: string): Promise<LuaProt.ApiResponse>;
  clearBlacklists(hub: string): Promise<LuaProt.ApiResponse>;
  getSessions(key?: string, user?: string, hub?: string): Promise<LuaProt.SessionsResponse>;
  sessionInfo(sessionId: string): Promise<LuaProt.SessionResponse>;
  messageSession(sessionId: string, message: string): Promise<LuaProt.ApiResponse>;
  disconnectSession(sessionId: string): Promise<LuaProt.ApiResponse>;
  messageSessions(message: string, key?: string, hub?: string): Promise<LuaProt.ApiResponse>;
  disconnectSessions(key?: string, hub?: string): Promise<LuaProt.ApiResponse>;
  storage(action: "list", hub: string, options?: LuaProt.StorageTarget): Promise<LuaProt.StorageResponse>;
  storage(action: "get" | "delete", hub: string, options: LuaProt.StorageTarget & { valueId: string }): Promise<LuaProt.StorageResponse>;
  storage(action: "create" | "update", hub: string, options: LuaProt.StorageWrite): Promise<LuaProt.StorageResponse>;
}

declare namespace LuaProt {
  const LuaProt: typeof import("./index");
  class LuaProtError extends Error {
    constructor(message: string, status?: number, response?: ApiResponse | null);
    status: number;
    response: ApiResponse | null;
  }
  const constants: { STATE: { ENABLED: number; DISABLED: number; DISABLED_BY_LP: number } };
  interface Options {
    apiKey: string;
    baseUrl?: string;
    timeout?: number;
    discordId?: string;
    scriptUrl?: string;
    scripts?: Record<string, { hubId: string; scriptUrl?: string; script?: string }>;
    blockAdvertiseKeys?: boolean;
  }
  interface ApiResponse { success: boolean; message?: string; [key: string]: unknown; }
  interface Hub { id?: string; hubId?: string; name?: string; [key: string]: unknown; }
  interface Key {
    key: string;
    discordId?: string | null;
    hubId?: string;
    expire?: number;
    note?: string;
    hwid?: string;
    blacklisted?: boolean;
    frozen?: boolean;
    limitedScripts?: string[];
    [key: string]: unknown;
  }
  interface HubsResponse extends ApiResponse { hubs: Hub[]; }
  interface KeyResponse extends ApiResponse { key: Key; }
  interface KeysResponse extends ApiResponse { keys: Key[]; totalKeys?: number; totalPages?: number; limitPerPage?: KeyLimit; }
  interface GeneratedKeysResponse extends ApiResponse { keys: string[]; }
  interface StatusResponse extends ApiResponse { status?: string; version?: string | null; active?: boolean; validToken?: boolean; warnings?: Array<string | Record<string, unknown>>; }
  interface FindResponse extends ApiResponse { found: Array<{ hubId: string; hub: Hub; key: Key }>; }
  interface BatchResponse extends ApiResponse {
    results: Array<{
      hubId: string;
      success: boolean;
      data?: ApiResponse;
      error?: { message: string; status: number; response: ApiResponse | null };
    }>;
  }
  interface Session { id?: string; sessionId?: string; key?: string; hubId?: string; scriptId?: string; [key: string]: unknown; }
  interface SessionsResponse extends ApiResponse { sessions: Session[]; }
  interface SessionResponse extends ApiResponse { session?: Session; }
  type KeyState = "active" | "expired" | "blacklisted" | "unassigned";
  type KeyLimit = 25 | 50 | 100 | 1000;
  type StorageValue = string | number | boolean;
  interface StorageTarget { valueId?: string; key?: string; hwid?: string; id?: string; }
  interface StorageWrite extends StorageTarget {
    valueId: string;
    value: StorageValue;
    type?: "string" | "number" | "boolean";
    originalValueId?: string;
    originalKey?: string;
    originalHwid?: string;
  }
  interface StorageEntry extends StorageTarget { data?: StorageValue; preview?: string; dataType?: string; sizeBytes?: number; }
  interface StorageResponse extends ApiResponse { entry?: StorageEntry; entries?: StorageEntry[]; totalEntries?: number; totalBytes?: number; }
}

export = LuaProt;
