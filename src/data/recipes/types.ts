import type { IngredientRole, SlotKind } from "../../core/types";

/** [conceptId, rôle, référence g, min g, max g, raideur?, options?] */
export type IngRow = [
  string,
  IngredientRole,
  number,
  number,
  number,
  number?,
  { state?: "raw" | "cooked" | "dry" | "prepared"; optional?: boolean; note?: string }?,
];

export interface RecipeSeed {
  id: string;
  title: string;
  titleEn?: string;
  cuisine: string;
  slots: SlotKind[];
  flavors: string[];
  techniques: string[];
  textures?: string[];
  active: number;
  passive?: number;
  pans?: number;
  equip?: string[];
  difficulty?: number;
  spice?: number;
  leftoverDays?: number;
  portable?: boolean;
  goodCold?: boolean;
  reheatable?: boolean;
  prepAhead?: boolean;
  ing: IngRow[];
  steps: string[];
  subs?: [string, string, number?][];
  notes?: string;
}
