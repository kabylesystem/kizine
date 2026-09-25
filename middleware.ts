import { NextResponse, type NextRequest } from "next/server";

/**
 * Barrière d'entrée. Le middleware ne peut pas vérifier la signature HMAC
 * (pas de crypto Node sur l'edge), il ne fait que rediriger quand le cookie
 * est absent : la vérification réelle a lieu dans les pages, côté serveur.
 */
const PUBLIC = ["/login", "/api/login", "/api/hq", "/manifest.webmanifest", "/icon.svg"];

export function middleware(request: NextRequest) {
  if (!process.env.APP_PASSWORD) return NextResponse.next();
  const { pathname } = request.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();
  if (pathname.startsWith("/_next") || pathname.startsWith("/dish/") || pathname.startsWith("/food/") || pathname.startsWith("/us/")) {
    return NextResponse.next();
  }
  if (request.cookies.get("kizine_session")) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
