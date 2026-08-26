// Chrome del panel del administrador.
// El guard de rol vive acá: cubre /admin y todas sus subrutas de una.
import type { Metadata } from "next";
import { AppFooter, AppHeader, Page } from "@/components/app-shell";
import { BrandStyle } from "@/components/brand";
import { requirePageSession } from "@/lib/auth/guards";
import { requireTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Panel",
  robots: { index: false, follow: false },
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Solo administración. Un profesional que entre acá cae en /sin-permiso.
  requirePageSession(["owner"], "/admin");
  const tenant = await requireTenant();

  return (
    <>
      <BrandStyle tenant={tenant} />
      <AppHeader tenant={tenant} subtitle="Administración" />
      <Page width="lg">{children}</Page>
      <AppFooter tenant={tenant} />
    </>
  );
}
