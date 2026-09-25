/**
 * Cache mémoire des données de RÉFÉRENCE, celles qui ne bougent qu'au moment
 * d'un import : recettes, aliments, tables de nutrition, rendements de cuisson.
 *
 * Sur Vercel, chaque requête SQL est un aller-retour HTTP vers Turso. Les pages
 * en enchaînaient une quinzaine, d'où les deux secondes par clic. Garder ces
 * tables en mémoire dans l'instance ramène ça à deux ou trois allers-retours,
 * et une instance froide ne coûte qu'un chargement.
 *
 * Rien de PERSONNEL ici : pesées, plans, stock et préférences restent lus à
 * chaque fois, sinon une modification ne se verrait pas.
 */
const TTL_MS = 10 * 60 * 1000;

interface Entry<T> {
  value: T;
  at: number;
}

const store = new Map<string, Entry<unknown>>();

export async function reference<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = store.get(key) as Entry<T> | undefined;
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const value = await load();
  store.set(key, { value, at: Date.now() });
  return value;
}

/** À appeler dès qu'un import réécrit les tables de référence. */
export function invalidateReference(): void {
  store.clear();
}
