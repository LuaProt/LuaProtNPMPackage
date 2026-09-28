# LuaProt

The official LuaProt API client for Node.js, with JavaScript and TypeScript support. No runtime dependencies. Requires Node.js 20 or newer.

```sh
npm install luaprot
```

```ts
import LuaProt from "luaprot";

const luaProt = new LuaProt({
  apiKey: process.env.LUAPROT_API_KEY!,
});

const result = await luaProt.whitelist("123456789012345678", "hub-id");
console.log(result.key.key);

const status = await luaProt.getStatus();
console.log(status.validToken);
```

In JavaScript, pass your API key as a string without TypeScript's `!` assertion. CommonJS works too:

```js
const LuaProt = require("luaprot");
const luaProt = new LuaProt({ apiKey: process.env.LUAPROT_API_KEY });
```

Run the client in your server application. Your API key has account-level access; your application is responsible for authenticating callers and checking their permissions.

## Configuration

The constructor takes one object:

| Option | Default | Purpose |
| --- | --- | --- |
| `apiKey` | Required | LuaProt API key, sent in the Authorization header |
| `baseUrl` | `https://luaprot.net` | API origin, optionally including a path prefix |
| `timeout` | `30000` | Request timeout in milliseconds |
| `discordId` | None | Default caller for `info()`, `redeemKey()` and `getScript()` |
| `scriptUrl` | None | Default HTTPS script URL for `getScript()` |
| `scripts` | `{}` | Named script configurations shown below |
| `blockAdvertiseKeys` | `false` | Reject advertisement keys in `redeemKey()` |

## Commands

Methods follow the Discord bot's command names and argument order. `user` is a Discord ID string or mention, never a JavaScript number. Optional positional arguments can be skipped with `undefined`.

| Discord command | Method and arguments |
| --- | --- |
| `/api-status` | `apiStatus()`; also available as `getStatus()` |
| `/whitelist` | `whitelist(user, hub?, days?, hours?, minutes?, note?)` |
| `/remove-whitelist` | `removeWhitelist(user)` |
| `/mass-whitelist` | `massWhitelist(users, hub, time?, note?, limitedScripts?)` |
| `/generate-keys` | `generateKeys(hub, amount, time?, note?, limitedScripts?)` |
| `/bulk-delete-keys` | `bulkDeleteKeys(keys)` |
| `/info` | `info(user?, key?)` |
| `/redeem-key` | `redeemKey(key, user?)` |
| `/get-script` | `getScript(script?, user?)` |
| `/reset-hwid` | `resetHwid(user)` |
| `/freeze-key` | `freezeKey(query)` |
| `/unfreeze-key` | `unfreezeKey(query)` |
| `/set-note` | `setNote(query, note)` |
| `/compensate` | `compensate(query, time, includeAdvertise?)` |
| `/compensate-all` | `compensateAll(time, includeAdvertise?)` |
| `/get-keys` | `getKeys(hub?, page?, key?, user?, hwid?, note?, state?, exact?)` |
| `/blacklist` | `blacklist(user?, hwid?, key?, hub?, reason?)` |
| `/remove-blacklist` | `removeBlacklist(user?, hwid?, key?, hub?, id?)` |
| `/get-blacklists` | `getBlacklists(hub, hwid?)` |
| `/clear-blacklists` | `clearBlacklists(hub)` |
| `/get-sessions` | `getSessions(key?, user?, hub?)` |
| `/session-info` | `sessionInfo(sessionId)` |
| `/message-session` | `messageSession(sessionId, message)` |
| `/disconnect-session` | `disconnectSession(sessionId)` |
| `/message-sessions` | `messageSessions(message, key?, hub?)` |
| `/disconnect-sessions` | `disconnectSessions(key?, hub?)` |
| `/storage list\|get\|create\|update\|delete` | `storage(action, hub, options?)` |

`getHubs()` lists accessible hubs. `getStats(hub?)` fetches the statistics used by the bot's statistics channels.

The client performs LuaProt operations. It does not assign Discord roles, send DMs/webhooks, or create channels. `/setup`, `/send-panel`, `/auto-role-update`, `/booster-config`, and `/stats-channels` configure the Discord bot and have no client method. For mass whitelisting, pass the role members' Discord IDs in place of the bot's role argument. Methods that use the invoking Discord user accept an explicit `user` argument or the constructor's `discordId`.

### Keys and durations

- `whitelist()` uses the first accessible hub when `hub` is omitted. No duration means no expiry. Days, hours and minutes are whole numbers.
- `generateKeys()` accepts 5–300 keys. Its `time` and `massWhitelist()`'s `time` are hours, at least 1, including fractional hours. Omit time for no expiry.
- Compensation accepts durations like `2h`, `1d 6h`, `30m`, or `1w`, with a minimum of one minute. `includeAdvertise` defaults to `false`.
- `query` accepts a key, Discord ID, mention, `key:...`, or `id:...`. Use `key:` for a numeric key.
- `info()` accepts either `user` or `key`. `info(undefined, "license-key")` searches by key even when a default user is configured.
- Notes are limited to 100 characters; blacklist reasons to 60. Lists accept arrays or comma/whitespace-separated strings, with duplicates removed.
- Key states are `active`, `expired`, `blacklisted`, or `unassigned`; page defaults to 1.
- `getKeys()` accepts a final `exact` argument, default `false`. Set it to `true` to match complete, case-sensitive hub names/IDs, keys, Discord IDs, HWIDs, and notes. Empty filters are ignored. This argument is not published yet.
- `blacklist()` accepts exactly one user/HWID/key target. A missing hub applies to all matching accessible hubs. `removeBlacklist()` also accepts `hubId|type:entryId`, where type is `key`, `local`, or `global`.
- Session messages are limited to 100 characters. Bulk session actions require either a key or a hub. `getSessions()` accepts a hub or a key/user query.

```js
await luaProt.whitelist("123456789012345678", "hub-id", 7);
const exactKey = await luaProt.getKeys(undefined, 1, "YOUR_KEY", undefined, undefined, undefined, undefined, true);
await luaProt.generateKeys("hub-id", 10, 24, "Trial", ["script-id"]);
await luaProt.compensate("id:123456789012345678", "1d 6h");
await luaProt.messageSessions("Update available", undefined, "hub-id");
```

### Storage

Storage subcommands share `storage(action, hub, options)`. Options retain the API's camelCase names: `valueId`, `key`, `hwid`, `id`, `value`, `type`, `originalValueId`, `originalKey`, `originalHwid`.

```js
await luaProt.storage("list", "hub-id");
await luaProt.storage("create", "hub-id", {
  valueId: "autoFarm",
  key: "license-key",
  value: false,
});
const entry = await luaProt.storage("get", "hub-id", {
  valueId: "autoFarm",
  key: "license-key",
});
```

`valueId` is required except for `list`. Exact reads and writes require a key or HWID; free-for-all storage uses `key: "x"` with an HWID. Deletion can use an internal `id`. Updates default the original target to the destination; pass `original*` fields to move an entry.

Values can be strings, numbers, or booleans. Unlike Discord's text inputs, native values preserve their types, including `false`, `0`, and `""`. To convert text, set `type` to `string`, `number`, or `boolean`. Strings are limited to 4,000 characters.

### Scripts

Named scripts replace the bot's saved panel configuration. Names are case-insensitive.

```js
const luaProt = new LuaProt({
  apiKey: process.env.LUAPROT_API_KEY,
  scripts: {
    Example: { hubId: "hub-id", scriptUrl: "https://example.com/loader.lua" },
    Inline: { hubId: "hub-id", script: 'lp_key="{key}";\nprint("ready")' },
  },
});
const result = await luaProt.getScript("Example", "123456789012345678");
console.log(result.script);
```

`getScript()` looks up the user's key and returns `{ success, hubId, key, script }`. It substitutes `{key}` in inline scripts or prepends `lp_key` when there is no placeholder. It builds loader text without executing it. With no script name, it uses `scriptUrl` and the user's first matching key.

### Results and errors

Single requests return the API's parsed JSON directly. HTTP, API, timeout and network failures throw `LuaProtError`. Invalid arguments throw `TypeError`.

```js
import { LuaProtError } from "luaprot";

try {
  await luaProt.getStatus();
} catch (error) {
  if (error instanceof LuaProtError) {
    console.error(error.message, error.status);
  }
}
```

Errors contain `status` (0 for transport/client errors) and `response` (API JSON when available). Historical `succcess` responses are normalized to `success`. Requests are not retried automatically, and redirects are not followed.

Multi-hub changes return `{ success, results }`. Each result contains `hubId`, `success`, and either `data` or `error`. Overall success is false if any hub fails. They are not transactional: inspect every result before retrying an operation. Lookup failures stop the operation before writes begin.

## Development

```sh
npm install
npm test
npm run check
npm pack
```

Packing runs the tests and TypeScript checks. Tests use a local HTTP server, never a live LuaProt account. Keep `test/contracts.json` identical to `pip-package/tests/contracts.json` when updating either client.

For release, authenticate with `npm login` and publish the reviewed archive with `npm publish luaprot-2.0.0.tgz`. Version 2 adds the client class while keeping the named `constants` export and `constants/state` import.
