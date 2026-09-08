import LuaProt = require("luaprot");

const client = new LuaProt({ apiKey: "test" });
const alias = new LuaProt.LuaProt({ apiKey: "test" });
const status: Promise<LuaProt.StatusResponse> = client.getStatus();
const error: Error = new LuaProt.LuaProtError("test", 400);
const disabled: number = LuaProt.constants.STATE.DISABLED;
void [alias, status, error, disabled];

// @ts-expect-error unknown key state
client.getKeys(undefined, 1, undefined, undefined, undefined, undefined, "unknown");
