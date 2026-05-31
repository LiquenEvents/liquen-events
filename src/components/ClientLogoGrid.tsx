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
    <div className="h-36 bg-surface flex items-center justify-center px-6 hover:bg-surface-elevated transition-colors group">
      {!failed && client.logo ? (
        <Image
          src={client.logo}
          alt={client.name}
          width={d[0]}
          height={d[1]}
          style={{ height: `${h}px` }}
          className="object-contain w-auto max-w-[78%] opacity-55 group-hover:opacity-90 transition-opacity duration-300 brightness-0 invert"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="text-foreground/25 text-xs font-medium tracking-widest uppercase text-center group-hover:text-foreground/50 transition-colors leading-relaxed">
          {client.name}
        </span>
      )}
    </div>
  );
}

export default function ClientLogoGrid({ clients }: { clients: Client[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-px bg-foreground/6">
      {clients.map((client) => (
        <ClientLogo key={client.name} client={client} />
      ))}
    </div>
  );
}
