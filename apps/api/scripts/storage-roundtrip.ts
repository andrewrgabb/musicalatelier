/**
 * Dev verification: proves a file round-trips through object storage using
 * ONLY presigned URLs (no bytes through this process other than the test
 * fetches standing in for a browser).
 *
 * Run with backing services up:  pnpm --filter @musical-atelier/api verify:storage
 */
import { presignDownload, presignUpload } from "../src/lib/storage.js";

async function main() {
  const key = `roundtrip-test/${Date.now()}.txt`;
  const body = `hello from the storage round-trip test @ ${new Date().toISOString()}`;

  // 1) Get a presigned PUT URL and upload directly to storage (as a browser would).
  const uploadUrl = await presignUpload(key, "text/plain");
  const put = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "text/plain" },
    body,
  });
  if (!put.ok) throw new Error(`upload failed: HTTP ${put.status}`);
  console.log(`✓ uploaded ${key} via presigned PUT`);

  // 2) Get a presigned GET URL and download it back.
  const downloadUrl = await presignDownload(key);
  const get = await fetch(downloadUrl);
  if (!get.ok) throw new Error(`download failed: HTTP ${get.status}`);
  const roundTripped = await get.text();
  console.log(`✓ downloaded ${key} via presigned GET`);

  // 3) Confirm the bytes match.
  if (roundTripped !== body) {
    throw new Error("round-trip mismatch: downloaded body != uploaded body");
  }
  console.log("✓ round-trip OK — bytes match. Storage presigning works.");
}

main().catch((err) => {
  console.error("✗ storage round-trip FAILED:", err);
  process.exit(1);
});
