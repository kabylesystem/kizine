import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { imageQueries } from "../src/data/image-queries";
import { deckIds } from "../src/data/deck";
import { migrate, rawDb } from "../src/db/client";

/**
 * Choisit la MEILLEURE photo parmi les candidats Commons, au lieu de prendre la première.
 * Le titre d'un fichier Commons est descriptif : il suffit de le noter honnêtement.
 */

const UA = "cuisine-app/0.4 (personal; opensource@example.com)";
const OUT = join(process.cwd(), "public", "food");
const THUMB = 900;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const BAN =
  /\(BM |NYPL|museum|engraving|etching|lithograph|caricature|magazine|poster|cover|puck|gallery of|portrait|plate \d|köhler|kohler|botanical|illustration|drawing|painting|sketch|diagram|chart|map|logo|svg|1[6-8]\d\d|19[0-4]\d|tartare|market|shop|stall|supermarket|store|festival|restaurant|menu|recipe|cooking|cooked|roast|grilled|fried|baked|soup|salad|sandwich|pizza|burger|stew|curry|plated|dish of|dinner|lunch|breakfast|person|man |woman |chef|hand|people|farm|field|plant|tree|garden|harvest|flower|blossom|seedling|crop|leaf spot|disease/i;

const GOOD = /\braw\b|\bfresh\b|fillet|sliced|slices|whole|bowl|heap|pile|closeup|close-up|studio|isolated|white background|dried|grains|seeds|block|bunch|halved|cut/i;

async function api(params: Record<string, string>, attempt = 0): Promise<Record<string, unknown>> {
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  for (const [k, v] of Object.entries({ format: "json", ...params })) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (res.status === 429 || res.status >= 500) {
    if (attempt >= 4) throw new Error(String(res.status));
    await sleep(1200 * 2 ** attempt);
    return api(params, attempt + 1);
  }
  if (!res.ok) throw new Error(`http ${res.status}`);
  await sleep(140);
  return (await res.json()) as Record<string, unknown>;
}

function score(title: string, keyWords: string[]): number {
  const t = title.toLowerCase();
  if (BAN.test(title)) return -100;
  if (!/\.(jpe?g|png)$/i.test(title)) return -100;
  let s = 0;
  for (const w of keyWords) if (t.includes(w)) s += 6;
  if (GOOD.test(title)) s += 5;
  s -= Math.min(8, title.length / 14);
  if (/^\w+( \w+)?\.(jpe?g|png)$/i.test(title)) s += 4;
  return s;
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
  const ids = deckIds.filter((id) => imageQueries[id] && (only.length ? only.includes(id) : true));
  let ok = 0;
  const failed: string[] = [];

  for (const id of ids) {
    const query = imageQueries[id]!;
    const keyWords = query.split(" ").filter((w) => w.length > 3);
    try {
      const data = await api({
        action: "query",
        list: "search",
        srsearch: `${query} filetype:bitmap`,
        srnamespace: "6",
        srlimit: "24",
      });
      const hits = ((data["query"] as { search?: { title: string }[] } | undefined)?.search ?? []).map((h) =>
        h.title.replace(/^File:/, ""),
      );
      const ranked = hits
        .map((title) => ({ title, s: score(title, keyWords) }))
        .filter((r) => r.s > -50)
        .sort((a, b) => b.s - a.s);

      let saved = false;
      for (const cand of ranked.slice(0, 5)) {
        const info = await api({
          action: "query",
          titles: `File:${cand.title}`,
          prop: "imageinfo",
          iiprop: "url|size|extmetadata",
          iiurlwidth: String(THUMB),
        });
        const pages = (info["query"] as { pages?: Record<string, { imageinfo?: Record<string, unknown>[] }> } | undefined)?.pages;
        const ii = pages ? Object.values(pages)[0]?.imageinfo?.[0] : undefined;
        if (!ii?.["thumburl"] || Number(ii["width"] ?? 0) < 600) continue;
        const res = await fetch(String(ii["thumburl"]), { headers: { "User-Agent": UA } });
        if (!res.ok || !(res.headers.get("content-type") ?? "").startsWith("image/")) continue;
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length < 12000) continue;
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
          `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(cand.title)}`,
          null,
        );
        await linkStmt.run(assetId, id);
        ok++;
        console.log(`  ${String(ok).padStart(3)}  ${id.padEnd(18)} ← ${cand.title.slice(0, 56)}`);
        saved = true;
        break;
      }
      if (!saved) failed.push(`${id} : aucun candidat retenu`);
    } catch (err) {
      failed.push(`${id} : ${(err as Error).message}`);
    }
  }
  console.log(`\n${ok} choisies, ${failed.length} échecs sur ${ids.length}`);
  for (const f of failed) console.log(`  ${f}`);
}

void main();
