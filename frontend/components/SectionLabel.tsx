import type { SiteSection } from '../lib/site-types';

interface SectionLabelProps {
  section: SiteSection;
  className?: string;
  titleId?: string;
  showDescription?: boolean;
}

const SECTION_LABELS: Record<string, string> = {
  editorial: '工程笔记',
  engineering: '线路设计',
  craft: '制作细节',
  'board-showcase': '板卡观察',
  workflow: '开发路径',
  timeline: '工程过程',
  validation: '测试验证',
  applications: '应用方向',
  capabilities: '工作范围',
  disciplines: '专业分工',
  collaboration: '协作方式',
  principles: '设计原则',
  'category-overview': '分类索引',
  'product-matrix': '产品目录',
  'selection-guide': '选型提示',
};

// 正文板块共享编号、主题和数据库标题，但保留不同内容本身的排版方式。
export function SectionLabel({ section, className = '', titleId, showDescription = true }: SectionLabelProps) {
  return (
    <div className={`section-intro ${className}`}>
      <p className="section-kicker">
        <span>{String(section.sortOrder).padStart(2, '0')}</span>
        <span aria-hidden="true" className="kicker-rule" />
        <span>{SECTION_LABELS[section.sectionType] ?? '工程记录'}</span>
      </p>
      <h2 id={titleId}>{section.title}</h2>
      {showDescription && <p className="section-deck">{section.description}</p>}
    </div>
  );
}
