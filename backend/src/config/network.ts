import { execFile } from "node:child_process";
import { networkInterfaces } from "node:os";
import { promisify } from "node:util";
import { readEnvironment } from "./env";

const NETWORK_CACHE_MS = 30000;
const NETWORK_QUERY_TIMEOUT_MS = 30000;
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const execute = promisify(execFile);
const WINDOWS_ADDRESS_SCRIPT = "[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false); $physical=@(Get-NetAdapter -Physical | ForEach-Object { $_.InterfaceGuid.ToString().Trim('{}') }); @([Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces() | Where-Object { $physical -contains $_.Id.Trim('{}') -and $_.OperationalStatus -eq 'Up' } | ForEach-Object { $properties=$_.GetIPProperties(); if(@($properties.GatewayAddresses | Where-Object { $_.Address.AddressFamily -eq 'InterNetwork' -and $_.Address.ToString() -ne '0.0.0.0' }).Count) { $properties.UnicastAddresses | Where-Object { $_.Address.AddressFamily -eq 'InterNetwork' -and $_.Address.ToString() -notlike '169.254.*' } | ForEach-Object { $_.Address.ToString() } } }) | ConvertTo-Json -Compress";
let cachedAddresses: string[] = [];
let checkedAt = 0;
let refreshing: Promise<string[]> | undefined;

// Windows 只选择已连接且存在默认网关的物理网卡，排除隧道和虚拟交换机。
export function refreshLanAddresses(): Promise<string[]> {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    if (process.platform === "win32") {
      const { stdout } = await execute("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", WINDOWS_ADDRESS_SCRIPT], { encoding: "utf8", windowsHide: true, timeout: NETWORK_QUERY_TIMEOUT_MS });
      const output = stdout.trim().replace(/^\uFEFF/u, "");
      const decoded: unknown = output ? JSON.parse(output) : [];
      cachedAddresses = (Array.isArray(decoded) ? decoded : [decoded]).filter((value): value is string => typeof value === "string");
    } else {
      cachedAddresses = Object.values(networkInterfaces()).flatMap((items) => items ?? []).filter((item) => item.family === "IPv4" && !item.internal && !item.address.startsWith("169.254.")).map((item) => item.address);
    }
    checkedAt = Date.now();
    return cachedAddresses;
  })().finally(() => { refreshing = undefined; });
  return refreshing;
}

// 请求读取已确认的地址，网卡变化由异步查询更新，不阻塞接口与媒体响应。
export function lanAddresses(): string[] {
  if (Date.now() - checkedAt >= NETWORK_CACHE_MS && !refreshing)
    void refreshLanAddresses().catch((error: unknown) => console.error("局域网地址刷新失败：", error));
  return cachedAddresses;
}

export function resolveFrontendOrigin(configured: string): string {
  const address = new URL(configured);
  if (LOOPBACK_HOSTS.has(address.hostname)) address.hostname = lanAddresses()[0] ?? address.hostname;
  return address.origin;
}

// 来源允许名单来自明确配置和本机有效地址，不接受任意 Host 或通配来源。
export function allowedFrontendOrigins(configured: string): Set<string> {
  const address = new URL(configured);
  const origins = new Set([address.origin]);
  for (const hostname of ["localhost", "127.0.0.1", ...lanAddresses()]) {
    const candidate = new URL(address.origin);
    candidate.hostname = hostname;
    origins.add(candidate.origin);
  }
  return origins;
}

if (require.main === module) {
  void refreshLanAddresses().then(() => console.log(JSON.stringify({ origin: resolveFrontendOrigin(readEnvironment().FRONTEND_ORIGIN), bindHost: "0.0.0.0" }))).catch((error: unknown) => {
    console.error("局域网地址识别失败：", error);
    process.exitCode = 1;
  });
}
