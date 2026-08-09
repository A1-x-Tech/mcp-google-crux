import { test } from "node:test";
import assert from "node:assert/strict";
import { registerRecordTools } from "./records.js";
import { CruxNoDataError } from "../types.js";

type Args = Record<string, unknown>;
type Handler = (args: Args) => Promise<{ content: { text: string }[]; isError?: boolean }>;

/** Fake server + fake client so the tool handlers run without network. */
function harness(opts: { throwOn?: string; error?: Error } = {}) {
  const calls: { method: string; params: unknown }[] = [];
  const make = (method: string) => async (params: unknown) => {
    calls.push({ method, params });
    if (opts.throwOn === method) throw opts.error ?? new Error("boom");
    return { record: { key: {} } };
  };
  const client = {
    queryRecord: make("queryRecord"),
    queryHistoryRecord: make("queryHistoryRecord"),
  };
  const tools: Record<string, Handler> = {};
  const server = {
    registerTool: (name: string, _cfg: unknown, handler: Handler) => {
      tools[name] = handler;
    },
  };
  registerRecordTools(server as never, client as never);
  return { calls, tools };
}

test("registers the two raw record tools", () => {
  const { tools } = harness();
  assert.deepEqual(Object.keys(tools).sort(), ["query_history_record", "query_record"]);
});

test("query_record forwards normalized params to client.queryRecord", async () => {
  const { calls, tools } = harness();
  await tools.query_record({
    origin: "https://example.com",
    form_factor: "phone",
    metrics: ["largest_contentful_paint"],
  });
  assert.equal(calls[0].method, "queryRecord");
  assert.deepEqual(calls[0].params, {
    origin: "https://example.com",
    url: undefined,
    formFactor: "phone",
    metrics: ["largest_contentful_paint"],
  });
});

test("query_history_record maps collection_period_count to collectionPeriodCount", async () => {
  const { calls, tools } = harness();
  await tools.query_history_record({ url: "https://example.com/page/", collection_period_count: 40 });
  assert.equal(calls[0].method, "queryHistoryRecord");
  assert.deepEqual(calls[0].params, {
    origin: undefined,
    url: "https://example.com/page/",
    formFactor: undefined,
    metrics: undefined,
    collectionPeriodCount: 40,
  });
});

test("a 404 no-data answer becomes a normal {no_data: true} result", async () => {
  const { tools } = harness({ throwOn: "queryRecord", error: new CruxNoDataError({}) });
  const res = await tools.query_record({ origin: "https://tiny.example" });
  assert.equal(res.isError, undefined, "no data must not be reported as a failure");
  const body = JSON.parse(res.content[0].text);
  assert.equal(body.no_data, true);
  assert.match(body.reason, /No CrUX data/);
});

test("a client error is returned as an isError result, not thrown", async () => {
  const { tools } = harness({ throwOn: "queryHistoryRecord" });
  const res = await tools.query_history_record({ origin: "https://example.com" });
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /boom/);
});
