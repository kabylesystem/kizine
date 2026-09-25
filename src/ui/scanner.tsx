"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface Concept {
  id: string;
  name: string;
  category: string;
}

interface Product {
  barcode: string;
  name: string;
  brand: string | null;
  packG: number | null;
  kcal100: number | null;
  protein100: number | null;
  carb100: number | null;
  fat100: number | null;
  imageUrl: string | null;
  cached: boolean;
  confirmed: boolean;
  nutritionFrom: "pack" | "typed" | "none";
  suggestion: { kcal: number; protein: number; carb: number; fat: number } | null;
  conceptId: string | null;
  matchedBy: "confirmed" | "category" | "name" | "none";
}

type Phase = "idle" | "camera" | "loading" | "result" | "unknown" | "saved";

/** Certaines fiches OFF n'ont que la marque comme nom : mieux vaut le code que « barilla ». */
function displayName(p: Product): string {
  const name = p.name.trim();
  if (!p.brand) return name || p.barcode;
  return name.toLowerCase() === p.brand.toLowerCase() ? `${p.brand} · ${p.barcode}` : name;
}

const WHY: Record<Product["matchedBy"], string> = {
  confirmed: "you already told me what this is",
  category: "matched on the shelf it comes from",
  name: "matched on the product name",
  none: "no match yet, pick it once and I remember",
};

export function Scanner({ compact }: { compact?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [code, setCode] = useState("");
  const [product, setProduct] = useState<Product | null>(null);
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [conceptId, setConceptId] = useState("");
  const [grams, setGrams] = useState(400);
  const [price, setPrice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cameraNote, setCameraNote] = useState<string | null>(null);
  /** Ce qu'il lit sur l'étiquette quand la base ne sait pas. */
  const [per100, setPer100] = useState({ kcal: "", protein: "" });

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const loopRef = useRef<number | null>(null);

  const stopCamera = useCallback(() => {
    if (loopRef.current !== null) {
      cancelAnimationFrame(loopRef.current);
      loopRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  const lookup = useCallback(
    async (barcode: string) => {
      stopCamera();
      setPhase("loading");
      setError(null);
      const res = await fetch(`/api/scan?barcode=${encodeURIComponent(barcode)}`);
      const data = (await res.json()) as
        | { found: true; product: Product; concepts: Concept[] }
        | { found: false; barcode: string; concepts: Concept[] }
        | { error: unknown };
      if ("error" in data) {
        setError("That is not a barcode.");
        setPhase("idle");
        return;
      }
      setConcepts(data.concepts);
      if (data.found) {
        setProduct(data.product);
        setConceptId(data.product.conceptId ?? "");
        setGrams(data.product.packG ?? 400);
        setPhase("result");
      } else {
        setProduct(null);
        setConceptId("");
        setPhase("unknown");
      }
    },
    [stopCamera],
  );

  async function startCamera() {
    setError(null);
    setCameraNote(null);
    setPhase("camera");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 } },
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();

      const native = (globalThis as { BarcodeDetector?: new (o: object) => { detect(s: CanvasImageSource): Promise<{ rawValue: string }[]> } })
        .BarcodeDetector;
      const formats = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"];

      if (native) {
        const detector = new native({ formats });
        const tick = async () => {
          if (!streamRef.current) return;
          try {
            const hits = await detector.detect(video);
            if (hits[0]?.rawValue) {
              setCode(hits[0].rawValue);
              void lookup(hits[0].rawValue);
              return;
            }
          } catch {
            /* une image ratée n'arrête pas la boucle */
          }
          loopRef.current = requestAnimationFrame(() => void tick());
        };
        void tick();
        return;
      }

      // Pas de BarcodeDetector (Firefox, Safari, Chrome sous Linux) : ZXing en WebAssembly.
      setCameraNote("Reading with the WebAssembly decoder.");
      const zxing = await import("zxing-wasm/reader");
      zxing.prepareZXingModule({ overrides: { locateFile: () => "/zxing_reader.wasm" } });
      const canvas = document.createElement("canvas");
      const ctx2d = canvas.getContext("2d", { willReadFrequently: true });
      const tick = async () => {
        if (!streamRef.current || !ctx2d) return;
        if (video.videoWidth > 0) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx2d.drawImage(video, 0, 0);
          try {
            const results = await zxing.readBarcodesFromImageData(
              ctx2d.getImageData(0, 0, canvas.width, canvas.height),
              { tryHarder: true, formats: ["EAN-13", "EAN-8", "UPC-A", "UPC-E", "Code128"] },
            );
            const hit = results.find((r) => r.text && /^[0-9]{6,14}$/.test(r.text));
            if (hit) {
              setCode(hit.text);
              void lookup(hit.text);
              return;
            }
          } catch {
            /* idem */
          }
        }
        loopRef.current = requestAnimationFrame(() => void tick());
      };
      void tick();
    } catch {
      setError("No camera available. Type the digits under the barcode instead.");
      setPhase("idle");
    }
  }

  async function save(destination: "stock" | "eaten") {
    if (!conceptId) return;
    const cents = price ? Math.round(Number(price.replace(",", ".")) * 100) : undefined;
    const res = await fetch("/api/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        barcode: code,
        conceptId,
        grams,
        destination,
        priceCents: cents && cents > 0 ? cents : undefined,
        name: product?.name,
        kcal100: per100.kcal ? Number(per100.kcal.replace(",", ".")) : undefined,
        protein100: per100.protein ? Number(per100.protein.replace(",", ".")) : undefined,
      }),
    });
    if (!res.ok) {
      setError("Could not save that.");
      return;
    }
    setPhase("saved");
    router.refresh();
  }

  function reset() {
    stopCamera();
    setPhase("idle");
    setProduct(null);
    setCode("");
    setPrice("");
    setError(null);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className={compact ? "etal-btn text-[13px]" : "etal-btn etal-btn--color text-[14px]"}
        style={compact ? undefined : ({ "--c": "#2440c8" } as React.CSSProperties)}
      >
        Scan a pack
      </button>
    );
  }

  return (
    <div className="etal-card flex flex-col gap-3 p-3">
      <div className="flex items-center gap-3">
        <h3 className="text-[15px] font-bold">Scan a pack</h3>
        <button
          onClick={() => {
            reset();
            setOpen(false);
          }}
          className="ml-auto text-[13px] font-semibold underline"
          style={{ color: "var(--soft)" }}
        >
          Close
        </button>
      </div>

      {phase === "idle" || phase === "camera" ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 14))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && code.length >= 6) void lookup(code);
              }}
              placeholder="type the digits"
              inputMode="numeric"
              className="tabnum w-[190px] rounded-[6px] px-3 py-2 text-[15px] font-bold"
              style={{ background: "var(--surface2)", color: "var(--ink)" }}
              aria-label="barcode digits"
            />
            <button
              onClick={() => void lookup(code)}
              disabled={code.length < 6}
              className="etal-btn etal-btn--color text-[14px]"
              style={{ "--c": "#2440c8" } as React.CSSProperties}
            >
              Look it up
            </button>
            <button onClick={() => void startCamera()} className="etal-btn text-[14px]">
              {phase === "camera" ? "Scanning…" : "Use the camera"}
            </button>
          </div>
          {phase === "camera" ? (
            <div className="overflow-hidden rounded-[7px]" style={{ background: "#000" }}>
              <video ref={videoRef} playsInline muted className="h-[240px] w-full object-cover" />
            </div>
          ) : null}
          {cameraNote ? (
            <p className="text-[12px]" style={{ color: "var(--soft)" }}>
              {cameraNote}
            </p>
          ) : null}
        </>
      ) : null}

      {phase === "loading" ? (
        <p className="text-[14px] font-semibold">Looking up {code}…</p>
      ) : null}

      {phase === "result" && product ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-start gap-3">
            {product.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={product.imageUrl}
                alt=""
                className="h-[64px] w-[64px] shrink-0 rounded-[6px] object-cover"
              />
            ) : null}
            <div className="min-w-0">
              <div className="text-[15px] font-bold">{displayName(product)}</div>
              <div className="text-[12px]" style={{ color: "var(--soft)" }}>
                {product.brand ? `${product.brand} · ` : ""}
                {product.packG ? `${product.packG} g pack · ` : ""}
                {product.kcal100 !== null ? `${Math.round(product.kcal100)} kcal / 100 g` : "no nutrition on file"}
                {product.protein100 !== null ? ` · ${product.protein100} g protein` : ""}
                {product.nutritionFrom === "pack" ? " · from the pack" : ""}
                {product.nutritionFrom === "typed" ? " · you read it off the label" : ""}
              </div>
            </div>
          </div>
          {product.nutritionFrom === "none" ? (
            <div
              className="rounded-[6px] px-3 py-2 text-[12.5px] font-semibold leading-snug"
              style={{ background: "var(--curcuma)", color: "var(--on-color)" }}
            >
              This pack has no nutrition table on file. Type what the label says: those are the
              brand&apos;s own numbers, and nothing else is worth storing.
              {product.suggestion ? (
                <button
                  onClick={() =>
                    setPer100({
                      kcal: String(Math.round(product.suggestion!.kcal)),
                      protein: String(product.suggestion!.protein),
                    })
                  }
                  className="mt-1.5 block underline underline-offset-2 opacity-90"
                >
                  Or start from the generic {conceptId || "food"} figures ({Math.round(product.suggestion.kcal)} kcal,{" "}
                  {product.suggestion.protein} g protein) and correct them
                </button>
              ) : null}
            </div>
          ) : null}
          <ConceptPicker
            concepts={concepts}
            value={conceptId}
            onChange={setConceptId}
            why={WHY[product.matchedBy]}
          />
          {product.nutritionFrom === "none" ? <PerHundred value={per100} onChange={setPer100} /> : null}
          <Amounts grams={grams} setGrams={setGrams} price={price} setPrice={setPrice} />
          <Actions onSave={save} disabled={!conceptId} />
        </div>
      ) : null}

      {phase === "unknown" ? (
        <div className="flex flex-col gap-3">
          <p className="text-[14px]">
            <span className="font-bold">{code}</span> is not in Open Food Facts. Tell me what it is once and
            it becomes yours.
          </p>
          <ConceptPicker concepts={concepts} value={conceptId} onChange={setConceptId} why={WHY.none} />
          <Amounts grams={grams} setGrams={setGrams} price={price} setPrice={setPrice} />
          <Actions onSave={save} disabled={!conceptId} />
        </div>
      ) : null}

      {phase === "saved" ? (
        <div className="flex items-center gap-3">
          <p className="text-[14px] font-bold" style={{ color: "var(--feuille)" }}>
            Saved. Next time this barcode goes straight through.
          </p>
          <button onClick={reset} className="etal-btn text-[13px]">
            Scan another
          </button>
        </div>
      ) : null}

      {error ? (
        <p className="text-[13px] font-semibold" style={{ color: "var(--tomate)" }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

function ConceptPicker({
  concepts,
  value,
  onChange,
  why,
}: {
  concepts: Concept[];
  value: string;
  onChange: (v: string) => void;
  why: string;
}) {
  const grouped = concepts.reduce<Record<string, Concept[]>>((acc, c) => {
    (acc[c.category] ??= []).push(c);
    return acc;
  }, {});
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[12px] font-semibold" style={{ color: "var(--soft)" }}>
        counts as · {why}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-[6px] px-3 py-2 text-[15px] font-bold"
        style={{ background: "var(--surface2)", color: "var(--ink)" }}
      >
        <option value="">pick one</option>
        {Object.entries(grouped).map(([category, list]) => (
          <optgroup key={category} label={category}>
            {list.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}

/** Saisie des valeurs de l'étiquette, quand aucune base ne les a. */
function PerHundred({
  value,
  onChange,
}: {
  value: { kcal: string; protein: string };
  onChange: (v: { kcal: string; protein: string }) => void;
}) {
  return (
    <div className="flex flex-wrap gap-3">
      <label className="flex items-center gap-2 text-[12px]" style={{ color: "var(--soft)" }}>
        kcal per 100 g
        <input
          value={value.kcal}
          onChange={(e) => onChange({ ...value, kcal: e.target.value })}
          inputMode="decimal"
          placeholder="on the label"
          className="tabnum w-[104px] rounded-[6px] px-2 py-1.5 text-[15px] font-bold"
          style={{ background: "var(--surface2)", color: "var(--ink)" }}
        />
      </label>
      <label className="flex items-center gap-2 text-[12px]" style={{ color: "var(--soft)" }}>
        protein per 100 g
        <input
          value={value.protein}
          onChange={(e) => onChange({ ...value, protein: e.target.value })}
          inputMode="decimal"
          placeholder="g"
          className="tabnum w-[88px] rounded-[6px] px-2 py-1.5 text-[15px] font-bold"
          style={{ background: "var(--surface2)", color: "var(--ink)" }}
        />
      </label>
    </div>
  );
}

function Amounts({
  grams,
  setGrams,
  price,
  setPrice,
}: {
  grams: number;
  setGrams: (n: number) => void;
  price: string;
  setPrice: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-3">
      <label className="flex items-center gap-2 text-[12px]" style={{ color: "var(--soft)" }}>
        grams on the pack
        <input
          type="number"
          min={1}
          max={20000}
          value={grams}
          onChange={(e) => setGrams(Math.max(1, Math.min(20000, Number(e.target.value))))}
          className="tabnum w-[96px] rounded-[6px] px-2 py-1.5 text-[15px] font-bold"
          style={{ background: "var(--surface2)", color: "var(--ink)" }}
        />
      </label>
      <label className="flex items-center gap-2 text-[12px]" style={{ color: "var(--soft)" }}>
        price paid (optional)
        <input
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="2,15"
          inputMode="decimal"
          className="tabnum w-[88px] rounded-[6px] px-2 py-1.5 text-[15px] font-bold"
          style={{ background: "var(--surface2)", color: "var(--ink)" }}
        />
      </label>
    </div>
  );
}

function Actions({
  onSave,
  disabled,
}: {
  onSave: (d: "stock" | "eaten") => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() => onSave("stock")}
        disabled={disabled}
        className="etal-btn etal-btn--color text-[14px]"
        style={{ "--c": "#1f9d55" } as React.CSSProperties}
      >
        Put in the cupboard
      </button>
      <button onClick={() => onSave("eaten")} disabled={disabled} className="etal-btn text-[14px]">
        Just remember the product
      </button>
    </div>
  );
}
