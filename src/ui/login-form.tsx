"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function LoginForm({ accounts }: { accounts: { id: string; name: string }[] }) {
  const router = useRouter();
  const [userId, setUserId] = useState(accounts[0]?.id ?? "");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(false);
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, password }),
    });
    if (res.ok) {
      router.replace("/");
      router.refresh();
      return;
    }
    setError(true);
    setPassword("");
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="mt-7 flex flex-col gap-2.5">
      {accounts.length > 1 ? (
        <div className="flex gap-2">
          {accounts.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setUserId(a.id)}
              className="flex-1 rounded-[14px] px-3 py-3 text-[15px] font-bold transition-colors"
              style={{
                background: userId === a.id ? "#22385c" : "#fff",
                color: userId === a.id ? "#fff" : "#7c7468",
              }}
            >
              {a.name}
            </button>
          ))}
        </div>
      ) : null}
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="password"
        autoFocus
        autoComplete="current-password"
        className="rounded-[14px] px-4 py-3.5 text-[16px] font-semibold outline-none focus:ring-[3px]"
        style={{ background: "#fff", color: "#3a3a3a", boxShadow: "none", "--tw-ring-color": "#f0c3d5" } as React.CSSProperties}
      />
      <button
        type="submit"
        disabled={busy || password.length === 0}
        className="rounded-full py-3.5 text-[17px] font-bold transition-transform hover:-translate-y-0.5 disabled:opacity-50"
        style={{ background: "#e07ba4", color: "#fff", boxShadow: "0 8px 0 -4px #c9628c" }}
      >
        {busy ? "…" : "Open"}
      </button>
      {error ? (
        <p className="text-center text-[13px] font-semibold" style={{ color: "#c9628c" }}>
          Not that one.
        </p>
      ) : null}
    </form>
  );
}
