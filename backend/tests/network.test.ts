import { expect, it } from "vitest";
import { allowedFrontendOrigins, refreshLanAddresses } from "../src/config/network";

// 实际网卡查询期间仍能立即校验请求，来源仅包含明确配置和识别出的本机地址。
it("网卡刷新不阻塞请求来源校验，重复刷新共享同一查询", async () => {
  const configured = "http://127.0.0.1:24681";
  const started = performance.now();
  const pending = refreshLanAddresses();
  expect(refreshLanAddresses()).toBe(pending);
  const origins = allowedFrontendOrigins(configured);
  expect(performance.now() - started).toBeLessThan(500);
  expect(origins.has(configured)).toBe(true);
  expect(origins.has("http://untrusted.example:24681")).toBe(false);
  const addresses = await pending;
  for (const address of addresses) {
    const recognized = new URL(configured);
    recognized.hostname = address;
    expect(allowedFrontendOrigins(configured).has(recognized.origin)).toBe(true);
  }
}, 20000);
