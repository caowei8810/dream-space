import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import type { ReferenceObjectStorage } from "./reference-object-storage";

export class LocalReferenceObjectStorage implements ReferenceObjectStorage {
  private readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  async put(objectKey: string, data: Buffer) {
    const target = this.resolveObjectKey(objectKey);
    const temporary = `${target}.${randomUUID()}.tmp`;
    await mkdir(dirname(target), { recursive: true });
    try {
      await writeFile(temporary, data, { flag: "wx" });
      await rename(temporary, target);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  }

  async get(objectKey: string) {
    return readFile(this.resolveObjectKey(objectKey));
  }

  async delete(objectKey: string) {
    await rm(this.resolveObjectKey(objectKey), { force: true });
  }

  private resolveObjectKey(objectKey: string) {
    if (!/^references\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\.webp$/.test(objectKey)) {
      throw new Error("invalid reference object key");
    }
    const target = resolve(this.root, objectKey);
    if (!target.startsWith(this.root + sep))
      throw new Error("reference object escaped storage root");
    return target;
  }
}
