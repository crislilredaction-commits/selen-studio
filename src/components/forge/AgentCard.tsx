import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Bot, Clock3 } from "lucide-react";

type Props = {
  agent: {
    id: string;
    name: string;
    role: string;
    status: string;
    description: string;
    active: boolean;
    href?: string;
  };
};

export default function AgentCard({ agent }: Props) {
  return (
    <article className={`forge-agent-card ${agent.active ? "forge-agent-card--active" : ""}`}>
      <div className="forge-agent-portrait">
        {agent.id === "cody" ? (
          <Image src="/agents/cody.png" alt="Portrait de Cody" fill sizes="(max-width: 700px) 84px, 108px" />
        ) : (
          <Bot aria-hidden size={34} />
        )}
      </div>
      <div className="forge-agent-card__content">
        <div className="forge-agent-card__topline">
          <div>
            <p className="forge-eyebrow">{agent.role}</p>
            <h2>{agent.name}</h2>
          </div>
          <span className={`forge-badge ${agent.active ? "forge-badge--in_progress" : "forge-badge--paused"}`}>
            {agent.active ? <span className="forge-status-dot" /> : <Clock3 size={12} />}
            {agent.status}
          </span>
        </div>
        <p>{agent.description}</p>
        {agent.href && (
          <Link className="forge-button forge-button--primary" href={agent.href}>
            Ouvrir son espace <ArrowRight size={16} />
          </Link>
        )}
      </div>
    </article>
  );
}
