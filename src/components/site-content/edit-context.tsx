"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

interface SiteContentContextValue {
  /** Live map of key -> current value. Mutated optimistically on save. */
  content: Record<string, string>;
  /** True only for the logged-in owner. Gates all editing affordances. */
  isOwner: boolean;
  /** Whether the owner has flipped the page into edit mode. */
  editMode: boolean;
  setEditMode: (on: boolean) => void;
  /** Update the in-memory value for a key after a successful save. */
  setLocal: (key: string, value: string) => void;
}

const SiteContentContext = createContext<SiteContentContextValue | null>(null);

export function SiteContentProvider({
  content,
  isOwner,
  children,
}: {
  content: Record<string, string>;
  isOwner: boolean;
  children: React.ReactNode;
}) {
  // Local, mutable copy so optimistic updates render instantly without waiting
  // for the server revalidation round-trip.
  const [localContent, setLocalContent] = useState<Record<string, string>>(content);
  const [editMode, setEditMode] = useState(false);

  const setLocal = useCallback((key: string, value: string) => {
    setLocalContent((prev) => ({ ...prev, [key]: value }));
  }, []);

  const value = useMemo<SiteContentContextValue>(
    () => ({ content: localContent, isOwner, editMode, setEditMode, setLocal }),
    [localContent, isOwner, editMode, setLocal],
  );

  return <SiteContentContext.Provider value={value}>{children}</SiteContentContext.Provider>;
}

export function useSiteContent(): SiteContentContextValue {
  const ctx = useContext(SiteContentContext);
  if (!ctx) {
    throw new Error("useSiteContent must be used within a <SiteContentProvider>.");
  }
  return ctx;
}
