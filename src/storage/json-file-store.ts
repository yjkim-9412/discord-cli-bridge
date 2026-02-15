import fs from "node:fs/promises";
import path from "node:path";

export class JsonFileStore<T> {
  private pendingWrite: Promise<void> = Promise.resolve();

  constructor(
    private readonly filePath: string,
    private readonly defaultValue: T,
  ) {}

  async load(): Promise<T> {
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      return JSON.parse(raw) as T;
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === "ENOENT") {
        return this.defaultValue;
      }
      throw error;
    }
  }

  async save(next: T): Promise<void> {
    this.pendingWrite = this.pendingWrite.then(async () => {
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      const tmp = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
      await fs.writeFile(tmp, `${JSON.stringify(next, null, 2)}\n`, "utf8");
      await fs.rename(tmp, this.filePath);
    });

    await this.pendingWrite;
  }
}
