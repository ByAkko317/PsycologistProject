import type { Metadata, Viewport } from "next";
import { ThemeScript } from "@/components/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Turnos — Reservas online",
    template: "%s · Turnos",
  },
  description:
    "Plataforma de reservas y turnos: agenda, pacientes, pagos y recordatorios automáticos.",
};

export const viewport: Viewport = {
  // Le avisa al navegador que hay dos temas, para que pinte la barra de
  // direcciones y los controles nativos del color correcto.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#090c14" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // suppressHydrationWarning: ThemeScript agrega la clase `dark` antes de que
    // React hidrate, así que el HTML del servidor y el del cliente difieren a
    // propósito en ese atributo.
    <html lang="es" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className="theme-transition min-h-screen">{children}</body>
    </html>
  );
}
