import type { Metadata } from "next";
import { ErrorScreen } from "@/components/error-screen";

export const metadata: Metadata = {
  title: "Página no encontrada",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <ErrorScreen
      titulo="No encontramos esta página"
      descripcion="El enlace puede estar incompleto o el contenido ya no existe."
    />
  );
}
