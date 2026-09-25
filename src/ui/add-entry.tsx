"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface Hit {
  key: string;
  label: string;
  detail: string;
  per100: { kcal: number; protein: number };
}

export interface PortionOption {
  dishId: string;
  title: string;
  kcal: number;
  protein: number;
  left: number;
}

interface PhotoLine {
  key: string;
  label: string;
  servedG: number;
  grams: number;
  state: string;
  kcal: number;
  protein: number;
}

interface PhotoResult {
  title: string;
  lines: PhotoLine[];
  totalG: number;
  precision: "known" | "rough";
  confidence: number;
  notes: string;
}

/** Réduit la photo à 1024 px de côté en JPEG : assez pour lire l'assiette, léger à envoyer. */
async function shrink(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.82);
}

const T = {
  en: {
    add: "+ Add what you ate",
    close: "Close",
    portion: "Batch portion",
    food: "Food or product",
    ballpark: "Ballpark",
    noDish: "No batch dish yet.",
    makeOne: "Count a pot →",
    search: "Type a food or a product you scanned",
    grams: "g",
    addBtn: "Add",
    kcal: "kcal",
    protein: "g protein",
    name: "what was it (optional)",
    left: "left",
    photo: "Photo",
    take: "Take a photo of the plate",
    photoName: "what is it (optional, helps a lot)",
    photoGrams: "plate weight in g (optional, makes it ±15 %)",
    read: "Read the photo",
    reading: "Reading the plate… 30 to 60 s",
    readFail: "Could not read the photo. Try again, or log it another way.",
    served: "served",
    known: "±15 % · weighed plate",
    rough: "±30 % · no weight",
    retake: "Another photo",
  },
  fr: {
    add: "+ Ajouter ce que j'ai mangé",
    close: "Fermer",
    portion: "Portion de batch",
    food: "Aliment ou produit",
    ballpark: "À la louche",
    noDish: "Aucun plat en batch pour l'instant.",
    makeOne: "Compter une marmite →",
    search: "Tape un aliment ou un produit scanné",
    grams: "g",
    addBtn: "Ajouter",
    kcal: "kcal",
    protein: "g de protéines",
    name: "c'était quoi (facultatif)",
    left: "restantes",
    photo: "Photo",
    take: "Prends l'assiette en photo",
    photoName: "c'est quoi (facultatif, ça aide beaucoup)",
    photoGrams: "poids de l'assiette en g (facultatif, passe à ±15 %)",
    read: "Lire la photo",
    reading: "Je lis l'assiette… 30 à 60 s",
    readFail: "Photo illisible. Réessaie, ou note-le autrement.",
    served: "servi",
    known: "±15 % · assiette pesée",
    rough: "±30 % · sans poids",
    retake: "Autre photo",
  },
} as const;

/**
 * Trois manières de dire « j'ai mangé ça », dans un seul panneau : une portion
 * d'un plat en batch, un aliment pesé, ou un chiffre à la louche. Chacune
 * devient un repas mangé du jour, marqué ≈.
 */
export function AddEntry({
  date,
  slotId,
  slotKcal,
  portions,
  lang,
  startOpen = false,
  onClose,
  strip = false,
}: {
  date: string;
  slotId?: string;
  /** Cible du créneau, pour proposer léger / normal / gros à la bonne taille. */
  slotKcal?: number;
  portions: PortionOption[];
  lang: "en" | "fr";
  startOpen?: boolean;
  onClose?: () => void;
  /** Barre visible en permanence : le titre et les quatre façons de noter, un tap ouvre la bonne. */
  strip?: boolean;
}) {
  const t = T[lang];
  const router = useRouter();
  const [open, setOpen] = useState(startOpen);
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoName, setPhotoName] = useState("");
  const [photoGrams, setPhotoGrams] = useState<string>("");
  const [reading, setReading] = useState(false);
  const [result, setResult] = useState<PhotoResult | null>(null);
  const base = slotKcal && slotKcal > 0 ? slotKcal : 700;
  const round50 = (v: number) => Math.round(v / 50) * 50;
  const presets: { id: string; label: string; kcal: number }[] = [
    { id: "light", label: lang === "fr" ? "Léger" : "Light", kcal: round50(base * 0.6) },
    { id: "normal", label: lang === "fr" ? "Normal" : "Normal", kcal: round50(base) },
    { id: "big", label: lang === "fr" ? "Gros" : "Big", kcal: round50(base * 1.5) },
  ];
  const [tab, setTab] = useState<"photo" | "portion" | "food" | "ballpark">(portions.some((p) => p.left > 0) ? "portion" : "photo");
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [picked, setPicked] = useState<Hit | null>(null);
  const [grams, setGrams] = useState(150);
  const [kcal, setKcal] = useState(round50(base));
  const [protein, setProtein] = useState(Math.round((round50(base) * 0.2) / 4));
  const [title, setTitle] = useState("");
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

  async function readPhoto() {
    if (!photo) return;
    setReading(true);
    setError(null);
    setResult(null);
    try {
      const ticket = (await (await fetch("/api/photo/ticket")).json()) as { url?: string; token?: string; error?: string };
      if (!ticket.url || !ticket.token) throw new Error(ticket.error ?? "no ticket");
      const grams = Number(photoGrams) || 0;
      const vision = (await (
        await fetch(ticket.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: ticket.token, image: photo, name: photoName.trim() || undefined, grams: grams || undefined }),
        })
      ).json()) as { dish?: string; confidence?: number; totalG?: number; items?: { id: string; share: number; state?: string }[]; notes?: string; error?: string };
      if (!vision.items || vision.items.length === 0) throw new Error(vision.error ?? "nothing recognised");
      const composed = (await (
        await fetch("/api/photo/compose", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dish: photoName.trim() || vision.dish, totalG: grams || vision.totalG, weighed: grams > 0, items: vision.items }),
        })
      ).json()) as { title: string; lines: PhotoLine[]; totalG: number; precision: "known" | "rough"; error?: string };
      if (!composed.lines) throw new Error(composed.error ?? "compose failed");
      setResult({ ...composed, confidence: vision.confidence ?? 0.5, notes: vision.notes ?? "" });
    } catch {
      setError(t.readFail);
    }
    setReading(false);
  }

  async function send(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/entry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, slotId, ...body }),
    });
    setBusy(false);
    if (!res.ok) {
      setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "error");
      return;
    }
    setOpen(false);
    setPicked(null);
    setQ("");
    setTitle("");
    onClose?.();
    router.refresh();
  }

  function close() {
    setOpen(false);
    onClose?.();
  }

  const tabs: { id: typeof tab; label: string; icon: string }[] = [
    { id: "photo", label: t.photo, icon: "📷" },
    { id: "portion", label: t.portion, icon: "🍲" },
    { id: "food", label: t.food, icon: "🔍" },
    { id: "ballpark", label: t.ballpark, icon: "≈" },
  ];

  if (!open) {
    if (strip) {
      return (
        <div className="etal-card p-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-[14px] font-bold">{lang === "fr" ? "Noter ce que j'ai mangé" : "Log what you ate"}</span>
            <span className="text-[12px]" style={{ color: "var(--soft)" }}>
              {lang === "fr" ? "aussi précis que tu veux" : "as precise as you like"}
            </span>
          </div>
          <div className="mt-2 grid grid-cols-4 gap-1.5">
            {tabs.map((x) => (
              <button
                key={x.id}
                onClick={() => {
                  setTab(x.id);
                  setOpen(true);
                }}
                className="flex flex-col items-center gap-0.5 rounded-[7px] px-1 py-2 text-[12px] font-bold transition-transform hover:-translate-y-0.5"
                style={{ background: "var(--surface2)", color: "var(--ink)" }}
              >
                <span className="text-[18px] leading-none">{x.icon}</span>
                <span>{x.label}</span>
              </button>
            ))}
          </div>
        </div>
      );
    }
    return (
      <button
        onClick={() => setOpen(true)}
        className="etal-btn etal-btn--color w-full text-[15px]"
        style={{ "--c": "var(--argile)" } as React.CSSProperties}
      >
        {t.add}
      </button>
    );
  }
  const resultKcal = result ? result.lines.reduce((s, l) => s + l.kcal, 0) : 0;
  const resultProtein = result ? result.lines.reduce((s, l) => s + l.protein, 0) : 0;

  return (
    <div className="etal-card flex flex-col gap-3 p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {tabs.map((x) => (
          <button
            key={x.id}
            onClick={() => setTab(x.id)}
            aria-pressed={tab === x.id}
            className="rounded-full px-3 py-1.5 text-[13px] font-bold transition-colors"
            style={{ background: tab === x.id ? "var(--argile)" : "var(--surface2)", color: tab === x.id ? "var(--on-color)" : "var(--ink)" }}
          >
            {x.icon} {x.label}
          </button>
        ))}
        <button onClick={close} className="ml-auto text-[12px] font-semibold" style={{ color: "var(--soft)" }}>
          {t.close}
        </button>
      </div>

      {tab === "photo" ? (
        <div className="flex flex-col gap-2">
          {!photo ? (
            <label
              className="flex cursor-pointer items-center justify-center rounded-[7px] border border-dashed px-3 py-6 text-[14px] font-bold"
              style={{ borderColor: "var(--line)", color: "var(--argile)" }}
            >
              📷 {t.take}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  setResult(null);
                  setPhoto(await shrink(f));
                }}
              />
            </label>
          ) : (
            <div className="flex items-start gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo} alt="" className="h-24 w-24 shrink-0 rounded-[7px] object-cover" />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <input
                  value={photoName}
                  onChange={(e) => setPhotoName(e.target.value)}
                  placeholder={t.photoName}
                  className="w-full rounded-[6px] px-3 py-1.5 text-[14px] font-semibold"
                  style={{ background: "var(--surface2)", color: "var(--ink)" }}
                />
                <input
                  type="number"
                  inputMode="numeric"
                  min={10}
                  max={5000}
                  value={photoGrams}
                  onChange={(e) => setPhotoGrams(e.target.value)}
                  placeholder={t.photoGrams}
                  className="tabnum w-full rounded-[6px] px-3 py-1.5 text-[14px] font-semibold"
                  style={{ background: "var(--surface2)", color: "var(--ink)" }}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    disabled={reading}
                    onClick={() => void readPhoto()}
                    className="etal-btn etal-btn--color text-[13px] disabled:opacity-60"
                    style={{ "--c": "var(--argile)" } as React.CSSProperties}
                  >
                    {reading ? t.reading : t.read}
                  </button>
                  <button
                    onClick={() => {
                      setPhoto(null);
                      setResult(null);
                    }}
                    className="text-[12px] font-semibold"
                    style={{ color: "var(--soft)" }}
                  >
                    {t.retake}
                  </button>
                </div>
              </div>
            </div>
          )}

          {result ? (
            <div className="flex flex-col gap-1.5 rounded-[7px] p-2" style={{ background: "var(--ground)" }}>
              <div className="flex flex-wrap items-baseline justify-between gap-2 px-1">
                <span className="text-[14px] font-bold">{result.title}</span>
                <span className="text-[12px]" style={{ color: "var(--soft)" }}>
                  {result.precision === "known" ? t.known : t.rough} · {Math.round(result.confidence * 100)} %
                </span>
              </div>
              {result.lines.map((l) => (
                <div key={l.key} className="flex items-center gap-2 px-1">
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{l.label}</span>
                  <input
                    type="number"
                    min={0}
                    step={5}
                    value={l.servedG}
                    onChange={(e) => {
                      const served = Number(e.target.value) || 0;
                      setResult((prev) =>
                        prev
                          ? {
                              ...prev,
                              lines: prev.lines.map((x) =>
                                x.key === l.key
                                  ? {
                                      ...x,
                                      servedG: served,
                                      grams: x.servedG > 0 ? Math.round((x.grams * served) / x.servedG) : served,
                                      kcal: x.servedG > 0 ? Math.round((x.kcal * served) / x.servedG) : 0,
                                      protein: x.servedG > 0 ? Math.round((x.protein * served) / x.servedG) : 0,
                                    }
                                  : x,
                              ),
                            }
                          : prev,
                      );
                    }}
                    className="tabnum w-[68px] rounded-[6px] px-2 py-1 text-right text-[13px] font-bold"
                    style={{ background: "var(--surface2)", color: "var(--ink)" }}
                  />
                  <span className="w-[54px] text-[11px]" style={{ color: "var(--soft)" }}>
                    g {t.served}
                  </span>
                  <span className="tabnum w-[64px] text-right text-[12px]" style={{ color: "var(--soft)" }}>
                    {l.kcal} kcal
                  </span>
                  <button
                    onClick={() => setResult((prev) => (prev ? { ...prev, lines: prev.lines.filter((x) => x.key !== l.key) } : prev))}
                    className="px-1 text-[13px] font-bold"
                    style={{ color: "var(--soft)" }}
                    aria-label="remove"
                  >
                    ×
                  </button>
                </div>
              ))}
              {result.notes ? (
                <p className="px-1 text-[11.5px]" style={{ color: "var(--soft)" }}>
                  {result.notes}
                </p>
              ) : null}
              <div className="flex flex-wrap items-center justify-between gap-2 px-1 pt-1">
                <span className="tabnum text-[14px] font-bold">
                  ≈ {resultKcal} kcal · {resultProtein} g P
                </span>
                <button
                  disabled={busy || result.lines.length === 0}
                  onClick={() =>
                    void send({
                      kind: "composed",
                      title: result.title,
                      precision: result.precision,
                      lines: result.lines.map((l) => ({ key: l.key, grams: l.grams, state: l.state === "cooked" ? "cooked" : "raw" })),
                    })
                  }
                  className="etal-btn etal-btn--color text-[13px]"
                  style={{ "--c": "var(--argile)" } as React.CSSProperties}
                >
                  {t.addBtn}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === "portion" ? (
        portions.filter((p) => p.left > 0).length === 0 ? (
          <p className="text-[13px]" style={{ color: "var(--soft)" }}>
            {t.noDish}{" "}
            <a href="/free" className="font-semibold underline underline-offset-2" style={{ color: "var(--argile)" }}>
              {t.makeOne}
            </a>
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {portions
              .filter((p) => p.left > 0)
              .map((p) => (
                <button
                  key={p.dishId}
                  disabled={busy}
                  onClick={() => void send({ kind: "portion", dishId: p.dishId })}
                  className="flex items-center justify-between gap-2 rounded-[6px] px-3 py-2 text-left transition-colors hover:bg-[var(--surface2)]"
                  style={{ background: "var(--ground)" }}
                >
                  <span className="min-w-0 truncate text-[14px] font-bold">{p.title}</span>
                  <span className="tabnum shrink-0 text-[12.5px]" style={{ color: "var(--soft)" }}>
                    ≈ {Math.round(p.kcal)} kcal · {Math.round(p.protein)} g P · {p.left} {t.left}
                  </span>
                </button>
              ))}
          </div>
        )
      ) : null}

      {tab === "food" ? (
        <div className="flex flex-col gap-2">
          {picked ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[14px] font-bold">{picked.label}</span>
              <input
                type="number"
                min={1}
                max={5000}
                step={10}
                value={grams}
                onChange={(e) => setGrams(Number(e.target.value) || 0)}
                className="tabnum w-[84px] rounded-[6px] px-2 py-1.5 text-[14px] font-bold"
                style={{ background: "var(--surface2)", color: "var(--ink)" }}
              />
              <span className="text-[13px]" style={{ color: "var(--soft)" }}>
                {t.grams} · ≈ {Math.round((picked.per100.kcal * grams) / 100)} kcal · {Math.round((picked.per100.protein * grams) / 100)} g P
              </span>
              <button
                disabled={busy || grams <= 0}
                onClick={() => void send({ kind: "food", key: picked.key, grams })}
                className="etal-btn etal-btn--color text-[13px]"
                style={{ "--c": "var(--argile)" } as React.CSSProperties}
              >
                {t.addBtn}
              </button>
              <button onClick={() => setPicked(null)} className="text-[12px] font-semibold" style={{ color: "var(--soft)" }}>
                ×
              </button>
            </div>
          ) : (
            <>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t.search}
                autoFocus
                className="w-full rounded-[6px] px-3 py-2 text-[14px] font-semibold"
                style={{ background: "var(--surface2)", color: "var(--ink)" }}
              />
              {hits.length ? (
                <div className="max-h-[220px] overflow-auto rounded-[6px]" style={{ background: "var(--ground)" }}>
                  {hits.map((h) => (
                    <button
                      key={h.key}
                      onClick={() => {
                        setPicked(h);
                        setHits([]);
                      }}
                      className="block w-full px-3 py-2 text-left transition-colors hover:bg-[var(--surface2)]"
                    >
                      <span className="block text-[14px] font-bold">{h.label}</span>
                      <span className="block text-[12px]" style={{ color: "var(--soft)" }}>
                        {h.detail}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      {tab === "ballpark" ? (
        <div className="flex flex-wrap items-center gap-2">
          {presets.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                setKcal(p.kcal);
                setProtein(Math.round((p.kcal * 0.2) / 4));
              }}
              aria-pressed={kcal === p.kcal}
              className="rounded-full px-3 py-1.5 text-[13px] font-bold transition-colors"
              style={{ background: kcal === p.kcal ? "var(--ink)" : "var(--surface2)", color: kcal === p.kcal ? "var(--ground)" : "var(--ink)" }}
            >
              {p.label} · {p.kcal}
            </button>
          ))}
          <input
            type="number"
            min={1}
            max={5000}
            step={50}
            value={kcal}
            onChange={(e) => setKcal(Number(e.target.value) || 0)}
            className="tabnum w-[92px] rounded-[6px] px-2 py-1.5 text-[15px] font-bold"
            style={{ background: "var(--surface2)", color: "var(--ink)" }}
          />
          <span className="text-[13px]" style={{ color: "var(--soft)" }}>
            {t.kcal}
          </span>
          <input
            type="number"
            min={0}
            max={400}
            step={5}
            value={protein}
            onChange={(e) => setProtein(Number(e.target.value) || 0)}
            className="tabnum w-[72px] rounded-[6px] px-2 py-1.5 text-[15px] font-bold"
            style={{ background: "var(--surface2)", color: "var(--ink)" }}
          />
          <span className="text-[13px]" style={{ color: "var(--soft)" }}>
            {t.protein}
          </span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t.name}
            className="min-w-[160px] flex-1 rounded-[6px] px-3 py-1.5 text-[14px] font-semibold"
            style={{ background: "var(--surface2)", color: "var(--ink)" }}
          />
          <button
            disabled={busy || kcal <= 0}
            onClick={() => void send({ kind: "ballpark", kcal, protein, title })}
            className="etal-btn etal-btn--color text-[13px]"
            style={{ "--c": "var(--argile)" } as React.CSSProperties}
          >
            {t.addBtn}
          </button>
        </div>
      ) : null}

      {error ? (
        <p className="text-[12.5px] font-semibold" style={{ color: "var(--tomate)" }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
