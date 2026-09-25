import type { LpSolver } from "./types";

type HighsModule = {
  solve(problem: string, options?: Record<string, unknown>): {
    Status: string;
    Columns: Record<string, { Primal: number }>;
  };
};

let cached: LpSolver | null = null;

/** Charge HiGHS (WASM). En Node on résout le chemin du .wasm, en navigateur il est servi. */
export async function loadHighs(wasmDir?: string): Promise<LpSolver> {
  if (cached) return cached;
  const mod = (await import("highs")).default as unknown as (
    opts?: { locateFile?: (f: string) => string },
  ) => Promise<HighsModule>;
  const highs = await mod(
    wasmDir ? { locateFile: (f: string) => `${wasmDir}/${f}` } : undefined,
  );
  cached = {
    solve(model: string) {
      const out = highs.solve(model, { output_flag: false });
      const columns: Record<string, number> = {};
      for (const [name, col] of Object.entries(out.Columns)) columns[name] = col.Primal;
      return { status: out.Status, columns };
    },
  };
  return cached;
}
