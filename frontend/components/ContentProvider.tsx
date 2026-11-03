"use client";
import { createContext, useContext, type ReactNode } from "react";
import type { SiteSettings } from "../lib/site-types";
import { DEMO_SITE_SETTINGS } from "../lib/site-types";
const ContentContext = createContext<SiteSettings>(DEMO_SITE_SETTINGS);
export function ContentProvider({
  settings,
  children,
}: {
  settings: SiteSettings;
  children: ReactNode;
}) {
  return (
    <ContentContext.Provider value={settings}>
      {children}
    </ContentContext.Provider>
  );
}
export function useSiteContent() {
  const settings = useContext(ContentContext);
  return {
    settings,
    copy: (key: string) => String(settings.content?.[key] ?? ""),
  };
}
