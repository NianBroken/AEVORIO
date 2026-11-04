export * from "../../../shared/site";
import type { PageSlug, SitePayload } from "../../../shared/site";
export interface SiteRepository {
  getSite(pageSlug: PageSlug): Promise<SitePayload | null>;
}
