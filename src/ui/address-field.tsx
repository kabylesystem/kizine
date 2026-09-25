"use client";

import { useEffect, useRef, useState } from "react";

export interface Suggestion {
  label: string;
  full: string;
  lat: number;
  lon: number;
}

/**
 * Champ d'adresse avec propositions, comme partout ailleurs : on tape trois
 * lettres et on choisit. Sans ça il fallait deviner l'orthographe exacte et
 * l'API renvoyait « adresse introuvable ».
 */
export function AddressField({
  value,
  onChange,
  placeholder,
  width = 260,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  width?: number;
}) {
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const box = useRef<HTMLDivElement | null>(null);
  const picked = useRef(false);

  useEffect(() => {
    if (picked.current) {
      picked.current = false;
      return;
    }
    if (value.trim().length < 3) {
      setItems([]);
      return;
    }
    setLoading(true);
    // Nominatim demande de ne pas marteler : on attend qu'il ait fini de taper.
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/geo?q=${encodeURIComponent(value)}`);
        const data = (await res.json()) as { results: Suggestion[] };
        setItems(data.results);
        setOpen(data.results.length > 0);
      } finally {
        setLoading(false);
      }
    }, 450);
    return () => window.clearTimeout(timer);
  }, [value]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  return (
    <div ref={box} className="relative" style={{ width }}>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => items.length > 0 && setOpen(true)}
        placeholder={placeholder}
        autoComplete="off"
        className="w-full rounded-[6px] px-2.5 py-2 text-[13.5px] font-semibold"
        style={{ background: "var(--surface2)", color: "var(--ink)" }}
      />
      {loading ? (
        <span
          className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px]"
          style={{ color: "var(--soft)" }}
        >
          …
        </span>
      ) : null}
      {open && items.length > 0 ? (
        <div
          className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 overflow-hidden rounded-[7px]"
          style={{ background: "var(--surface)", boxShadow: "0 18px 40px -18px rgb(8 10 7 / 0.7)" }}
        >
          {items.map((s) => (
            <button
              key={s.full}
              onClick={() => {
                picked.current = true;
                onChange(s.full);
                setOpen(false);
              }}
              className="block w-full px-3 py-2 text-left text-[13px] font-semibold transition-colors hover:bg-[var(--surface2)]"
            >
              {s.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
