import ports from "../../../shared/ports.json";
import path from "node:path";
import dotenv from "dotenv";
import { z } from "zod";

// 在载入环境变量时解析后端自己的 .env，不写入当前工作目录之外的配置。
dotenv.config({ path: path.resolve(process.cwd(), ".env"), quiet: true });

// 所有端口、连接数及地址规则集中定义，避免在接口和数据库层分散拼接配置。
const environmentSchema = z.object({
  BACKEND_HOST: z.string().default("127.0.0.1"),
  BACKEND_PORT: z.coerce.number().refine((port) => port === ports.backend, "后端端口必须为 24682。").default(ports.backend),
  FRONTEND_ORIGIN: z.url().refine((value) => Number(new URL(value).port) === ports.frontend, "前端端口必须为 24681。").default(`http://127.0.0.1:${ports.frontend}`),
  DB_HOST: z.string().trim().min(1, "DB_HOST 不能为空。"),
  DB_PORT: z.coerce.number().int().min(1).max(65_535).default(3306),
  DB_USER: z.string().trim().min(1, "DB_USER 不能为空。"),
  DB_PASSWORD: z.string(),
  DB_NAME: z
    .string()
    .regex(
      /^aevorio(?:_test_[a-z0-9_]+)?$/u,
      "数据库名称必须是本项目库或隔离测试库。",
    ),
  DB_CONNECTION_LIMIT: z.coerce.number().int().min(1).max(32).default(10),
});

export type Environment = z.infer<typeof environmentSchema>;

export function readEnvironment(): Environment {
  const parsed = environmentSchema.safeParse(process.env);

  if (!parsed.success) {
    const descriptions = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("；");
    throw new Error(
      `后端配置无效，请检查 backend/.env 中的字段：${descriptions}`,
    );
  }

  return parsed.data;
}
