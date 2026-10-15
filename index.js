const constants = require("./constants/state");

class LuaProtError extends Error {
  constructor(message, status = 0, response = null) {
    super(message);
    this.name = "LuaProtError";
    this.status = status;
    this.response = response;
  }
}

function text(value, name, max = Infinity) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) {
    throw new TypeError(`${name} must be a non-empty string${max < Infinity ? ` of at most ${max} characters` : ""}.`);
  }
  return value.trim();
}

function discordId(value) {
  const match = text(value, "user").match(/^(?:<@!?(\d{15,30})>|(\d{15,30}))$/);
  if (!match) throw new TypeError("user must be a Discord ID or mention.");
  return match[1] || match[2];
}

function list(value, name) {
  const values = typeof value === "string" ? value.split(/[,\s]+/).filter(Boolean) : value;
  if (!Array.isArray(values) || !values.length) throw new TypeError(`${name} cannot be empty.`);
  return [...new Set(values.map((item) => text(item, name)))];
}

function number(value, name, min = 0, max = Number.MAX_SAFE_INTEGER, integer = false) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
    throw new TypeError(`${name} must be ${integer ? "an integer" : "a number"} between ${min} and ${max}.`);
  }
  return value;
}

function duration(value) {
  const input = text(value, "time").toLowerCase();
  const units = { y: 31536000, mo: 2592000, w: 604800, d: 86400, h: 3600, min: 60, m: 60, s: 1 };
  let total = 0;
  let end = 0;
  for (const match of input.matchAll(/(\d+(?:\.\d+)?)\s*(mo|min|[ywdhms])/g)) {
    if (input.slice(end, match.index).trim()) throw new TypeError("Invalid duration.");
    total += Number(match[1]) * units[match[2]];
    end = match.index + match[0].length;
  }
  if (!end || input.slice(end).trim()) throw new TypeError("Invalid duration.");
  return number(Math.floor(total), "time in seconds", 60);
}

function keyTarget(query) {
  const raw = text(query, "query");
  const input = raw.replace(/^(key:|id:)\s*/i, "").trim();
  if (/^id:/i.test(raw) || (!/^key:/i.test(raw) && /^(?:<@!?\d{15,30}>|\d{15,30})$/.test(input))) {
    return { discordId: discordId(input) };
  }
  if (input.length < 6) throw new TypeError("key must contain at least 6 characters.");
  return { key: input };
}

function segment(value, name) {
  const result = text(value, name);
  if (result === "." || result === "..") throw new TypeError(`Invalid ${name}.`);
  return encodeURIComponent(result);
}

class LuaProt {
  #apiKey;
  #baseUrl;
  #timeout;
  #discordId;
  #scriptUrl;
  #scripts;
  #blockAdvertiseKeys;

  constructor({ apiKey, baseUrl = "https://luaprot.net", timeout = 30000, discordId: user, scriptUrl, scripts = {}, blockAdvertiseKeys = false } = {}) {
    this.#apiKey = text(apiKey, "apiKey");
    const url = new URL(baseUrl);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
      throw new TypeError("baseUrl must be an HTTP(S) URL without credentials, query, or fragment.");
    }
    this.#baseUrl = url.href.replace(/\/$/, "");
    this.#timeout = number(timeout, "timeout", 1, 2147483647, true);
    this.#discordId = user == null ? undefined : discordId(user);
    this.#scriptUrl = scriptUrl;
    this.#scripts = scripts;
    if (typeof blockAdvertiseKeys !== "boolean") throw new TypeError("blockAdvertiseKeys must be a boolean.");
    this.#blockAdvertiseKeys = blockAdvertiseKeys;
  }

  async #request(method, path, query = {}, body) {
    const url = new URL(`${this.#baseUrl}${path}`);
    for (const [key, rawValue] of Object.entries(query)) {
      const value = typeof rawValue === "string" ? rawValue.trim() : rawValue;
      if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
    }
    let response;
    let raw;
    try {
      response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", Authorization: this.#apiKey },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.#timeout),
        redirect: "error",
      });
      raw = await response.text();
    } catch (error) {
      throw new LuaProtError(error?.name === "TimeoutError" || error?.name === "AbortError" ? "LuaProt request timed out." : "LuaProt request failed.");
    }
    let data;
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      throw new LuaProtError(`Non-JSON response (${response.status}).`, response.status);
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new LuaProtError("Invalid API response.", response.status);
    }
    const success = data.success ?? data.succcess;
    if (!response.ok || !success) {
      throw new LuaProtError(data.message || `LuaProt API error (${response.status}).`, response.status, data);
    }
    return { ...data, success: true };
  }

  async #find(target, hub) {
    const hubs = hub ? [{ id: text(hub, "hub") }] : (await this.getHubs()).hubs;
    if (!Array.isArray(hubs)) throw new LuaProtError("Invalid hubs response.");
    const found = [];
    for (const item of hubs) {
      const hubId = String(item.hubId ?? item.id ?? item._id ?? item.hubID ?? "");
      if (!hubId) throw new LuaProtError("Hub response is missing its ID.");
      try {
        const data = await this.#request("GET", `/api/v1/hubs/${segment(hubId, "hub")}/keys/info`, target);
        if (!data.key || typeof data.key.key !== "string") throw new LuaProtError("Invalid key response.");
        found.push({ hubId, hub: item, key: data.key });
      } catch (error) {
        if (!(error instanceof LuaProtError && error.status === 400 && error.response?.message === "Key could not be found.")) throw error;
      }
    }
    return found;
  }

  async #change(target, method, route, body, hub) {
    const found = await this.#find(target, hub);
    if (!found.length) throw new LuaProtError("No keys found.");
    const results = [];
    for (const item of found) {
      try {
        const data = await this.#request(method, `/api/${route === "update" ? "v2" : "v1"}/hubs/${segment(item.hubId, "hub")}/${route === "hwid/reset" ? route : `keys/${route}`}`, target, body);
        results.push({ hubId: item.hubId, success: true, data });
      } catch (error) {
        if (!(error instanceof LuaProtError)) throw error;
        results.push({ hubId: item.hubId, success: false, error: { message: error.message, status: error.status, response: error.response } });
      }
    }
    return { success: results.every((item) => item.success), results };
  }

  getHubs() {
    return this.#request("GET", "/api/v1/hubs/get");
  }

  apiStatus() {
    return this.#request("GET", "/api/v1/status/get");
  }

  getStatus() {
    return this.apiStatus();
  }

  getStats(hub) {
    return this.#request("GET", "/api/v1/stats/get", { hubId: hub });
  }

  async whitelist(user, hub, days = 0, hours = 0, minutes = 0, note) {
    const body = { discordId: discordId(user) };
    const expire = number(days, "days", 0, Number.MAX_SAFE_INTEGER, true) * 86400 + number(hours, "hours", 0, Number.MAX_SAFE_INTEGER, true) * 3600 + number(minutes, "minutes", 0, Number.MAX_SAFE_INTEGER, true) * 60;
    if (expire) body.expire = number(expire, "expire", 1);
    if (note != null) body.note = text(note, "note", 100);
    if (!hub) {
      const data = await this.getHubs();
      const first = data.hubs?.[0];
      hub = first?.hubId ?? first?.id ?? first?._id ?? first?.hubID;
      if (!hub) throw new LuaProtError("No hubs available.");
    }
    return this.#request("POST", `/api/v2/hubs/${segment(hub, "hub")}/keys/add`, {}, body);
  }

  generateKeys(hub, amount, time, note, limitedScripts) {
    const body = { amount: number(amount, "amount", 5, 300, true) };
    if (time != null) body.expire = number(Math.floor(number(time, "time", 1) * 3600), "expire", 1);
    if (note != null) body.note = text(note, "note", 100);
    if (limitedScripts != null) body.limitedScripts = list(limitedScripts, "limitedScripts");
    return this.#request("POST", `/api/v2/hubs/${segment(hub, "hub")}/keys/generate`, {}, body);
  }

  massWhitelist(users, hub, time, note, limitedScripts) {
    const ids = [...new Set(list(users, "users").map(discordId))];
    if (ids.length > 5000) throw new TypeError("At most 5000 users can be whitelisted at once.");
    const body = { discordIds: ids };
    if (time != null) body.expire = number(Math.floor(number(time, "time", 1) * 3600), "expire", 1);
    if (note != null) body.note = text(note, "note", 100);
    if (limitedScripts != null) body.limitedScripts = list(limitedScripts, "limitedScripts");
    return this.#request("POST", `/api/v1/hubs/${segment(hub, "hub")}/keys/mass-whitelist`, {}, body);
  }

  bulkDeleteKeys(keys) {
    return this.#request("POST", "/api/v1/keys/bulk-delete", {}, list(keys, "keys"));
  }

  async info(user, key) {
    if (user == null && !key) user = this.#discordId;
    if (user && key) throw new TypeError("Provide either user or key.");
    const found = await this.#find(key ? { key: text(key, "key") } : { discordId: discordId(user) });
    return { success: true, found };
  }

  removeWhitelist(user) {
    return this.#change({ discordId: discordId(user) }, "DELETE", "delete");
  }

  resetHwid(user) {
    return this.#change({ discordId: discordId(user) }, "PATCH", "hwid/reset");
  }

  freezeKey(query) {
    return this.#change(keyTarget(query), "PATCH", "update", { frozen: true });
  }

  unfreezeKey(query) {
    return this.#change(keyTarget(query), "PATCH", "update", { frozen: false });
  }

  setNote(query, note) {
    return this.#change(keyTarget(query), "PATCH", "update", { note: text(note, "note", 100) });
  }

  compensate(query, time, includeAdvertise = false) {
    if (typeof includeAdvertise !== "boolean") throw new TypeError("includeAdvertise must be a boolean.");
    return this.#change(keyTarget(query), "PATCH", "compensate", { expire: duration(time), includeAdvertise });
  }

  compensateAll(time, includeAdvertise = false, keys) {
    if (typeof includeAdvertise !== "boolean") throw new TypeError("includeAdvertise must be a boolean.");
    return this.#request("POST", "/api/v1/keys/compensate-all", {}, { expire: duration(time), includeAdvertise, ...(keys != null ? { keys: list(keys, "keys") } : {}) });
  }

  async redeemKey(key, user = this.#discordId) {
    key = text(key, "key");
    const id = discordId(user);
    const found = (await this.#find({ key })).filter((item) => item.key.key === key);
    if (found.length !== 1) throw new LuaProtError(found.length ? "Multiple matching keys found." : "Key not found.");
    const item = found[0];
    if (item.key.discordId || item.key.discord_id || item.key.discord || item.key.discordID) throw new LuaProtError("Key is already linked to a Discord account.");
    if (item.key.blacklisted === true) throw new LuaProtError("Blacklisted keys cannot be redeemed.");
    if (this.#blockAdvertiseKeys && item.key.advertiseId) throw new LuaProtError("Advertisement-generated keys cannot be redeemed.");
    return this.#request("PATCH", `/api/v2/hubs/${segment(item.hubId, "hub")}/keys/update`, { key }, { discordId: id });
  }

  async getScript(script, user = this.#discordId) {
    const id = discordId(user);
    let source = { scriptUrl: this.#scriptUrl };
    if (script) {
      const name = text(script, "script").toLowerCase();
      source = Object.entries(this.#scripts).find(([key]) => key.trim().toLowerCase() === name)?.[1];
      if (!source) throw new LuaProtError("Unknown script.");
      text(source.hubId, "hubId");
    }
    if (!source.script && !source.scriptUrl) throw new LuaProtError("No script is configured.");
    if (!source.script) {
      const url = new URL(source.scriptUrl);
      if (url.protocol !== "https:") throw new TypeError("scriptUrl must use HTTPS.");
    }
    const found = await this.#find({ discordId: id }, source.hubId);
    if (!found.length) throw new LuaProtError("No keys found.");
    const key = found[0].key.key;
    const escaped = key.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r/g, "\\r").replace(/\n/g, "\\n");
    const loader = source.script
      ? source.script.includes("{key}") ? source.script.replaceAll("{key}", escaped) : `lp_key="${escaped}";\n${source.script}`
      : `lp_key="${escaped}";\nloadstring(game:HttpGet(${JSON.stringify(source.scriptUrl)}))()`;
    return { success: true, hubId: found[0].hubId, key, script: loader };
  }

  getKeys(hub, page = 1, key, user, hwid, note, state, exact = false, limit = 25) {
    if (typeof exact !== "boolean") throw new TypeError("exact must be a boolean.");
    if (![25, 50, 100, 1000].includes(limit)) throw new TypeError("limit must be 25, 50, 100, or 1000.");
    if (state && !["active", "expired", "blacklisted", "unassigned"].includes(state)) throw new TypeError("Invalid key state.");
    return this.#request("GET", "/api/v1/keys/fetch", {
      hub, page: number(page, "page", 1, Number.MAX_SAFE_INTEGER, true), key,
      discordId: user ? discordId(user) : undefined, hwid, note,
      ...(state ? { [state]: true } : {}),
      ...(exact ? { exact: true } : {}),
      ...(limit !== 25 ? { limit } : {}),
    });
  }

  blacklist(user, hwid, key, hub, reason = "No reason provided.") {
    if ([user, hwid, key].filter(Boolean).length !== 1) throw new TypeError("Provide exactly one of user, hwid, or key.");
    reason = text(reason, "reason", 60);
    if (hwid) return this.#request("POST", "/api/v1/blacklists/hwid", {}, { hwid: text(hwid, "hwid"), reason, ...(hub ? { hubId: hub } : {}) });
    return this.#change(user ? { discordId: discordId(user) } : { key: text(key, "key") }, "PATCH", "update", { blacklisted: true, blacklistReason: reason }, hub);
  }

  removeBlacklist(user, hwid, key, hub, id) {
    if (id) {
      const match = text(id, "id").match(/^([^|]+)\|(key|local|global):(.+)$/i);
      if (!match) throw new TypeError("id must use hubId|type:entryId format.");
      return this.#request("DELETE", `/api/v1/hubs/${segment(match[1], "hub")}/blacklists/delete`, { type: match[2].toLowerCase(), id: match[3].trim() });
    }
    if (hwid) return this.#request("DELETE", "/api/v1/blacklists/hwid", { hwid: text(hwid, "hwid"), hubId: hub });
    return this.#change(key ? { key: text(key, "key") } : { discordId: discordId(user) }, "PATCH", "update", { blacklisted: false }, hub);
  }

  getBlacklists(hub, hwid) {
    return this.#request("GET", `/api/v1/hubs/${segment(hub, "hub")}/blacklists/get`, { hwid });
  }

  clearBlacklists(hub) {
    return this.#request("DELETE", `/api/v1/hubs/${segment(hub, "hub")}/blacklists/clear`);
  }

  getSessions(key, user, hub) {
    if ((!key && !user && !hub) || (hub && (key || user))) throw new TypeError("Provide a hub or a key/user query.");
    if (key && text(key, "key").length < 6) throw new TypeError("key must contain at least 6 characters.");
    return this.#request("GET", "/api/v1/sessions/get", { key, discordId: user ? discordId(user) : undefined, hubId: hub });
  }

  sessionInfo(sessionId) {
    return this.#request("GET", `/api/v1/sessions/${segment(sessionId, "sessionId")}/info`);
  }

  messageSession(sessionId, message) {
    return this.#request("POST", `/api/v1/sessions/message/${segment(sessionId, "sessionId")}`, {}, { message: text(message, "message", 100) });
  }

  disconnectSession(sessionId) {
    return this.#request("DELETE", `/api/v1/sessions/disconnect/${segment(sessionId, "sessionId")}`);
  }

  messageSessions(message, key, hub) {
    if (Boolean(key) === Boolean(hub)) throw new TypeError("Provide either key or hub.");
    if (key && text(key, "key").length < 6) throw new TypeError("key must contain at least 6 characters.");
    return this.#request("POST", "/api/v1/sessions/messageall", {}, { ...(hub ? { hubId: text(hub, "hub") } : { key: text(key, "key") }), message: text(message, "message", 100) });
  }

  disconnectSessions(key, hub) {
    if (Boolean(key) === Boolean(hub)) throw new TypeError("Provide either key or hub.");
    if (key && text(key, "key").length < 6) throw new TypeError("key must contain at least 6 characters.");
    return this.#request("DELETE", "/api/v1/sessions/disconnectall", hub ? { hubId: text(hub, "hub") } : { key: text(key, "key") });
  }

  storage(action, hub, options = {}) {
    let { valueId, key, hwid, value, type, originalValueId, originalKey, originalHwid, id } = options;
    valueId = valueId == null ? undefined : text(valueId, "valueId", 128);
    key = key == null || key === "" ? undefined : text(key, "key", 128);
    hwid = hwid == null || hwid === "" ? undefined : text(hwid, "hwid", 180);
    const target = { hubId: text(hub, "hub"), valueId, key, hwid };
    if (!["list", "get", "create", "update", "delete"].includes(action)) throw new TypeError("Invalid storage action.");
    if (action !== "list" && text(valueId, "valueId", 128).length < 4) throw new TypeError("valueId must contain at least 4 characters.");
    if (action === "list" || action === "get") {
      if (action === "get" && !hwid && (!key || key === "x")) throw new TypeError("Storage get requires a key or HWID.");
      return this.#request("GET", "/api/v2/storage", { ...target, ...(action === "get" ? { exact: "1" } : {}) });
    }
    if (action === "delete") {
      if (!id && !hwid && (!key || key === "x")) throw new TypeError("Storage delete requires an ID, key, or HWID.");
      return this.#request("DELETE", "/api/v2/storage", { ...target, id });
    }
    if (!hwid && (!key || key === "x")) throw new TypeError("Storage writes require a key or HWID.");
    let data = value;
    if (type === "number") {
      if (typeof value !== "string" && typeof value !== "number") throw new TypeError("Invalid number.");
      data = number(Number(value), "value", -Number.MAX_VALUE, Number.MAX_VALUE);
    } else if (type === "boolean") {
      const normalized = String(value).trim().toLowerCase();
      if (!["true", "1", "yes", "y", "false", "0", "no", "n"].includes(normalized)) throw new TypeError("Invalid boolean.");
      data = ["true", "1", "yes", "y"].includes(normalized);
    } else if (type === "string") {
      if (!["string", "number", "boolean"].includes(typeof value)) throw new TypeError("Invalid storage value.");
      data = String(value);
    } else if (type != null) throw new TypeError("Invalid storage type.");
    if (!["string", "number", "boolean"].includes(typeof data) || (typeof data === "number" && !Number.isFinite(data))) throw new TypeError("Storage value must be a string, number, or boolean.");
    if (typeof data === "string" && data.length > 4000) throw new TypeError("Storage value must be at most 4000 characters.");
    const body = { ...target, data };
    if (action === "update") {
      Object.assign(body, { originalValueId: originalValueId ?? valueId, originalKey: originalKey ?? key, originalHwid: originalHwid ?? hwid });
      if (!body.originalHwid && (!body.originalKey || body.originalKey === "x")) throw new TypeError("Storage update requires an original key or HWID.");
    }
    return this.#request(action === "create" ? "POST" : "PATCH", "/api/v2/storage", {}, body);
  }
}

module.exports = LuaProt;
module.exports.LuaProt = LuaProt;
module.exports.LuaProtError = LuaProtError;
module.exports.constants = constants;

// hi guys
