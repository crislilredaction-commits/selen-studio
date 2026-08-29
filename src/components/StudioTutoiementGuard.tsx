"use client";

import { useEffect } from "react";

const replacements: Array<[string, string]> = [
  ["Impossible de vérifier votre accès", "Impossible de vérifier ton accès"],
  ["Renseignez une adresse email valide.", "Renseigne une adresse email valide."],
  ["Session admin introuvable. Reconnectez-vous.", "Session admin introuvable. Reconnecte-toi."],
  ["Vous ne pouvez pas désactiver votre propre accès admin", "Tu ne peux pas désactiver ton propre accès admin"],
  ["Invitez un agent ou un administrateur à rejoindre Studio.", "Invite un agent ou un administrateur à rejoindre Studio."],
];

function normalize(root: ParentNode) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  for (const node of nodes) {
    const value = node.nodeValue ?? "";
    let next = value;
    for (const [from, to] of replacements) next = next.replaceAll(from, to);
    if (next !== value) node.nodeValue = next;
  }
}

export default function StudioTutoiementGuard() {
  useEffect(() => {
    normalize(document.body);
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const added of mutation.addedNodes) {
          if (added.nodeType === Node.TEXT_NODE) normalize(added.parentNode ?? document.body);
          else if (added instanceof HTMLElement) normalize(added);
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  return null;
}
