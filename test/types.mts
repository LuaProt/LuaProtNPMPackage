import LuaProt, { LuaProtError, constants, type Options } from "luaprot";

const options: Options = { apiKey: "test", timeout: 1000 };
const client = new LuaProt(options);
const key = await client.whitelist("123456789012345678", "hub");
const value: string = key.key.key;
const result: LuaProt.BatchResponse = await client.freezeKey("key:license-key");
const enabled: number = constants.STATE.ENABLED;
const error: Error = new LuaProtError("test", 400);
await client.storage("create", "hub", { key: value, valueId: "flag", value: false });
await client.getScript("demo", "123456789012345678");
const keyPage = await client.getKeys("hub", 1, undefined, undefined, undefined, undefined, undefined, false, 1000);
const limit: LuaProt.KeyLimit | undefined = keyPage.limitPerPage;
void limit;
void [result, enabled, error];

// @ts-expect-error API key is required
new LuaProt({});
// @ts-expect-error Discord IDs must be strings
client.whitelist(123);
// @ts-expect-error create requires a value
client.storage("create", "hub", { valueId: "flag", key: "license-key" });
// @ts-expect-error unknown storage command
client.storage("remove", "hub");
// @ts-expect-error unsupported key limit
client.getKeys(undefined, 1, undefined, undefined, undefined, undefined, undefined, false, 200);
