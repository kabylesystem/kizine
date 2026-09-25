import { randomBytes } from "node:crypto";
import { rawDb } from "../src/db/client";
import { hashPassword } from "../src/server/auth";

/**
 * Crée un compte. Le mot de passe est proposé, pas imposé : elle le changera
 * dans les paramètres si elle veut.
 */
const [id, displayName, ...rest] = process.argv.slice(2);
if (!id || !displayName) {
  console.error("usage: create-account <id> <nom affiché> [mot de passe]");
  process.exit(1);
}
const password = rest[0] ?? randomBytes(4).toString("hex");

const db = rawDb();
const now = Math.floor(Date.now() / 1000);
const exists = await db.prepare("SELECT id FROM users WHERE id = ?").get(id);

if (exists) {
  await db.prepare("UPDATE users SET display_name = ?, password_hash = ? WHERE id = ?").run(displayName, hashPassword(password), id);
  console.log(`compte ${id} mis à jour`);
} else {
  await db
    .prepare(
      "INSERT INTO users (id, name, display_name, password_hash, created_at, onboarded_at) VALUES (?,?,?,?,?,NULL)",
    )
    .run(id, displayName, displayName, hashPassword(password), now);
  await db.prepare("INSERT OR IGNORE INTO storage_locations (id, user_id, kind, label) VALUES (?,?,?,?)").run(`${id}:pantry`, id, "pantry", "Cupboard");
  await db.prepare("INSERT OR IGNORE INTO storage_locations (id, user_id, kind, label) VALUES (?,?,?,?)").run(`${id}:fridge`, id, "fridge", "Fridge");
  await db.prepare("INSERT OR IGNORE INTO storage_locations (id, user_id, kind, label) VALUES (?,?,?,?)").run(`${id}:freezer`, id, "freezer", "Freezer");
  console.log(`compte ${id} créé`);
}
console.log(`mot de passe : ${password}`);
