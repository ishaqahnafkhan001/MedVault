"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { createPrivateQueryClient } from "@/lib/query-client";

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(createPrivateQueryClient);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
