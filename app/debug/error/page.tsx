// Ruta de verificación: lanza un error a propósito para comprobar que
// app/error.tsx aparece y que la cuenta regresiva devuelve al inicio.
//
// Solo existe en desarrollo. En producción responde 404 como cualquier ruta
// inexistente, para no dejar una forma pública de generar ruido en los logs.
//
// Para probarlo contra un build de producción (que es donde el manejo de
// errores se comporta como en el deploy real), hay que habilitarlo a propósito:
//
//   ALLOW_DEBUG_ROUTES=1 pnpm start
//
// Nunca dejar esa variable puesta en el deploy: convierte una URL pública en
// una forma cómoda de llenar los logs de errores falsos.
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

const HABILITADO =
  process.env.NODE_ENV !== "production" ||
  process.env.ALLOW_DEBUG_ROUTES === "1";

export default function DebugError({
  searchParams,
}: {
  searchParams: { tipo?: string };
}) {
  if (!HABILITADO) notFound();

  if (searchParams.tipo === "notfound") notFound();

  throw new Error(
    "Error de prueba lanzado desde /debug/error. Si estás viendo la pantalla " +
      "de error con la cuenta regresiva, el manejo de errores funciona."
  );
}
