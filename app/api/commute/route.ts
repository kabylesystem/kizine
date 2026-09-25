import { currentUserId } from "@/server/auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { rawDb } from "@/db/client";

const UA = "Kizine/0.1 (personal meal planner)";

/** Même source que l'autocomplétion : la Base Adresse Nationale. */
async function geocode(query: string): Promise<{ lat: number; lon: number; name: string } | null> {
  try {
    const res = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(query)}&limit=1`, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(9000),
    });
    const data = (await res.json()) as {
      features?: { geometry: { coordinates: [number, number] }; properties: { label: string } }[];
    };
    const hit = data.features?.[0];
    return hit
      ? { lat: hit.geometry.coordinates[1], lon: hit.geometry.coordinates[0], name: hit.properties.label }
      : null;
  } catch {
    return null;
  }
}

/**
 * OSRM public ne sert que le profil voiture : on lui prend la DISTANCE, jamais
 * la durée. Le temps est recalculé depuis la vitesse du mode choisi, sinon
 * une marche de 5 km durerait 16 minutes.
 */
async function roadKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): Promise<number | null> {
  try {
    const res = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?overview=false`,
      { signal: AbortSignal.timeout(9000) },
    );
    const data = (await res.json()) as { code: string; routes?: { distance: number }[] };
    if (data.code !== "Ok" || !data.routes?.[0]) return null;
    return Math.round((data.routes[0].distance / 1000) * 100) / 100;
  } catch {
    return null;
  }
}

const schema = z.object({
  /** Fourni quand on modifie un trajet existant au lieu d'en créer un. */
  id: z.string().optional(),
  label: z.string().min(1).max(60),
  from: z.string().max(200).optional(),
  to: z.string().max(200).optional(),
  km: z.number().min(0.1).max(300).optional(),
  mode: z.enum(["walk", "bike", "ebike", "transit", "scooter", "car"]),
  tripsPerWeek: z.number().int().min(1).max(21),
  minutesOneWay: z.number().int().min(1).max(240).nullable().optional(),
});

export async function POST(request: Request): Promise<NextResponse> {
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  const { id: editing, label, from, to, mode, tripsPerWeek, minutesOneWay } = parsed.data;
  let km = parsed.data.km ?? null;
  let resolved: { from?: string; to?: string } = {};

  if (km === null && from && to) {
    const [a, b] = await Promise.all([geocode(from), geocode(to)]);
    if (!a || !b) {
      return NextResponse.json({ error: "adresse introuvable", from: !!a, to: !!b }, { status: 422 });
    }
    km = await roadKm(a, b);
    resolved = { from: a.name, to: b.name };
    if (km === null) return NextResponse.json({ error: "itinéraire introuvable" }, { status: 422 });
  }
  if (km === null) return NextResponse.json({ error: "distance ou adresses requises" }, { status: 400 });

  const id = editing ?? randomUUID();
  await rawDb()
    .prepare(
      `INSERT INTO commutes (id, user_id, label, from_address, to_address, km, mode, trips_per_week, minutes_one_way, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET
         label = excluded.label, from_address = excluded.from_address, to_address = excluded.to_address,
         km = excluded.km, mode = excluded.mode, trips_per_week = excluded.trips_per_week,
         minutes_one_way = excluded.minutes_one_way, updated_at = excluded.updated_at`,
    )
    .run(
      id,
      (await currentUserId()),
      label,
      from ?? null,
      to ?? null,
      km,
      mode,
      tripsPerWeek,
      minutesOneWay ?? null,
      Math.floor(Date.now() / 1000),
    );

  return NextResponse.json({ ok: true, id, km, resolved });
}

export async function DELETE(request: Request): Promise<NextResponse> {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });
  await rawDb().prepare("DELETE FROM commutes WHERE id = ? AND user_id = ?").run(id, (await currentUserId()));
  return NextResponse.json({ ok: true });
}
