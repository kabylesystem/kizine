const UA = "cuisine-app/0.3 (personal; opensource@example.com)";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function search(q: string): Promise<string[]> {
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("format", "json");
  url.searchParams.set("list", "search");
  url.searchParams.set("srsearch", `${q} filetype:bitmap`);
  url.searchParams.set("srnamespace", "6");
  url.searchParams.set("srlimit", "14");
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  const d = (await res.json()) as { query?: { search?: { title: string }[] } };
  await sleep(150);
  return (d.query?.search ?? []).map((s) => s.title.replace("File:", ""));
}

const queries = process.argv.slice(2);
for (const q of queries) {
  const hits = await search(q);
  console.log(`\n### ${q}`);
  for (const h of hits) console.log("  " + h);
}
export {};
