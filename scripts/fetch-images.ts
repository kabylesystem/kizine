import { writeFileSync, mkdirSync, existsSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { allConcepts } from "../src/data/concepts";
import { wikiTitles } from "../src/data/wiki-titles";
import { migrate, rawDb } from "../src/db/client";

/**
 * Photos d'aliments : image d'en-tête de l'article Wikipédia, via un mapping explicite.
 *
 * La recherche plein texte de Commons renvoyait n'importe quoi (une tarte pour « pomme »,
 * une boîte de sardines pour « haricots noirs »). L'image principale d'un article
 * alimentaire montre l'aliment lui-même : le sujet est garanti par le mapping, pas deviné.
 * Licence et auteur sont relus sur Commons et stockés.
 */

const UA = "cuisine-app/0.2 (personal project; opensource@example.com)";
const OUT = join(process.cwd(), "public", "food");
const THUMB = 900;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isRealImage(buf: Buffer): boolean {
  if (buf.length < 8192) return false;
  return (buf[0] === 0xff && buf[1] === 0xd8) || (buf[0] === 0x89 && buf[1] === 0x50);
}

async function json(url: URL, attempt = 0): Promise<Record<string, unknown>> {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (res.status === 429 || res.status >= 500) {
    if (attempt >= 4) throw new Error(`${res.status} après ${attempt} tentatives`);
    await sleep(1200 * 2 ** attempt);
    return json(url, attempt + 1);
  }
  if (!res.ok) throw new Error(`http ${res.status}`);
  await sleep(180);
  return (await res.json()) as Record<string, unknown>;
}

interface LeadImage {
  source: string;
  file: string | null;
}

/** Image d'en-tête d'un article Wikipédia. */
async function leadImage(title: string): Promise<LeadImage | null> {
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
    if (thumb?.source) {
      return { source: thumb.source, file: (page["pageimage"] as string | undefined) ?? null };
    }
  }
  return null;
}

interface Credit {
  license: string;
  author: string;
  url: string;
}

async function credit(fileName: string): Promise<Credit> {
  const fallback = {
    license: "voir Wikimedia Commons",
    author: "Wikimedia Commons",
    url: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(fileName)}`,
  };
  try {
    const url = new URL("https://commons.wikimedia.org/w/api.php");
    url.searchParams.set("action", "query");
    url.searchParams.set("format", "json");
    url.searchParams.set("titles", `File:${fileName}`);
    url.searchParams.set("prop", "imageinfo");
    url.searchParams.set("iiprop", "extmetadata");
    const data = await json(url);
    const pages = (data["query"] as { pages?: Record<string, { imageinfo?: { extmetadata?: Record<string, { value: string }> }[] }> } | undefined)?.pages;
    if (!pages) return fallback;
    for (const page of Object.values(pages)) {
      const meta = page.imageinfo?.[0]?.extmetadata;
      if (!meta) continue;
      const strip = (s?: string) => (s ? s.replace(/<[^>]*>/g, "").trim().slice(0, 160) : undefined);
      return {
        license: strip(meta["LicenseShortName"]?.value) ?? fallback.license,
        author: strip(meta["Artist"]?.value) ?? fallback.author,
        url: fallback.url,
      };
    }
  } catch {
    /* on garde le repli */
  }
  return fallback;
}

async function download(url: string, attempt = 0): Promise<Buffer | null> {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (res.status === 429 || res.status >= 500) {
    if (attempt >= 4) return null;
    await sleep(1800 * 2 ** attempt);
    return download(url, attempt + 1);
  }
  if (!res.ok) return null;
  if (!(res.headers.get("content-type") ?? "").startsWith("image/")) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  return isRealImage(buf) ? buf : null;
}

async function main(): Promise<void> {
  await migrate();
  mkdirSync(OUT, { recursive: true });
  const conn = rawDb();
  const assetStmt = conn.prepare(
    "INSERT OR REPLACE INTO image_assets (id, path, width, height, source, license, attribution, source_url, dominant) VALUES (?,?,?,?,?,?,?,?,?)",
  );
  const linkStmt = conn.prepare("UPDATE food_concepts SET image_id = ? WHERE id = ?");

  const only = process.argv.slice(2);
  const targets = allConcepts.filter((c) => (only.length ? only.includes(c.id) : c.swipe));
  let ok = 0;
  let skipped = 0;
  const failures: string[] = [];

  for (const concept of targets) {
    const file = join(OUT, `${concept.id}.jpg`);
    if (existsSync(file) && !process.env.FORCE) {
      if (isRealImage(readFileSync(file))) {
        skipped++;
        continue;
      }
      unlinkSync(file);
    }
    const title = wikiTitles[concept.id];
    if (!title) {
      failures.push(`${concept.id} : aucun article mappé`);
      continue;
    }
    try {
      const lead = await leadImage(title);
      if (!lead) {
        failures.push(`${concept.id} : « ${title} » sans image d'en-tête`);
        continue;
      }
      const buf = await download(lead.source);
      if (!buf) {
        failures.push(`${concept.id} : téléchargement refusé`);
        continue;
      }
      writeFileSync(file, buf);
      const c = lead.file ? await credit(lead.file) : { license: "Wikimedia", author: "Wikimedia Commons", url: "" };
      const id = `food:${concept.id}`;
      await assetStmt.run(id, `/food/${concept.id}.jpg`, THUMB, null, "wikipedia", c.license, c.author, c.url, null);
      await linkStmt.run(id, concept.id);
      ok++;
      console.log(`  ${String(ok).padStart(3)}  ${concept.id.padEnd(20)} ← ${title}  (${c.license})`);
    } catch (err) {
      failures.push(`${concept.id} : ${(err as Error).message}`);
    }
  }

  console.log(`\n${ok} récupérées, ${skipped} déjà présentes, ${failures.length} échecs, sur ${targets.length}`);
  for (const f of failures) console.log(`  ${f}`);
}

void main();
