import { createClient, type Client, type InValue } from "@libsql/client";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import * as schema from "./schema";

/**
 * Une seule couche pour les deux mondes : un fichier SQLite en local, une base
 * Turso en production. Vercel n'a pas de disque persistant, donc le fichier ne
 * peut pas y vivre ; libSQL parle le même SQL, ce qui évite de réécrire
 * cent soixante-treize requêtes en Postgres.
 *
 * Tout est asynchrone, y compris en local, pour que le code soit identique
 * des deux côtés et qu'un bug ne se révèle pas seulement en production.
 */

const REMOTE_URL = process.env.TURSO_DATABASE_URL;
const REMOTE_TOKEN = process.env.TURSO_AUTH_TOKEN;
const LOCAL_PATH = process.env.CUISINE_DB ?? join(process.cwd(), "data", "cuisine.sqlite");

let client: Client | null = null;

export function conn(): Client {
  if (client) return client;
  client = REMOTE_URL
    ? createClient({ url: REMOTE_URL, authToken: REMOTE_TOKEN })
    : createClient({ url: `file:${LOCAL_PATH}` });
  return client;
}

export type Row = Record<string, unknown>;

export interface Prepared {
  get<T = Row>(...params: unknown[]): Promise<T | undefined>;
  all<T = Row>(...params: unknown[]): Promise<T[]>;
  run(...params: unknown[]): Promise<{ changes: number }>;
}

const args = (params: unknown[]): InValue[] =>
  params.map((p) => (p === undefined ? null : (p as InValue)));

/**
 * Même forme d'appel qu'avant (`prepare(sql).get(a, b)`), en asynchrone.
 * Garder cette forme a permis de migrer le code sans le réécrire ligne à ligne.
 */
export function prepare(sqlText: string): Prepared {
  return {
    async get<T = Row>(...params: unknown[]): Promise<T | undefined> {
      const res = await conn().execute({ sql: sqlText, args: args(params) });
      return res.rows[0] as T | undefined;
    },
    async all<T = Row>(...params: unknown[]): Promise<T[]> {
      const res = await conn().execute({ sql: sqlText, args: args(params) });
      return res.rows as unknown as T[];
    },
    async run(...params: unknown[]): Promise<{ changes: number }> {
      const res = await conn().execute({ sql: sqlText, args: args(params) });
      return { changes: Number(res.rowsAffected ?? 0) };
    },
  };
}

export async function exec(sqlText: string): Promise<void> {
  await conn().execute(sqlText);
}

/** Le client asynchrone, avec la même surface que l'ancien `rawDb()`. */
export interface Db {
  prepare(sqlText: string): Prepared;
  exec(sqlText: string): Promise<void>;
  /**
   * Une transaction réelle. libSQL n'aime pas les BEGIN/COMMIT lancés à la main
   * sur une connexion HTTP : on passe par son API de transaction.
   */
  tx<T>(fn: (t: Tx) => Promise<T>): Promise<T>;
}

export interface Tx {
  prepare(sqlText: string): Prepared;
}

export function rawDb(): Db {
  return {
    prepare,
    exec,
    async tx<T>(fn: (t: Tx) => Promise<T>): Promise<T> {
      const t = await conn().transaction("write");
      try {
        const out = await fn({
          prepare(sqlText: string): Prepared {
            return {
              async get<R = Row>(...params: unknown[]): Promise<R | undefined> {
                const res = await t.execute({ sql: sqlText, args: args(params) });
                return res.rows[0] as R | undefined;
              },
              async all<R = Row>(...params: unknown[]): Promise<R[]> {
                const res = await t.execute({ sql: sqlText, args: args(params) });
                return res.rows as unknown as R[];
              },
              async run(...params: unknown[]): Promise<{ changes: number }> {
                const res = await t.execute({ sql: sqlText, args: args(params) });
                return { changes: Number(res.rowsAffected ?? 0) };
              },
            };
          },
        });
        await t.commit();
        return out;
      } catch (err) {
        await t.rollback();
        throw err;
      }
    },
  };
}

export const db = drizzle(
  async (sqlText, params, method) => {
    const res = await conn().execute({ sql: sqlText, args: args(params) });
    const rows = res.rows.map((r) => Array.from(r as unknown as ArrayLike<unknown>));
    if (method === "get") return { rows: rows[0] ?? [] };
    if (method === "run") return { rows: [] };
    return { rows };
  },
  { schema, casing: "snake_case" },
);

export async function migrate(): Promise<void> {
  const c = conn();
  await c.execute("CREATE TABLE IF NOT EXISTS __migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)");
  const dir = join(process.cwd(), "drizzle");
  if (!existsSync(dir)) return;
  const done = await c.execute("SELECT name FROM __migrations");
  const applied = new Set(done.rows.map((r) => String(r.name)));
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    if (applied.has(file)) continue;
    const sqlText = readFileSync(join(dir, file), "utf8");
    for (const stmtText of sqlText.split("--> statement-breakpoint")) {
      const trimmed = stmtText.trim();
      if (!trimmed) continue;
      try {
        await c.execute(trimmed);
      } catch (err) {
        // Une colonne déjà présente n'est pas une erreur : c'est le cas quand
        // on a dû la poser à la main sur la base distante. On note la migration
        // comme faite plutôt que de bloquer toutes les suivantes.
        const msg = String((err as Error).message ?? "");
        if (!msg.includes("duplicate column name")) throw err;
        console.log(`  colonne déjà présente, ignoré : ${trimmed.slice(0, 60)}`);
      }
    }
    await c.execute({
      sql: "INSERT INTO __migrations (name, applied_at) VALUES (?, ?)",
      args: [file, Math.floor(Date.now() / 1000)],
    });
    console.log(`migrated ${file}`);
  }
}

export { schema };
