"use client";

import { useId, useState } from "react";

/**
 * Palette de graphiques validée par scripts/validate_palette.js du skill dataviz :
 * bande de clarté, plancher de chroma, séparation daltonienne et contraste,
 * en clair comme en sombre. Ne pas retoucher ces valeurs sans revalider.
 */
export const SERIES_LIGHT = ["#d63127", "#2440c8", "#c07a06"];
export const SERIES_DARK = ["#d95a4e", "#5f75d8", "#c08423"];

export interface Point {
  x: string;
  y: number | null;
}

export interface Series {
  name: string;
  points: Point[];
  colorIndex: number;
}

/**
 * Les couleurs passent par des variables CSS : le serveur et le client rendent
 * exactement le même HTML, et le thème est géré par la feuille de style.
 */
const SERIES_VARS = ["var(--series-1)", "var(--series-2)", "var(--series-3)"];

function niceBounds(values: number[], rule?: number): [number, number] {
  const all = rule === undefined ? values : [...values, rule];
  if (all.length === 0) return [0, 1];
  const min = Math.min(...all);
  const max = Math.max(...all);
  if (min === max) return [min - 1, max + 1];
  const pad = (max - min) * 0.12;
  return [min - pad, max + pad];
}

export function LineChart({
  series,
  rule,
  ruleLabel,
  unit,
  height = 200,
  decimals = 0,
}: {
  series: Series[];
  rule?: number;
  ruleLabel?: string;
  unit: string;
  height?: number;
  decimals?: number;
}) {
  const format = (v: number) => v.toFixed(decimals);
  const colors = SERIES_VARS;
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);

  const xs = series[0]?.points.map((p) => p.x) ?? [];
  const values = series.flatMap((s) => s.points.map((p) => p.y).filter((v): v is number => v !== null));
  if (values.length === 0) {
    return (
      <p className="py-6 text-center text-[14px]" style={{ color: "var(--soft)" }}>
        Nothing logged yet. This fills in as you cook and weigh in.
      </p>
    );
  }

  const [lo, hi] = niceBounds(values, rule);
  const W = 720;
  const H = height;
  const padL = 46;
  const padR = 12;
  const padT = 12;
  const padB = 26;
  const px = (i: number) => padL + (i / Math.max(1, xs.length - 1)) * (W - padL - padR);
  const py = (v: number) => padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB);

  const ticks = [lo, lo + (hi - lo) / 2, hi];

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-3">
        {series.map((s) => (
          <span key={s.name} className="flex items-center gap-1.5 text-[12px] font-semibold">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: colors[s.colorIndex % colors.length] }}
            />
            {s.name}
          </span>
        ))}
        {rule !== undefined ? (
          <span className="flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: "var(--soft)" }}>
            <span className="h-0 w-4 border-t-2 border-dashed" style={{ borderColor: "var(--soft)" }} />
            {ruleLabel ?? "target"}
          </span>
        ) : null}
        <button
          onClick={() => setTable((v) => !v)}
          className="ml-auto text-[12px] font-semibold underline-offset-4 hover:underline"
          style={{ color: "var(--soft)" }}
        >
          {table ? "show chart" : "show numbers"}
        </button>
      </div>

      {table ? (
        <div className="etal-scroll">
          <table className="w-full text-[13px]">
            <thead>
              <tr>
                <th className="py-1 text-left font-bold">Day</th>
                {series.map((s) => (
                  <th key={s.name} className="py-1 text-right font-bold">
                    {s.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {xs.map((x, i) => (
                <tr key={x} style={{ borderTop: "1px solid var(--line)" }}>
                  <td className="py-1">{x}</td>
                  {series.map((s) => (
                    <td key={s.name} className="tabnum py-1 text-right">
                      {s.points[i]?.y === null || s.points[i]?.y === undefined ? "—" : format(s.points[i]!.y!)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          style={{ overflow: "visible" }}
          onMouseLeave={() => setHover(null)}
          role="img"
          aria-label={series.map((s) => s.name).join(", ")}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={W - padR} y1={py(t)} y2={py(t)} stroke="var(--line)" strokeWidth="1" />
              <text x={padL - 8} y={py(t) + 4} textAnchor="end" fontSize="11" fill="var(--soft)">
                {format(t)}
              </text>
            </g>
          ))}

          {rule !== undefined ? (
            <line
              x1={padL}
              x2={W - padR}
              y1={py(rule)}
              y2={py(rule)}
              stroke="var(--soft)"
              strokeWidth="2"
              strokeDasharray="5 4"
            />
          ) : null}

          {series.map((s) => {
            const pts = s.points
              .map((p, i) => (p.y === null ? null : `${px(i)},${py(p.y)}`))
              .filter((v): v is string => v !== null);
            if (pts.length === 0) return null;
            const color = colors[s.colorIndex % colors.length];
            return (
              <g key={s.name}>
                <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                {s.points.map((p, i) =>
                  p.y === null ? null : (
                    <circle key={`${id}-${s.name}-${i}`} cx={px(i)} cy={py(p.y)} r={hover === i ? 5 : 3} fill={color} stroke="var(--ground)" strokeWidth="2" />
                  ),
                )}
              </g>
            );
          })}

          {xs.map((x, i) => (
            <rect
              key={x}
              x={px(i) - (W - padL - padR) / Math.max(1, xs.length) / 2}
              y={padT}
              width={(W - padL - padR) / Math.max(1, xs.length)}
              height={H - padT - padB}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
            />
          ))}

          {hover !== null ? (
            <g>
              <line x1={px(hover)} x2={px(hover)} y1={padT} y2={H - padB} stroke="var(--soft)" strokeWidth="1" />
              <text x={px(hover)} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--ink)" fontWeight="700">
                {xs[hover]}
                {series
                  .map((s) => (s.points[hover]?.y === null || s.points[hover]?.y === undefined ? null : ` · ${format(s.points[hover]!.y!)} ${unit}`))
                  .filter(Boolean)
                  .join("")}
              </text>
            </g>
          ) : (
            <text x={padL} y={H - 8} fontSize="11" fill="var(--soft)">
              {xs[0]} → {xs[xs.length - 1]}
            </text>
          )}
        </svg>
      )}
    </div>
  );
}

export function RankedBars({
  rows,
  unit,
  decimals = 0,
}: {
  rows: { label: string; value: number }[];
  unit: string;
  decimals?: number;
}) {
  const format = (v: number) => v.toFixed(decimals);
  if (rows.length === 0) {
    return (
      <p className="py-4 text-center text-[14px]" style={{ color: "var(--soft)" }}>
        Nothing to rank yet.
      </p>
    );
  }
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="flex flex-col gap-1.5">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-3">
          <span className="w-[124px] shrink-0 truncate text-[13px] font-semibold">{r.label}</span>
          <span className="h-4 flex-1 overflow-hidden rounded-[4px]" style={{ background: "var(--surface2)" }}>
            <span
              className="block h-full rounded-[4px]"
              style={{ width: `${(r.value / max) * 100}%`, background: "var(--myrtille)" }}
            />
          </span>
          <span className="tabnum w-[74px] shrink-0 text-right text-[13px] font-bold">
            {format(r.value)} {unit}
          </span>
        </div>
      ))}
    </div>
  );
}
