export type FatigueEntity = "concept" | "protein" | "dish" | "cuisine" | "flavor" | "technique";

/**
 * Temps de récupération par type, en jours.
 * Un plat identique lasse longtemps, le riz quotidien ne lasse presque pas.
 * Ce sont des réglages exposés, pas des constantes cachées.
 */
export const DEFAULT_TAU: Record<FatigueEntity, number> = {
  dish: 10,
  protein: 3,
  cuisine: 5,
  flavor: 4,
  technique: 3,
  concept: 2.5,
};

/** Impact d'une exposition, avant décroissance. */
export const DEFAULT_IMPACT: Record<FatigueEntity, number> = {
  dish: 1,
  protein: 0.7,
  cuisine: 0.6,
  flavor: 0.5,
  technique: 0.4,
  concept: 0.35,
};

export interface FatigueState {
  entityType: FatigueEntity;
  entityId: string;
  level: number;
  lastExposureDay: number | null;
  tauDays: number;
}

/** Décroissance exponentielle avec rebond : le modèle des rebounding bandits. */
export function decayed(state: FatigueState, today: number): number {
  if (state.lastExposureDay === null) return 0;
  const dt = Math.max(0, today - state.lastExposureDay);
  return state.level * Math.exp(-dt / state.tauDays);
}

export function expose(state: FatigueState, day: number, impact: number): FatigueState {
  return {
    ...state,
    level: decayed(state, day) + impact,
    lastExposureDay: day,
  };
}

export class FatigueTracker {
  private states = new Map<string, FatigueState>();

  constructor(
    private tau: Record<FatigueEntity, number> = DEFAULT_TAU,
    private impact: Record<FatigueEntity, number> = DEFAULT_IMPACT,
  ) {}

  private key(type: FatigueEntity, id: string): string {
    return `${type}:${id}`;
  }

  load(states: FatigueState[]): void {
    for (const s of states) this.states.set(this.key(s.entityType, s.entityId), s);
  }

  level(type: FatigueEntity, id: string, day: number): number {
    const s = this.states.get(this.key(type, id));
    return s ? decayed(s, day) : 0;
  }

  record(type: FatigueEntity, id: string, day: number): void {
    const k = this.key(type, id);
    const current =
      this.states.get(k) ??
      ({ entityType: type, entityId: id, level: 0, lastExposureDay: null, tauDays: this.tau[type] } as FatigueState);
    this.states.set(k, expose(current, day, this.impact[type]));
  }

  snapshot(): FatigueState[] {
    return [...this.states.values()];
  }

  clone(): FatigueTracker {
    const t = new FatigueTracker(this.tau, this.impact);
    t.load(this.snapshot().map((s) => ({ ...s })));
    return t;
  }
}
