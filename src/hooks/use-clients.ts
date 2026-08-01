"use client";

import { useEffect, useState } from "react";

export interface ClientOption {
  id: string;
  name: string;
  slug: string;
}

export const clientsUpdatedEvent = "acct-ctrl:clients-updated";

export function notifyClientsUpdated() {
  window.dispatchEvent(new Event(clientsUpdatedEvent));
}

export function useClients(enabled = true) {
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const loadClients = () => {
      setLoading(true);
      setError(null);
      fetch("/api/clients", { cache: "no-store" })
        .then(async (response) => {
          const body = (await response.json().catch(() => null)) as { data?: ClientOption[]; error?: string } | null;
          if (!response.ok) throw new Error(body?.error ?? "Daftar client belum dapat dimuat.");
          return body?.data ?? [];
        })
        .then((data) => {
          if (!cancelled) setClients(data);
        })
        .catch((fetchError) => {
          if (!cancelled) setError(fetchError instanceof Error ? fetchError.message : "Daftar client belum dapat dimuat.");
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    };

    loadClients();
    window.addEventListener(clientsUpdatedEvent, loadClients);

    return () => {
      cancelled = true;
      window.removeEventListener(clientsUpdatedEvent, loadClients);
    };
  }, [enabled]);

  return { clients, loading, error };
}
