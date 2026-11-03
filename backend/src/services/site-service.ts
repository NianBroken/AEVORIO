import type { PageSlug, SitePayload, SiteRepository } from '../types/site';

export class SiteReadError extends Error {
  public readonly code: number;

  public constructor(message: string, code: number) {
    super(message);
    this.name = 'SiteReadError';
    this.code = code;
  }
}

export class SiteService {
  public constructor(private readonly repository: SiteRepository) {}

  public async loadPage(page: PageSlug): Promise<SitePayload> {
    let result: SitePayload | null;
    try {
      result = await this.repository.getSite(page);
    } catch {
      throw new SiteReadError(
        '页面数据读取失败：服务端未能完成 MySQL 数据查询，请检查后端数据库连接与已执行的数据库初始化步骤。',
        2001,
      );
    }

    if (!result || result.page.sections.length < 10) {
      throw new SiteReadError(
        '页面数据读取失败：数据库没有提供完整的有效页面内容，请先运行项目中的数据库初始化命令。',
        2002,
      );
    }

    if (page === 'products' && (result.categories.length !== 9 || result.products.length < 45)) {
      throw new SiteReadError(
        '产品页面数据读取失败：九个产品分类及四十五个示例产品尚未完整初始化。',
        2002,
      );
    }

    return result;
  }
}
