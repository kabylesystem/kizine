import { writeFileSync, mkdirSync, existsSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { recipeWikiTitles, mealdbNames } from "../src/data/recipe-images";
import { migrate, rawDb } from "../src/db/client";

/**
 * Photo de PLAT pour chaque recette.
 * Wikipédia d'abord (l'article d'un plat s'ouvre sur une photo du plat),
 * TheMealDB en repli (793 plats, API gratuite, attribution requise).
 */

const UA = "cuisine-app/0.5 (personal; opensource@example.com)";
const OUT = join(process.cwd(), "public", "dish");
const THUMB = 1000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const isRealImage = (b: Buffer) =>
  b.length > 12000 && ((b[0] === 0xff && b[1] === 0xd8) || (b[0] === 0x89 && b[1] === 0x50));

async function json(url: URL, attempt = 0): Promise<Record<string, unknown>> {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (res.status === 429 || res.status >= 500) {
    if (attempt >= 4) throw new Error(String(res.status));
    await sleep(1200 * 2 ** attempt);
    return json(url, attempt + 1);
  }
  if (!res.ok) throw new Error(`http ${res.status}`);
  await sleep(180);
  return (await res.json()) as Record<string, unknown>;
}

async function download(url: string): Promise<Buffer | null> {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) return null;
  if (!(res.headers.get("content-type") ?? "").startsWith("image/")) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  return isRealImage(buf) ? buf : null;
}

async function fromWikipedia(title: string): Promise<{ buf: Buffer; file: string | null } | null> {
  const url = new URL("https://en.wikipedia.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("format", "json");
  url.searchParams.set("titles", title);
  url.searchParams.set("prop", "pageimages");
  url.searchParams.set("piprop", "thumbnail|name");
  url.searchParams.set("pithumbsize", String(THUMB));
  url.searchParams.set("redirects", "1");
  const data = await json(url);
  const pages = (data["query"] as { pages?: Record<string, Record<string, unknown>> } | undefined)?.pages;
  if (!pages) return null;
  for (const page of Object.values(pages)) {
    const thumb = page["thumbnail"] as { source?: string } | undefined;
    if (!thumb?.source) continue;
    const buf = await download(thumb.source);
    if (buf) return { buf, file: (page["pageimage"] as string | undefined) ?? null };
  }
  return null;
}

/** L'API REST renvoie une image même quand aucune « page image » n'est désignée. */
async function fromWikiSummary(title: string): Promise<Buffer | null> {
  const slug = encodeURIComponent(title.replace(/ /g, "_"));
  const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${slug}`, {
    headers: { "User-Agent": UA },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    originalimage?: { source?: string };
    thumbnail?: { source?: string };
  };
  const src = data.thumbnail?.source ?? data.originalimage?.source;
  await sleep(180);
  return src ? download(src) : null;
}

async function fromMealDb(name: string): Promise<Buffer | null> {
  const url = new URL("https://www.themealdb.com/api/json/v1/1/search.php");
  url.searchParams.set("s", name);
  const data = await json(url);
  const meals = data["meals"] as { strMealThumb?: string }[] | null;
  const thumb = meals?.[0]?.strMealThumb;
  if (!thumb) return null;
  return download(thumb);
}

async function main(): Promise<void> {
  await migrate();
  mkdirSync(OUT, { recursive: true });
  const conn = rawDb();
  const assetStmt = conn.prepare(
    "INSERT OR REPLACE INTO image_assets (id, path, width, height, source, license, attribution, source_url, dominant) VALUES (?,?,?,?,?,?,?,?,?)",
  );
  const linkStmt = conn.prepare("UPDATE recipes SET image_id = ? WHERE id = ?");

  const only = process.argv.slice(2);
  const ids = Object.keys(recipeWikiTitles).filter((id) => (only.length ? only.includes(id) : true));
  let ok = 0;
  const failed: string[] = [];

  for (const id of ids) {
    const file = join(OUT, `${id}.jpg`);
    if (existsSync(file) && !process.env.FORCE) {
      if (isRealImage(readFileSync(file))) {
        ok++;
        continue;
      }
      unlinkSync(file);
    }
    try {
      let buf: Buffer | null = null;
      let source = "wikipedia";
      let attribution = "Wikimedia Commons";
      let sourceUrl: string | null = null;

      let wiki: { buf: Buffer; file: string | null } | null = null;
      try {
        wiki = await fromWikipedia(recipeWikiTitles[id]!);
      } catch {
        wiki = null; // l'API principale a lâché : on passe au repli REST
      }
      if (wiki) {
        buf = wiki.buf;
        sourceUrl = wiki.file
          ? `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(wiki.file)}`
          : null;
      } else {
        buf = await fromWikiSummary(recipeWikiTitles[id]!);
        if (buf) {
          sourceUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(recipeWikiTitles[id]!)}`;
        } else {
          const name = mealdbNames[id] ?? recipeWikiTitles[id]!;
          buf = await fromMealDb(name);
          source = "themealdb";
          attribution = "TheMealDB";
          sourceUrl = "https://www.themealdb.com/";
        }
      }
      if (!buf) {
        failed.push(`${id} : aucune image (${recipeWikiTitles[id]})`);
        continue;
      }
      writeFileSync(file, buf);
      const assetId = `dish:${id}`;
      await assetStmt.run(assetId, `/dish/${id}.jpg`, THUMB, null, source, "voir la source", attribution, sourceUrl, null);
      await linkStmt.run(assetId, id);
      ok++;
      console.log(`  ${String(ok).padStart(3)}  ${id.padEnd(32)} ← ${recipeWikiTitles[id]} (${source})`);
    } catch (err) {
      failed.push(`${id} : ${(err as Error).message}`);
    }
  }
  console.log(`\n${ok} photos de plat, ${failed.length} échecs sur ${ids.length}`);
  for (const f of failed) console.log(`  ${f}`);
}

void main();
