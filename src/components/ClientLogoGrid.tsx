"use client";

import Image from "next/image";
import { useState } from "react";
import { logoHeight, logoDimsFor } from "@/lib/logo";

interface Client {
  name: string;
  logo: string;
}

function ClientLogo({ client }: { client: Client }) {
  const [failed, setFailed] = useState(false);
  const h = logoHeight(client.logo, 6400, 52, 88);
  const d = logoDimsFor(client.logo);

  return (
    <div className="h-36 bg-surface flex items-center justify-center px-6 border-r border-b border-foreground/[0.07] hover:bg-surface-elevated transition-colors group">
      {!failed && client.logo ? (
        <Image
          src={client.logo}
          alt={client.name}
          width={d[0]}
          height={d[1]}
          style={{ height: `${h}px` }}
          className="object-contain w-auto max-w-[78%] opacity-100 transition-opacity duration-300 brightness-0"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="text-foreground text-[10px] sm:text-[11px] font-medium tracking-[0.15em] uppercase text-center transition-colors leading-snug">
          {client.name}
        </span>
      )}
    </div>
  );
}

/**
 * Bordered grid (cell borders, not gap-px) so a partial final row ends in clean
 * whitespace instead of an empty grey cell — robust at every column count.
 */
export default function ClientLogoGrid({ clients }: { clients: Client[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 border-t border-l border-foreground/[0.07]">
      {clients.map((client) => (
        <ClientLogo key={client.name} client={client} />
      ))}
    </div>
  );
}
