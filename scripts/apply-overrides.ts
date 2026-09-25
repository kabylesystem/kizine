import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { imageOverrides } from "../src/data/image-overrides";
import { migrate, rawDb } from "../src/db/client";

const UA = "cuisine-app/0.4 (personal; opensource@example.com)";
const OUT = join(process.cwd(), "public", "food");
const THUMB = 900;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

await migrate();
const conn = rawDb();
const assetStmt = conn.prepare(
  "INSERT OR REPLACE INTO image_assets (id, path, width, height, source, license, attribution, source_url, dominant) VALUES (?,?,?,?,?,?,?,?,?)",
);
const linkStmt = conn.prepare("UPDATE food_concepts SET image_id = ? WHERE id = ?");

let ok = 0;
for (const [id, fileName] of Object.entries(imageOverrides)) {
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("format", "json");
  url.searchParams.set("titles", `File:${fileName}`);
  url.searchParams.set("prop", "imageinfo");
  url.searchParams.set("iiprop", "url|size|extmetadata");
  url.searchParams.set("iiurlwidth", String(THUMB));
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  const data = (await res.json()) as { query?: { pages?: Record<string, { imageinfo?: Record<string, unknown>[] }> } };
  const ii = data.query?.pages ? Object.values(data.query.pages)[0]?.imageinfo?.[0] : undefined;
  if (!ii?.["thumburl"]) {
    console.log(`  introuvable : ${id} ← ${fileName}`);
    continue;
  }
  const bin = await fetch(String(ii["thumburl"]), { headers: { "User-Agent": UA } });
  const buf = Buffer.from(await bin.arrayBuffer());
  if (buf.length < 12000) {
    console.log(`  refusé : ${id}`);
    continue;
  }
  writeFileSync(join(OUT, `${id}.jpg`), buf);
  const meta = (ii["extmetadata"] ?? {}) as Record<string, { value: string }>;
  const strip = (x?: string) => (x ? x.replace(/<[^>]*>/g, "").trim().slice(0, 160) : undefined);
  const assetId = `food:${id}`;
  await assetStmt.run(
    assetId,
    `/food/${id}.jpg`,
    THUMB,
    null,
    "wikimedia",
    strip(meta["LicenseShortName"]?.value) ?? "Wikimedia Commons",
    strip(meta["Artist"]?.value) ?? "Wikimedia Commons",
    `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(fileName)}`,
    null,
  );
  await linkStmt.run(assetId, id);
  ok++;
  console.log(`  ${id.padEnd(18)} ← ${fileName}`);
  await sleep(200);
}
console.log(`\n${ok} images posées à la main`);

/** Filet de sécurité : toute carte qui a un fichier doit avoir son lien en base. */
const orphans = await conn
  .prepare("SELECT id FROM food_concepts WHERE swipeable = 1 AND image_id IS NULL")
  .all() as unknown as { id: string }[];
for (const o of orphans) {
  const path = join(OUT, `${o.id}.jpg`);
  if (!(await import("node:fs")).existsSync(path)) continue;
  const assetId = `food:${o.id}`;
  await assetStmt.run(assetId, `/food/${o.id}.jpg`, THUMB, null, "wikimedia", "Wikimedia Commons", "Wikimedia Commons", null, null);
  await linkStmt.run(assetId, o.id);
  console.log(`  lien réparé : ${o.id}`);
}
