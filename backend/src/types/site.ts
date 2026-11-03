export * from "../../contracts/site";
import type { PageSlug, SitePayload } from "../../contracts/site";
export interface SiteRepository {
  getSite(pageSlug: PageSlug): Promise<SitePayload | null>;
}
