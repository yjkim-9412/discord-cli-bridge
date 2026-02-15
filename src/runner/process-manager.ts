import type { ChildProcess } from "node:child_process";

type ShutdownSummary = {
  terminated: number;
  killed: number;
};

export class ProcessManager {
  private readonly children = new Set<ChildProcess>();
  private shutdownPromise: Promise<ShutdownSummary> | null = null;
  private shuttingDown = false;

  get isShuttingDown(): boolean {
    return this.shuttingDown;
  }

  activeCount(): number {
    return this.getAliveChildren().length;
  }

  track(child: ChildProcess): void {
    if (this.shuttingDown) {
      try {
        child.kill("SIGTERM");
      } catch {
        // Ignore signal delivery failures during shutdown race.
      }
      return;
    }

    this.children.add(child);

    const cleanup = () => {
      this.children.delete(child);
    };

    child.once("close", cleanup);
    child.once("error", cleanup);
  }

  shutdownAll(graceMs = 3_000): Promise<ShutdownSummary> {
    if (this.shutdownPromise) {
      return this.shutdownPromise;
    }

    this.shuttingDown = true;
    this.shutdownPromise = this.shutdownInternal(graceMs);
    return this.shutdownPromise;
  }

  private async shutdownInternal(graceMs: number): Promise<ShutdownSummary> {
    let terminated = 0;
    let killed = 0;

    for (const child of this.getAliveChildren()) {
      try {
        if (child.kill("SIGTERM")) {
          terminated += 1;
        }
      } catch {
        // Ignore signal delivery failures; process may have already exited.
      }
    }

    if (graceMs > 0) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, graceMs);
      });
    }

    for (const child of this.getAliveChildren()) {
      try {
        if (child.kill("SIGKILL")) {
          killed += 1;
        }
      } catch {
        // Ignore signal delivery failures; process may have already exited.
      }
    }

    return { terminated, killed };
  }

  private getAliveChildren(): ChildProcess[] {
    return [...this.children].filter((child) => child.exitCode == null && child.signalCode == null);
  }
}
