import { ConfigError, loadConfig } from "./config.js";
import { CruxClient } from "./client.js";
import { CredentialsError } from "./types.js";

/**
 * Live READ-ONLY smoke check: pulls the latest LCP record for a high-traffic
 * origin (guaranteed to have CrUX data). Needs CRUX_API_KEY.
 */
async function main(): Promise<void> {
  const client = new CruxClient(loadConfig());
  const origin = process.argv[2] ?? "https://www.google.com";
  const result = await client.queryRecord({
    origin,
    metrics: ["largest_contentful_paint"],
  });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  // A missing key is a user error, not a bug: report it without the stack.
  const userError = err instanceof ConfigError || err instanceof CredentialsError;
  console.error("smoke failed:", userError ? err.message : err);
  process.exit(1);
});
