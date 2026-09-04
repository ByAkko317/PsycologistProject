// =============================================================================
// Primera barrera: corta el acceso a rutas privadas cuando NO hay cookie.
//
// Ojo con el alcance: el middleware corre en el runtime Edge, donde no esta
// node:crypto, asi que aca NO se verifica la firma — solo se mira si la cookie
// existe. La verificacion real (firma, vencimiento y rol) la hace cada layout
// con requireSession(), que corre en Node.
//
// Esto es defensa en profundidad, no la defensa. Una cookie inventada pasa el
// middleware y muere en el layout.
// =============================================================================

import { NextResponse, type NextRequest } from "next/server";

const COOKIE_NAME = "turnos_session";

/** Rutas que exigen sesion. /portal queda afuera: acepta acceso por token. */
const PRIVADAS = ["/admin", "/employee", "/pacientes"];

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (!PRIVADAS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  if (request.cookies.get(COOKIE_NAME)?.value) {
    return NextResponse.next();
  }

  const login = new URL("/login", request.url);
  login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/admin/:path*", "/employee/:path*", "/pacientes/:path*"],
};
