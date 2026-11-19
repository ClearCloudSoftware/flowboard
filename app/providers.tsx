"use client";
import { useState } from "react";
import type { ReactNode } from "react";
import { focusManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Coming back from the editor beside the browser is a window focus, not a tab becoming visible: refetch on both,
// so a flow file or a prompt edited by hand is read again.
focusManager.setEventListener((onFocus) => {
  if (typeof window === "undefined") return;
  const seen = () => onFocus(); // no argument: notify with the page's visibility, on every return
  window.addEventListener("focus", seen);
  window.addEventListener("visibilitychange", seen);
  return () => {
    window.removeEventListener("focus", seen);
    window.removeEventListener("visibilitychange", seen);
  };
});

/** One query client per browser tab. A failed request says why at once rather than retrying: the server is this machine. */
export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
