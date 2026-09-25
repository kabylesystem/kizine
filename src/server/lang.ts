import { cookies } from "next/headers";

export type Lang = "en" | "fr";

/**
 * L'interface est en anglais, mais default-user ne connaît pas tous les aliments
 * dans cette langue. Un interrupteur global bascule les NOMS (aliments, plats),
 * pas la structure de l'écran.
 */
export async function getLang(): Promise<Lang> {
  const store = await cookies();
  return store.get("lang")?.value === "fr" ? "fr" : "en";
}

/** Colonne SQL à lire selon la langue, pour ne pas dupliquer chaque requête. */
export const nameColumn = (lang: Lang) => (lang === "fr" ? "name_fr" : "name_en");
export const titleColumn = (lang: Lang) =>
  lang === "fr" ? "title" : "COALESCE(title_en, title)";
