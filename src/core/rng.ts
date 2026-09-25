/** Générateur déterministe (mulberry32). Même seed, même plan : c'est ce qui rend le planificateur testable. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Tirage pondéré : casse la monotonie sans jamais choisir un mauvais candidat. */
export function weightedPick<T>(items: { item: T; weight: number }[], rng: () => number): T | null {
  const positive = items.filter((i) => i.weight > 0);
  if (positive.length === 0) return items[0]?.item ?? null;
  const total = positive.reduce((s, i) => s + i.weight, 0);
  let r = rng() * total;
  for (const i of positive) {
    r -= i.weight;
    if (r <= 0) return i.item;
  }
  return positive[positive.length - 1]?.item ?? null;
}

export function shuffled<T>(items: T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const a = out[i]!;
    const b = out[j]!;
    out[i] = b;
    out[j] = a;
  }
  return out;
}
