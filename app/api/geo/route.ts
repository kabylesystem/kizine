import { NextResponse } from "next/server";

const UA = "Kizine/0.1 (personal meal planner)";

/**
 * Autocomplétion d'adresse via la Base Adresse Nationale (api-adresse.data.gouv.fr),
 * le service officiel français, gratuit et sans clé. Nominatim a été écarté :
 * sur « 41 rue de vou » il proposait le village de Vou en Indre-et-Loire au lieu
 * de la rue de Vouillé à Paris. La BAN est faite pour la saisie au fil de la frappe.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 3) return NextResponse.json({ results: [] });

  try {
    const res = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&limit=5`, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(7000),
    });
    const data = (await res.json()) as {
      features?: {
        geometry: { coordinates: [number, number] };
        properties: { label: string; score: number };
      }[];
    };
    return NextResponse.json({
      results: (data.features ?? []).map((f) => ({
        label: f.properties.label,
        full: f.properties.label,
        lon: f.geometry.coordinates[0],
        lat: f.geometry.coordinates[1],
      })),
    });
  } catch {
    return NextResponse.json({ results: [] });
  }
}
