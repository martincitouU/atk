import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

/** Un QueryClient por test: sin reintentos ni caché compartida entre tests. */
export function Proveedores({ children }: { children: ReactNode }) {
  const [consultas] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } }),
  );
  return <QueryClientProvider client={consultas}>{children}</QueryClientProvider>;
}
