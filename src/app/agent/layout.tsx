import AgentSidebar from "@/components/layout/AgentSidebar";

export default function AgentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        background: "var(--selen-bg)",
      }}
    >
      <AgentSidebar />

      <main
        style={{
          flex: 1,
          background: "var(--selen-bg)",
        }}
      >
        {children}
      </main>
    </div>
  );
}
