import AgentSidebar from "@/components/layout/AgentSidebar";
import AgentFriendlyBanner from "@/components/AgentFriendlyBanner";
import StudioTutoiementGuard from "@/components/StudioTutoiementGuard";

export default function AgentLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="agent-shell"
      style={{
        display: "flex",
        minHeight: "100vh",
        background:
          "radial-gradient(circle at 18% 0%, rgba(201, 148, 58, 0.12), transparent 28%), linear-gradient(180deg, var(--selen-bg2), var(--selen-bg))",
      }}
    >
      <AgentSidebar />
      <main
        className="agent-content"
        style={{
          flex: 1,
          background:
            "radial-gradient(circle at 72% 6%, rgba(245, 208, 138, 0.08), transparent 24%), transparent",
        }}
      >
        <StudioTutoiementGuard />
        <AgentFriendlyBanner />
        {children}
      </main>
    </div>
  );
}
