import { cookies } from "next/headers";
import { createHmac, timingSafeEqual, randomBytes, scryptSync } from "node:crypto";
import { rawDb } from "@/db/client";

/**
 * Comptes de Kizine. Chaque personne a son mot de passe et ses données ; les
 * recettes et les tables de nutrition, elles, sont partagées.
 *
 * Pas de fournisseur d'identité, pas d'e-mail : le cookie de session est signé
 * avec un secret serveur et porte l'identifiant du compte. C'est suffisant pour
 * deux personnes qui se connaissent, et ça n'envoie leurs données nulle part.
 */
const COOKIE = "kizine_session";
const MAX_AGE = 60 * 60 * 24 * 365;

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET manquant");
  return s;
}

const sign = (value: string): string => createHmac("sha256", secret()).update(value).digest("base64url");

/** scrypt avec sel par utilisateur : une base volée ne rend pas les mots de passe. */
export function hashPassword(password: string, salt = randomBytes(16).toString("hex")): string {
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

export function verifyPassword(password: string, stored: string | null): boolean {
  if (!stored) return false;
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const a = Buffer.from(hash, "hex");
  const b = scryptSync(password, salt, 64);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function issue(userId: string): string {
  const payload = `${userId}.${Date.now()}.${randomBytes(9).toString("base64url")}`;
  return `${payload}.${sign(payload)}`;
}

/** Renvoie l'identifiant porté par un jeton valide, sinon null. */
export function readToken(token: string | undefined): string | null {
  if (!token) return null;
  const i = token.lastIndexOf(".");
  if (i <= 0) return null;
  const payload = token.slice(0, i);
  const given = Buffer.from(token.slice(i + 1));
  const want = Buffer.from(sign(payload));
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null;
  return payload.split(".")[0] ?? null;
}

export interface Account {
  id: string;
  name: string;
  displayName: string | null;
  avatarPath: string | null;
  greeting: string | null;
  onboarded: boolean;
}

export async function listAccounts(): Promise<Account[]> {
  const rows = (await rawDb()
    // Elle d'abord : c'est son app avant d'être la mienne.
    .prepare(
      "SELECT id, name, display_name, avatar_path, greeting, onboarded_at FROM users ORDER BY COALESCE(display_name, name)",
    )
    .all()) as {
    id: string;
    name: string;
    display_name: string | null;
    avatar_path: string | null;
    greeting: string | null;
    onboarded_at: number | null;
  }[];
  return rows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    displayName: r.display_name,
    avatarPath: r.avatar_path,
    greeting: r.greeting,
    onboarded: r.onboarded_at !== null,
  }));
}

/**
 * Le compte de la requête en cours. Tout ce qui lit ou écrit des données
 * personnelles passe par ici : il n'y a plus d'identifiant en dur.
 */
export async function currentUserId(): Promise<string> {
  const store = await cookies();
  const id = readToken(store.get(COOKIE)?.value);
  if (id) return id;
  // Développement local sans mot de passe : le compte historique.
  if (!process.env.APP_PASSWORD) return "default-user";
  throw new Error("session absente");
}

export async function currentAccount(): Promise<Account | null> {
  const id = await currentUserId().catch(() => null);
  if (!id) return null;
  const rows = await listAccounts();
  return rows.find((a) => a.id === id) ?? null;
}

export async function isLoggedIn(): Promise<boolean> {
  if (!process.env.APP_PASSWORD) return true;
  const store = await cookies();
  return readToken(store.get(COOKIE)?.value) !== null;
}

export const SESSION_COOKIE = COOKIE;
export const SESSION_MAX_AGE = MAX_AGE;

/**
 * Tant que l'écran d'accueil n'a pas été lu, on y ramène. Un cadeau qu'on rate
 * en cliquant trop vite n'est pas un cadeau.
 */
export async function needsWelcome(): Promise<boolean> {
  const id = await currentUserId().catch(() => null);
  if (!id) return false;
  const row = (await rawDb().prepare("SELECT welcomed_at, greeting FROM users WHERE id = ?").get(id)) as
    | { welcomed_at: number | null; greeting: string | null }
    | undefined;
  if (!row) return false;
  // Le compte de default-user n'a pas de mot d'accueil : il n'en a pas besoin.
  return row.welcomed_at === null && Boolean(row.greeting);
}
