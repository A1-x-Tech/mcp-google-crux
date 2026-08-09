import { test } from "node:test";
import assert from "node:assert/strict";
import { fail, formFactorField, isNoData, noDataResult, ok, originField, READ_ONLY } from "./util.js";
import { CruxError, CruxNoDataError } from "../types.js";

test("ok emits compact JSON; fail flags isError", () => {
  assert.equal((ok({ a: 1 }).content[0] as { text: string }).text, '{"a":1}');
  const f = fail(new Error("boom"));
  assert.equal(f.isError, true);
  assert.match((f.content[0] as { text: string }).text, /boom/);
});

test("fail appends the underlying cause when present", () => {
  const err = new Error("timeout", { cause: new Error("ECONNRESET") });
  const f = fail(err);
  assert.match((f.content[0] as { text: string }).text, /timeout \(ECONNRESET\)/);
});

test("fail scrubs an API key riding in a ?key= query parameter", () => {
  const f = fail(new Error("request to https://chromeuxreport.googleapis.com/v1/records:queryRecord?key=SECRET123 failed"));
  const text = (f.content[0] as { text: string }).text;
  assert.ok(!text.includes("SECRET123"), "the key value must be scrubbed");
  assert.match(text, /\?key=\*\*\*/);
});

test("noDataResult wraps a 404 as a normal (non-error) structured result", () => {
  const err = new CruxNoDataError({ error: { code: 404, status: "NOT_FOUND" } });
  assert.ok(isNoData(err));
  assert.ok(!isNoData(new CruxError(400, {})));
  const res = noDataResult(err);
  assert.equal(res.isError, undefined, "no data is not a failure");
  const body = JSON.parse((res.content[0] as { text: string }).text);
  assert.equal(body.no_data, true);
  assert.match(body.reason, /No CrUX data/);
});

test("schema factories return independent schemas (no $ref dedup)", () => {
  assert.notEqual(originField(), originField());
  assert.notEqual(formFactorField(), formFactorField());
});

test("originField accepts an https origin and rejects junk", () => {
  const schema = originField();
  assert.equal(schema.safeParse("https://example.com").success, true);
  assert.equal(schema.safeParse("example.com").success, false);
  assert.equal(schema.safeParse(undefined).success, true); // optional
});

test("READ_ONLY sets all four hints", () => {
  assert.deepEqual(READ_ONLY, {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  });
});
