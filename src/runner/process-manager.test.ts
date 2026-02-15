import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { describe, expect, it } from "vitest";
import { ProcessManager } from "./process-manager.js";

async function waitForExit(
  child: ChildProcess,
  timeoutMs = 2_000,
): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
  if (child.exitCode != null || child.signalCode != null) {
    return {
      code: child.exitCode,
      signal: child.signalCode as NodeJS.Signals | null,
    };
  }

  return await Promise.race([
    once(child, "close").then(([code, signal]) => ({
      code: code as number | null,
      signal: signal as NodeJS.Signals | null,
    })),
    new Promise<never>((_resolve, reject) => {
      setTimeout(() => reject(new Error(`child did not exit within ${timeoutMs}ms`)), timeoutMs);
    }),
  ]);
}

async function spawnIgnoringSigterm(): Promise<ChildProcess> {
  const child = spawn(
    process.execPath,
    ["-e", "process.on('SIGTERM', () => {}); process.stdout.write('ready\\n'); setInterval(() => {}, 1000);"],
    { stdio: ["ignore", "pipe", "ignore"] },
  );
  await once(child.stdout!, "data");
  return child;
}

describe("ProcessManager", () => {
  it("tracks and removes children once they exit", async () => {
    const manager = new ProcessManager();
    const child = spawn(process.execPath, ["-e", "setTimeout(() => process.exit(0), 25);"], {
      stdio: "ignore",
    });

    manager.track(child);
    expect(manager.activeCount()).toBe(1);

    await waitForExit(child);
    expect(manager.activeCount()).toBe(0);
  });

  it("sends SIGTERM and falls back to SIGKILL during shutdown", async () => {
    const manager = new ProcessManager();
    const child = await spawnIgnoringSigterm();
    manager.track(child);

    const summary = await manager.shutdownAll(50);
    const exited = await waitForExit(child);

    expect(summary.terminated).toBeGreaterThanOrEqual(1);
    expect(summary.killed).toBeGreaterThanOrEqual(1);
    expect(exited.signal).toBe("SIGKILL");
    expect(manager.activeCount()).toBe(0);
  });

  it("returns the same promise when shutdown is requested twice", async () => {
    const manager = new ProcessManager();
    const child = await spawnIgnoringSigterm();
    manager.track(child);

    const first = manager.shutdownAll(10);
    const second = manager.shutdownAll(10);

    expect(first).toBe(second);
    await first;
    await waitForExit(child);
  });
});
