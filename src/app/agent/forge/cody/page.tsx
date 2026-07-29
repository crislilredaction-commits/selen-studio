import type { Metadata } from "next";
import CodyWorkspace from "@/components/forge/CodyWorkspace";

export const metadata: Metadata = {
  title: "Cody · La Forge · Selen Studio",
  description: "Missions, journal et vérifications de Cody.",
};

export default function CodyPage() {
  return <CodyWorkspace />;
}
