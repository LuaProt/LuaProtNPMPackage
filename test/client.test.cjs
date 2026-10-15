const assert = require("node:assert/strict");
const { createServer } = require("node:http");
const { once } = require("node:events");
const { test, before, after } = require("node:test");
const LuaProt = require("luaprot");
const contracts = require("./contracts.json");

let server;
let baseUrl;
let pending = [];
let errors = [];

before(async () => {
  server = createServer(async (request, response) => {
    try {
      const expected = pending.shift();
      assert.ok(expected, "Unexpected request");
      const url = new URL(request.url, baseUrl);
      let raw = "";
      for await (const chunk of request) raw += chunk;
      assert.equal(request.method, expected.method);
      assert.equal(url.pathname, expected.path);
      assert.deepEqual(Object.fromEntries(url.searchParams), expected.query);
      assert.deepEqual(raw ? JSON.parse(raw) : null, expected.body);
      assert.equal(request.headers.authorization, "test-api-key");
      response.writeHead(expected.status, { "Content-Type": "application/json" });
      response.end(expected.raw ?? JSON.stringify(expected.response));
    } catch (error) {
      errors.push(error);
      response.writeHead(500);
      response.end(JSON.stringify({ success: false, message: "Unexpected request" }));
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));

for (const contract of contracts) {
  test(contract.name, async () => {
    pending = [...contract.requests];
    errors = [];
    const client = new LuaProt({ apiKey: "test-api-key", baseUrl, ...contract.options });
    if (contract.error) {
      await assert.rejects(async () => client[contract.method](...contract.args), (error) => {
        assert.ok(error instanceof LuaProt.LuaProtError);
        assert.equal(error.status, contract.error.status);
        assert.equal(error.message, contract.error.message);
        return true;
      });
    } else {
      const result = await client[contract.method](...contract.args);
      if (contract.expected) assert.deepEqual(result, contract.expected);
      else assert.equal(result.success, true);
    }
    assert.deepEqual(errors, []);
    assert.equal(pending.length, 0, "Missing requests");
  });
}

test("CommonJS and ESM use the same class and constants", async () => {
  const esm = await import("luaprot");
  assert.equal(esm.default, LuaProt);
  assert.equal(esm.LuaProt, LuaProt);
  assert.equal(esm.LuaProtError, LuaProt.LuaProtError);
  assert.equal(esm.constants.STATE.ENABLED, 1);
  assert.equal(require("luaprot/constants/state").STATE.DISABLED_BY_LP, -1);
});

test("invalid arguments fail before any request", async () => {
  pending = [];
  errors = [];
  const client = new LuaProt({ apiKey: "test-api-key", baseUrl });
  const invalid = [
    ["whitelist", [123, "hub"]], ["whitelist", ["123456789012345678", "hub", -1]],
    ["whitelist", ["123456789012345678", "hub", 0.5]],
    ["generateKeys", ["hub", 1]], ["generateKeys", ["hub", 301]],
    ["generateKeys", ["hub", 5, Infinity]], ["massWhitelist", [[], "hub"]],
    ["bulkDeleteKeys", [[]]], ["compensateAll", ["1h junk"]],
    ["compensateAll", ["30s"]], ["compensateAll", ["-1h"]],
    ["compensateAll", ["1h", false, []]], ["compensateAll", ["1h", false, " , "]],
    ["messageSessions", ["hello"]], ["messageSessions", ["hello", "license-key", "hub"]],
    ["disconnectSessions", ["license-key", "hub"]], ["getSessions", ["license-key", undefined, "hub"]],
    ["messageSession", ["session", "x".repeat(101)]],
    ["messageSession", ["session", "😀".repeat(51)]],
    ["blacklist", ["123456789012345678", "hwid"]],
    ["blacklist", [undefined, "hwid", undefined, undefined, "x".repeat(61)]],
    ["sessionInfo", [".."]], ["getKeys", [undefined, 0]],
    ...[0, 26, 200, 1001, 25.5, "25", null, true].map((limit) =>
      ["getKeys", [undefined, 1, undefined, undefined, undefined, undefined, undefined, false, limit]]
    ),
    ["storage", ["create", "hub", { valueId: "flag", key: "x", value: false }]],
    ["storage", ["create", "hub", { valueId: "flag", key: "license-key", value: {} }]],
    ["storage", ["create", "hub", { valueId: "flag", key: "license-key", value: NaN }]],
    ["storage", ["get", "hub", { valueId: "flag" }]],
  ];
  for (const [method, args] of invalid) {
    await assert.rejects(async () => client[method](...args), TypeError, method);
  }
  assert.deepEqual(errors, []);
});

test("credentials are not enumerable and configuration is validated", () => {
  const client = new LuaProt({ apiKey: "secret-value" });
  assert.equal(JSON.stringify(client), "{}");
  assert.throws(() => new LuaProt({ apiKey: "" }), TypeError);
  assert.throws(() => new LuaProt({ apiKey: "test", baseUrl: "ftp://example.com" }), TypeError);
  assert.throws(() => new LuaProt({ apiKey: "test", baseUrl: "https://user:pass@example.com" }), TypeError);
  assert.throws(() => new LuaProt({ apiKey: "test", timeout: 0 }), TypeError);
});

test("timeouts fail without retrying", async () => {
  let count = 0;
  const slow = createServer((_request, response) => {
    count++;
    setTimeout(() => response.end('{"success":true}'), 100);
  });
  slow.listen(0, "127.0.0.1");
  await once(slow, "listening");
  try {
    const client = new LuaProt({ apiKey: "test", baseUrl: `http://127.0.0.1:${slow.address().port}`, timeout: 25 });
    await assert.rejects(client.getStatus(), (error) => error instanceof LuaProt.LuaProtError && error.status === 0 && error.message.includes("timed out"));
    assert.ok(count <= 1);
  } finally {
    slow.closeAllConnections();
    await new Promise((resolve) => slow.close(resolve));
  }
});

test("redirects cannot forward credentials", async () => {
  let count = 0;
  const redirect = createServer((_request, response) => {
    count++;
    response.writeHead(302, { Location: "/unexpected" });
    response.end('{"success":false}');
  });
  redirect.listen(0, "127.0.0.1");
  await once(redirect, "listening");
  try {
    const client = new LuaProt({ apiKey: "test", baseUrl: `http://127.0.0.1:${redirect.address().port}` });
    await assert.rejects(client.getStatus(), LuaProt.LuaProtError);
    assert.equal(count, 1);
  } finally {
    await new Promise((resolve) => redirect.close(resolve));
  }
});
