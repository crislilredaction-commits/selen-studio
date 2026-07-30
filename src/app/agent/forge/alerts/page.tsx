import type { Metadata } from "next";
import ForgeAlertCenter from "@/components/forge/ForgeAlertCenter";

export const metadata: Metadata = {
  title: "Alertes de La Forge · Selen Studio",
  description: "Les alertes utiles émises par Cody et les Compagnons.",
};

export default function ForgeAlertsPage() {
  return <ForgeAlertCenter />;
}
