import { execFile } from "node:child_process";
import { mkdir, chmod } from "node:fs/promises";
import { promisify } from "node:util";

const execute = promisify(execFile);
// Windows 目录只向当前运行账户和 SYSTEM 授权，子文件继承同一权限。
export async function secureDirectory(directory: string): Promise<void> {
  await mkdir(directory, { recursive: true });
  if (process.platform !== "win32") {
    await chmod(directory, 0o700);
    return;
  }
  const { stdout } = await execute("whoami.exe", [], {
    encoding: "utf8",
    windowsHide: true,
  });
  const identity = stdout.trim();
  await execute(
    "icacls.exe",
    [
      directory,
      "/inheritance:r",
      "/grant:r",
      `${identity}:(OI)(CI)F`,
      "SYSTEM:(OI)(CI)F",
      "/Q",
    ],
    { encoding: "utf8", windowsHide: true },
  );
}
