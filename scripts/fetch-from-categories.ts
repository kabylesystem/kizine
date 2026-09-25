import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { commonsCategories } from "../src/data/commons-categories";
import { migrate, rawDb } from "../src/db/client";

/**
 * Récupère la première image valable d'une catégorie Commons étroite.
 * On refuse les planches botaniques, les schémas et les images de plante entière :
 * ce qui compte ici, c'est l'aliment tel qu'on l'achète.
 */

const UA = "cuisine-app/0.3 (personal project; opensource@example.com)";
const OUT = join(process.cwd(), "public", "food");
const THUMB = 900;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const REJECT =
  /illustration|drawing|plate|botanical|diagram|chart|map|logo|icon|köhler|kohler|flora|herbarium|specimen|plant|tree|field|crop|leaves on|flower|blossom|seedling|garden|farm|harvest|sketch|engraving|painting|1800|18[0-9]{2}|19[0-2][0-9]|distribution|range|labell?ed|nutrition facts|svg/i;

function isRealImage(buf: Buffer): boolean {
  if (buf.length < 12000) return false;
  return (buf[0] === 0xff && buf[1] === 0xd8) || (buf[0] === 0x89 && buf[1] === 0x50);
}

async function api(params: Record<string, string>, attempt = 0): Promise<Record<string, unknown>> {
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  for (const [k, v] of Object.entries({ format: "json", ...params })) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (res.status === 429 || res.status >= 500) {
    if (attempt >= 4) throw new Error(`${res.status}`);
    await sleep(1200 * 2 ** attempt);
    return api(params, attempt + 1);
  }
  if (!res.ok) throw new Error(`http ${res.status}`);
  await sleep(160);
  return (await res.json()) as Record<string, unknown>;
}

async function members(category: string): Promise<string[]> {
  const data = await api({
    action: "query",
    list: "categorymembers",
    cmtitle: `Category:${category}`,
    cmtype: "file",
    cmlimit: "60",
  });
  const list = (data["query"] as { categorymembers?: { title: string }[] } | undefined)?.categorymembers ?? [];
  return list.map((m) => m.title);
}

interface Info {
  thumb: string;
  width: number;
  license: string;
  author: string;
}

async function info(title: string): Promise<Info | null> {
  const data = await api({
    action: "query",
    titles: title,
    prop: "imageinfo",
    iiprop: "url|size|extmetadata",
    iiurlwidth: String(THUMB),
  });
  const pages = (data["query"] as { pages?: Record<string, { imageinfo?: Record<string, unknown>[] }> } | undefined)?.pages;
  if (!pages) return null;
  for (const page of Object.values(pages)) {
    const ii = page.imageinfo?.[0];
    if (!ii?.["thumburl"]) continue;
    const meta = (ii["extmetadata"] ?? {}) as Record<string, { value: string }>;
    const strip = (s?: string) => (s ? s.replace(/<[^>]*>/g, "").trim().slice(0, 160) : undefined);
    return {
      thumb: String(ii["thumburl"]),
      width: Number(ii["width"] ?? 0),
      license: strip(meta["LicenseShortName"]?.value) ?? "Wikimedia Commons",
      author: strip(meta["Artist"]?.value) ?? "Wikimedia Commons",
    };
  }
  return null;
}

async function download(url: string): Promise<Buffer | null> {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
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
  const ids = Object.keys(commonsCategories).filter((id) => (only.length ? only.includes(id) : true));
  let ok = 0;
  const failed: string[] = [];

  for (const id of ids) {
    const cats = commonsCategories[id] ?? [];
    let picked: { title: string; info: Info } | null = null;

    for (const cat of cats) {
      let titles: string[] = [];
      try {
        titles = await members(cat);
      } catch {
        continue;
      }
      const clean = titles.filter((t) => !REJECT.test(t) && /\.(jpe?g|png)$/i.test(t));
      for (const title of clean.slice(0, 12)) {
        const meta = await info(title);
        if (meta && meta.width >= 600) {
          picked = { title, info: meta };
          break;
        }
      }
      if (picked) break;
    }

    if (!picked) {
      failed.push(`${id} : rien de valable dans ${cats.join(" / ")}`);
      continue;
    }

    const buf = await download(picked.info.thumb);
    if (!buf) {
      failed.push(`${id} : téléchargement refusé`);
      continue;
    }
    writeFileSync(join(OUT, `${id}.jpg`), buf);
    const assetId = `food:${id}`;
    await assetStmt.run(
      assetId,
      `/food/${id}.jpg`,
      THUMB,
      null,
      "wikimedia",
      picked.info.license,
      picked.info.author,
      `https://commons.wikimedia.org/wiki/${encodeURIComponent(picked.title)}`,
      null,
    );
    await linkStmt.run(assetId, id);
    ok++;
    console.log(`  ${String(ok).padStart(3)}  ${id.padEnd(20)} ← ${picked.title.replace("File:", "").slice(0, 52)}`);
  }

  console.log(`\n${ok} remplacées, ${failed.length} échecs sur ${ids.length}`);
  for (const f of failed) console.log(`  ${f}`);
}

void main();
