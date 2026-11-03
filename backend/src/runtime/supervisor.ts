import { spawn, type ChildProcess } from "node:child_process";
import { open, mkdir, readFile, rename, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { readEnvironment } from "../config/env";

const CHECK_INTERVAL = 1000;
const backendRoot = process.cwd();
const frontendRoot = path.resolve(backendRoot, "../frontend");
const reportRoot = path.join(frontendRoot, "reports");
const recordFile = path.join(reportRoot, "runtime-services.json");
const stopFile = path.join(reportRoot, "runtime-stop.json");
const token = randomUUID();
const environment = readEnvironment();
const frontendUrl = new URL(environment.FRONTEND_ORIGIN);
const backendHost = ["0.0.0.0", "::"].includes(environment.BACKEND_HOST)
  ? "127.0.0.1"
  : environment.BACKEND_HOST;
const backendUrl = `http://${backendHost}:${environment.BACKEND_PORT}`;
const state: {
  generatedAt: string;
  supervisor: { processId: number; startedAt: string; token: string };
  status: string;
  backend?: ServiceRecord;
  frontend?: ServiceRecord;
} = {
  generatedAt: new Date().toISOString(),
  supervisor: {
    processId: process.pid,
    startedAt: new Date().toISOString(),
    token,
  },
  status: "starting",
};
interface ServiceRecord {
  processId: number;
  startedAt: string;
  url: string;
  restarts: number;
}
interface ManagedService {
  key: "backend" | "frontend";
  cwd: string;
  args: string[];
  url: string;
  health: string;
  child?: ChildProcess;
  restarts: number;
  nextStart: number;
  failures: number;
}
const services: ManagedService[] = [
  {
    key: "backend",
    cwd: backendRoot,
    args: [path.join(backendRoot, "dist/src/server.js")],
    url: backendUrl,
    health: backendUrl + "/api/v1/site?page=home",
    restarts: 0,
    nextStart: 0,
    failures: 0,
  },
  {
    key: "frontend",
    cwd: frontendRoot,
    args: [
      path.join(frontendRoot, "node_modules/next/dist/bin/next"),
      "start",
      "--hostname",
      frontendUrl.hostname,
      "--port",
      frontendUrl.port || "3000",
    ],
    url: frontendUrl.origin,
    health: frontendUrl.origin,
    restarts: 0,
    nextStart: 0,
    failures: 0,
  },
];
let closing = false;

async function saveState(): Promise<void> {
  state.generatedAt = new Date().toISOString();
  const temp = recordFile + ".tmp";
  await writeFile(temp, JSON.stringify(state, null, 2), "utf8");
  await rename(temp, recordFile);
}
async function healthy(service: ManagedService): Promise<boolean> {
  try {
    const response = await fetch(service.health, {
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) return false;
    if (service.key === "backend") {
      const body = (await response.json()) as { Code: number };
      return body.Code === 0;
    }
    return true;
  } catch {
    return false;
  }
}
async function launch(service: ManagedService): Promise<void> {
  const out = await open(
    path.join(service.cwd, "reports/runtime-output.log"),
    "a",
  );
  const error = await open(
    path.join(service.cwd, "reports/runtime-error.log"),
    "a",
  );
  try {
    const child = spawn(process.execPath, service.args, {
      cwd: service.cwd,
      windowsHide: true,
      env: { ...process.env, BACKEND_ORIGIN: backendUrl },
      stdio: ["ignore", out.fd, error.fd],
    });
    service.child = child;
    await new Promise<void>((resolve, reject) => {
      child.once("spawn", resolve);
      child.once("error", reject);
    });
    state[service.key] = {
      processId: child.pid!,
      startedAt: new Date().toISOString(),
      url: service.url,
      restarts: service.restarts,
    };
    await saveState();
    for (let attempt = 0; attempt < 60; attempt++) {
      if (child.exitCode !== null || child.signalCode !== null)
        throw new Error(
          `${service.key} 进程在启动时退出，请检查对应运行日志。`,
        );
      if (await healthy(service)) {
        service.failures = 0;
        return;
      }
      await delay(250);
    }
    throw new Error(`${service.key} 未通过启动健康检查。`);
  } finally {
    await out.close();
    await error.close();
  }
}
async function terminate(service: ManagedService): Promise<void> {
  const child = service.child;
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exit = new Promise<void>((resolve) =>
    child.once("exit", () => resolve()),
  );
  child.kill();
  await Promise.race([exit, delay(5000)]);
  if (child.exitCode === null && child.signalCode === null)
    child.kill("SIGKILL");
}
async function stop(): Promise<void> {
  if (closing) return;
  closing = true;
  state.status = "stopping";
  await saveState();
  for (const service of [...services].reverse()) await terminate(service);
  state.status = "stopped";
  await saveState();
  await rm(stopFile, { force: true });
}
async function requestedStop(): Promise<boolean> {
  try {
    const request = JSON.parse(
      (await readFile(stopFile, "utf8")).replace(/^\uFEFF/u, ""),
    ) as {
      token: string;
    };
    return request.token === token;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

// 同一守护进程顺序管理两个服务，进程退出和连续健康失败均触发有界退避重启。
async function main(): Promise<void> {
  await mkdir(reportRoot, { recursive: true });
  await mkdir(path.join(backendRoot, "reports"), { recursive: true });
  await saveState();
  for (const service of services) await launch(service);
  state.status = "running";
  await saveState();
  let ticks = 0;
  while (!closing) {
    await delay(CHECK_INTERVAL);
    if (await requestedStop()) {
      await stop();
      break;
    }
    ticks++;
    for (const service of services) {
      const exited =
        !service.child ||
        service.child.exitCode !== null ||
        service.child.signalCode !== null;
      if (!exited && ticks % 10 === 0)
        service.failures = (await healthy(service)) ? 0 : service.failures + 1;
      if (
        (exited || service.failures >= 3) &&
        Date.now() >= service.nextStart
      ) {
        await terminate(service);
        service.restarts++;
        try {
          await launch(service);
          state.status = "running";
        } catch (error) {
          state.status = "recovering";
          console.error(
            error instanceof Error ? error.message : "服务重启失败。",
          );
          await terminate(service);
          service.nextStart =
            Date.now() +
            Math.min(30000, 1000 * 2 ** Math.min(service.restarts, 5));
        }
        await saveState();
      }
    }
  }
}
process.once("SIGINT", () => {
  void stop();
});
process.once("SIGTERM", () => {
  void stop();
});
void main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : "守护进程启动失败。");
  await stop();
  process.exitCode = 1;
});
