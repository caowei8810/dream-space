import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export interface ObjectStorage {
  put(objectKey: string, data: Buffer, contentType: string): Promise<void>;
  get(objectKey: string): Promise<Buffer>;
  delete(objectKey: string): Promise<void>;
  createSignedGetUrl(objectKey: string, expiresInSeconds: number): Promise<string | null>;
}

export interface S3ObjectStorageOptions {
  endpoint: string;
  region: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  forcePathStyle?: boolean;
}

const allowedObjectKey =
  /^(?:references|results|thumbnails)\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\.(?:webp|jpg|png)$/;

function assertObjectKey(objectKey: string) {
  if (!allowedObjectKey.test(objectKey)) throw new Error("invalid object key");
}

export class S3ObjectStorage implements ObjectStorage {
  private readonly client: S3Client;

  constructor(private readonly options: S3ObjectStorageOptions) {
    this.client = new S3Client({
      endpoint: options.endpoint,
      region: options.region,
      forcePathStyle: options.forcePathStyle ?? true,
      credentials: { accessKeyId: options.accessKey, secretAccessKey: options.secretKey },
    });
  }

  async put(objectKey: string, data: Buffer, contentType: string) {
    assertObjectKey(objectKey);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.options.bucket,
        Key: objectKey,
        Body: data,
        ContentType: contentType,
      }),
    );
  }

  async get(objectKey: string) {
    assertObjectKey(objectKey);
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.options.bucket, Key: objectKey }),
    );
    if (!result.Body) throw new Error("object body missing");
    return Buffer.from(await result.Body.transformToByteArray());
  }

  async delete(objectKey: string) {
    assertObjectKey(objectKey);
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.options.bucket, Key: objectKey }),
    );
  }

  createSignedGetUrl(objectKey: string, expiresInSeconds: number) {
    assertObjectKey(objectKey);
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.options.bucket, Key: objectKey }),
      { expiresIn: expiresInSeconds },
    );
  }
}

export class LocalObjectStorage implements ObjectStorage {
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

  createSignedGetUrl() {
    return Promise.resolve(null);
  }

  private resolveObjectKey(objectKey: string) {
    assertObjectKey(objectKey);
    const target = resolve(this.root, objectKey);
    if (!target.startsWith(this.root + sep)) throw new Error("object escaped storage root");
    return target;
  }
}

export interface ObjectStorageConfig {
  mode: "local" | "s3";
  localRoot: string;
  s3: S3ObjectStorageOptions;
}

export function createObjectStorage(config: ObjectStorageConfig): ObjectStorage {
  if (config.mode === "local") return new LocalObjectStorage(config.localRoot);
  return new S3ObjectStorage(config.s3);
}
