"use client";

import { useState } from "react";

export function PasswordChange({ lang }: { lang: "en" | "fr" }) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "wrong">("idle");
  const fr = lang === "fr";

  async function save() {
    setState("busy");
    const res = await fetch("/api/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ current, next }),
    });
    if (res.ok) {
      setState("done");
      setCurrent("");
      setNext("");
      setTimeout(() => setOpen(false), 1500);
    } else {
      setState("wrong");
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-[13px] font-semibold underline underline-offset-2"
        style={{ color: "var(--soft)" }}
      >
        {fr ? "Changer mon mot de passe" : "Change my password"}
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="password"
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
        placeholder={fr ? "actuel" : "current"}
        autoComplete="current-password"
        className="w-[130px] rounded-[6px] px-3 py-2 text-[14px] font-semibold"
        style={{ background: "var(--surface2)", color: "var(--ink)" }}
      />
      <input
        type="password"
        value={next}
        onChange={(e) => setNext(e.target.value)}
        placeholder={fr ? "nouveau" : "new"}
        autoComplete="new-password"
        className="w-[130px] rounded-[6px] px-3 py-2 text-[14px] font-semibold"
        style={{ background: "var(--surface2)", color: "var(--ink)" }}
      />
      <button
        onClick={() => void save()}
        disabled={state === "busy" || current.length === 0 || next.length < 4}
        className="etal-btn etal-btn--color text-[13px]"
        style={{ "--c": "#137a42" } as React.CSSProperties}
      >
        {state === "done" ? (fr ? "changé" : "changed") : fr ? "Enregistrer" : "Save"}
      </button>
      <button onClick={() => setOpen(false)} className="etal-btn text-[13px]">
        {fr ? "annuler" : "cancel"}
      </button>
      {state === "wrong" ? (
        <span className="text-[12.5px] font-semibold" style={{ color: "var(--tomate)" }}>
          {fr ? "mot de passe actuel incorrect" : "current password is wrong"}
        </span>
      ) : null}
    </div>
  );
}
