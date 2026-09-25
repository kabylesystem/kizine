"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface Hit {
  key: string;
  label: string;
  detail: string;
  per100: { kcal: number; protein: number; carb: number; fat: number; fiber: number };
}

interface Line extends Hit {
  amount: number;
}

const T = {
  en: {
    title: "What did you cook?",
    placeholder: "Bolognese, chicken with potatoes and peppers…",
    portions: "portions",
    modeG: "grams, as bought",
    modePct: "% of the pot",
    total: "the whole pot weighs",
    search: "Add an ingredient",
    searchHint: "type a name: mince, tomato, pasta, or a product you scanned",
    none: "nothing found",
    perPortion: "per portion",
    stock: "Take these out of my stock",
    save: "Save this dish",
    saving: "Counting…",
    empty: "Add at least one ingredient.",
    rough: "≈ counted from the ingredients, as bought. Rough on purpose.",
  },
  fr: {
    title: "Tu as cuisiné quoi ?",
    placeholder: "Bolognaise, poulet pommes de terre poivrons…",
    portions: "portions",
    modeG: "grammes, tels qu'achetés",
    modePct: "% de la marmite",
    total: "la marmite pèse",
    search: "Ajouter un ingrédient",
    searchHint: "tape un nom : viande hachée, tomate, pâtes, ou un produit scanné",
    none: "rien trouvé",
    perPortion: "par portion",
    stock: "Sortir ça de mon stock",
    save: "Enregistrer ce plat",
    saving: "Je compte…",
    empty: "Ajoute au moins un ingrédient.",
    rough: "≈ compté à partir des ingrédients, tels qu'achetés. Approximatif, exprès.",
  },
} as const;

export function FreeDishForm({ lang }: { lang: "en" | "fr" }) {
  const t = T[lang];
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [portions, setPortions] = useState(4);
  const [mode, setMode] = useState<"g" | "pct">("g");
  const [totalG, setTotalG] = useState(2000);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [takeStock, setTakeStock] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current);
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    timer.current = window.setTimeout(async () => {
      const res = await fetch(`/api/free/search?q=${encodeURIComponent(q.trim())}`);
      const data = (await res.json().catch(() => ({ hits: [] }))) as { hits: Hit[] };
      setHits(data.hits ?? []);
    }, 220);
  }, [q]);

  const gramsOf = (l: Line) => (mode === "g" ? l.amount : (totalG * l.amount) / 100);
  const totals = useMemo(() => {
    let kcal = 0;
    let protein = 0;
    let grams = 0;
    for (const l of lines) {
      const g = gramsOf(l);
      kcal += (l.per100.kcal * g) / 100;
      protein += (l.per100.protein * g) / 100;
      grams += g;
    }
    return { kcal, protein, grams };
  }, [lines, mode, totalG]);
  const pctSum = lines.reduce((s, l) => s + l.amount, 0);

  function add(h: Hit) {
    if (lines.some((l) => l.key === h.key)) return;
    setLines((prev) => [...prev, { ...h, amount: mode === "g" ? 200 : Math.max(5, Math.round(100 / (prev.length + 1))) }]);
    setQ("");
    setHits([]);
  }

  async function save() {
    if (lines.length === 0) {
      setError(t.empty);
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch("/api/free", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim() || (lang === "fr" ? "Plat maison" : "Batch dish"),
        portions,
        takeStock,
        lines: lines.map((l) => ({ key: l.key, grams: Math.round(gramsOf(l)) })),
      }),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({ error: "error" }))).error ?? "error");
      return;
    }
    setLines([]);
    setTitle("");
    router.refresh();
  }

  return (
    <section className="etal-card flex flex-col gap-3 p-4">
      <h2 className="text-[16px] font-bold">{t.title}</h2>
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t.placeholder}
          className="min-w-[220px] flex-1 rounded-[6px] px-3 py-2 text-[15px] font-semibold"
          style={{ background: "var(--surface2)", color: "var(--ink)" }}
        />
        <label className="flex items-center gap-2 text-[13px]" style={{ color: "var(--soft)" }}>
          <input
            type="number"
            min={1}
            max={30}
            value={portions}
            onChange={(e) => setPortions(Math.max(1, Number(e.target.value) || 1))}
            className="tabnum w-[64px] rounded-[6px] px-2 py-2 text-[15px] font-bold"
            style={{ background: "var(--surface2)", color: "var(--ink)" }}
          />
          {t.portions}
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {(["g", "pct"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            aria-pressed={mode === m}
            className="rounded-full px-3 py-1.5 text-[13px] font-bold transition-colors"
            style={{ background: mode === m ? "var(--myrtille)" : "var(--surface2)", color: mode === m ? "#fff" : "var(--ink)" }}
          >
            {m === "g" ? t.modeG : t.modePct}
          </button>
        ))}
        {mode === "pct" ? (
          <label className="flex items-center gap-2 pl-2 text-[13px]" style={{ color: "var(--soft)" }}>
            {t.total}
            <input
              type="number"
              min={100}
              max={20000}
              step={50}
              value={totalG}
              onChange={(e) => setTotalG(Number(e.target.value) || 0)}
              className="tabnum w-[84px] rounded-[6px] px-2 py-1.5 text-[14px] font-bold"
              style={{ background: "var(--surface2)", color: "var(--ink)" }}
            />
            g
          </label>
        ) : null}
      </div>

      {lines.length ? (
        <div className="flex flex-col gap-1.5">
          {lines.map((l) => (
            <div key={l.key} className="flex items-center gap-2 rounded-[6px] px-2 py-1.5" style={{ background: "var(--ground)" }}>
              <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">{l.label}</span>
              <input
                type="number"
                min={0}
                step={mode === "g" ? 10 : 1}
                value={l.amount}
                onChange={(e) =>
                  setLines((prev) => prev.map((x) => (x.key === l.key ? { ...x, amount: Number(e.target.value) || 0 } : x)))
                }
                className="tabnum w-[76px] rounded-[6px] px-2 py-1 text-right text-[14px] font-bold"
                style={{ background: "var(--surface2)", color: "var(--ink)" }}
              />
              <span className="w-[22px] text-[12px]" style={{ color: "var(--soft)" }}>
                {mode === "g" ? "g" : "%"}
              </span>
              <span className="tabnum w-[70px] text-right text-[12px]" style={{ color: "var(--soft)" }}>
                {Math.round((l.per100.kcal * gramsOf(l)) / 100)} kcal
              </span>
              <button
                type="button"
                onClick={() => setLines((prev) => prev.filter((x) => x.key !== l.key))}
                aria-label="remove"
                className="rounded-full px-2 text-[14px] font-bold"
                style={{ color: "var(--soft)" }}
              >
                ×
              </button>
            </div>
          ))}
          {mode === "pct" && Math.round(pctSum) !== 100 ? (
            <span className="text-[12px] font-semibold" style={{ color: "var(--curcuma)" }}>
              {Math.round(pctSum)} % {lang === "fr" ? "au total, vise 100" : "in total, aim for 100"}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="relative">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t.search}
          className="w-full rounded-[6px] px-3 py-2 text-[14px] font-semibold"
          style={{ background: "var(--surface2)", color: "var(--ink)" }}
        />
        <p className="mt-1 text-[12px]" style={{ color: "var(--soft)" }}>
          {t.searchHint}
        </p>
        {q.trim().length >= 2 ? (
          <div className="absolute left-0 right-0 top-[42px] z-20 max-h-[260px] overflow-auto rounded-[7px]" style={{ background: "var(--surface)", boxShadow: "0 18px 40px -18px rgb(8 10 7 / 0.6)" }}>
            {hits.length === 0 ? (
              <div className="px-3 py-2 text-[13px]" style={{ color: "var(--soft)" }}>
                {t.none}
              </div>
            ) : (
              hits.map((h) => (
                <button
                  key={h.key}
                  type="button"
                  onClick={() => add(h)}
                  className="block w-full px-3 py-2 text-left transition-colors hover:bg-[var(--surface2)]"
                >
                  <span className="block text-[14px] font-bold">{h.label}</span>
                  <span className="block text-[12px]" style={{ color: "var(--soft)" }}>
                    {h.detail}
                  </span>
                </button>
              ))
            )}
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3 rounded-[7px] p-3" style={{ background: "var(--surface2)" }}>
        <div>
          <div className="display tabnum text-[34px] leading-none">≈ {Math.round(totals.kcal / Math.max(1, portions))}</div>
          <div className="mt-1 text-[13px]" style={{ color: "var(--soft)" }}>
            kcal · {Math.round(totals.protein / Math.max(1, portions))} g P {t.perPortion} · {Math.round(totals.grams / Math.max(1, portions))} g
          </div>
        </div>
        <div className="tabnum text-right text-[13px]" style={{ color: "var(--soft)" }}>
          {Math.round(totals.kcal)} kcal · {Math.round(totals.grams)} g {lang === "fr" ? "en tout" : "in total"}
        </div>
      </div>

      <label className="flex items-center gap-2 text-[13px]">
        <input type="checkbox" checked={takeStock} onChange={(e) => setTakeStock(e.target.checked)} />
        {t.stock}
      </label>
      {error ? (
        <p className="text-[13px] font-semibold" style={{ color: "var(--tomate)" }}>
          {error}
        </p>
      ) : null}
      <button
        type="button"
        onClick={() => void save()}
        disabled={busy || lines.length === 0}
        className="etal-btn etal-btn--color disabled:opacity-40"
        style={{ "--c": "var(--argile)" } as React.CSSProperties}
      >
        {busy ? t.saving : t.save}
      </button>
      <p className="text-[12px]" style={{ color: "var(--soft)" }}>
        {t.rough}
      </p>
    </section>
  );
}
