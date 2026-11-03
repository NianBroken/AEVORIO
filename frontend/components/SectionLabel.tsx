import type { SiteSection } from "../lib/site-types";

interface SectionLabelProps {
  section: SiteSection;
  className?: string;
  titleId?: string;
  showDescription?: boolean;
}

// 正文板块共享编号、主题和数据库标题，但保留不同内容本身的排版方式。
export function SectionLabel({
  section,
  className = "",
  titleId,
  showDescription = true,
}: SectionLabelProps) {
  return (
    <div className={`section-intro ${className}`}>
      <p className="section-kicker">
        <span>{String(section.sortOrder).padStart(2, "0")}</span>
        <span aria-hidden="true" className="kicker-rule" />
        <span>{String(section.content.label ?? "")}</span>
      </p>
      <h2 id={titleId}>{section.title}</h2>
      {showDescription && <p className="section-deck">{section.description}</p>}
    </div>
  );
}
