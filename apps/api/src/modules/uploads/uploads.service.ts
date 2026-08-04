import { createHash, randomUUID } from "node:crypto";
import { basename } from "node:path";
import { parseApiEnv } from "@dream-space/config";
import type { ReferenceUploadResponse } from "@dream-space/contracts";
import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import sharp from "sharp";
import { REFERENCE_OBJECT_STORAGE, type ReferenceObjectStorage } from "./reference-object-storage";
import { UploadsRepository } from "./uploads.repository";

const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const formatMimeTypes = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" } as const;
const maxBytes = 10 * 1024 * 1024;
const maxInputPixels = 40_000_000;
const referencePath = /^\/uploads\/references\/([A-Za-z0-9_-]+)\/content$/;

export interface ReferenceUploadFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

@Injectable()
export class UploadsService {
  private readonly env = parseApiEnv(process.env);
  private readonly publicOrigin = new URL(this.env.API_PUBLIC_URL);

  constructor(
    @Inject(UploadsRepository) private readonly repository: UploadsRepository,
    @Inject(REFERENCE_OBJECT_STORAGE) private readonly storage: ReferenceObjectStorage,
  ) {}

  async createReference(userId: string, file: ReferenceUploadFile | undefined) {
    this.validateFileEnvelope(file);
    const sanitized = await this.sanitize(file);
    const objectKey = `references/${userId}/${randomUUID()}.webp`;
    await this.storage.put(objectKey, sanitized.data);
    try {
      const record = await this.repository.create({
        userId,
        objectKey,
        originalFilename: basename(file.originalname),
        mimeType: "image/webp",
        byteSize: sanitized.data.byteLength,
        width: sanitized.width,
        height: sanitized.height,
        checksumSha256: createHash("sha256").update(sanitized.data).digest("hex"),
      });
      return this.mapResponse(record);
    } catch (error) {
      await this.storage.delete(objectKey);
      throw error;
    }
  }

  async readReference(userId: string, uploadId: string) {
    const record = await this.repository.findOwned(userId, uploadId);
    if (!record) throw new NotFoundException("参考图不存在");
    return { record, data: await this.storage.get(record.objectKey) };
  }

  async assertOwnedReferenceUrls(userId: string, urls: string[]) {
    if (urls.length === 0) return;
    const uploadIds = urls.map((url) => this.parseReferenceUrl(url));
    if (new Set(uploadIds).size !== uploadIds.length) {
      throw new BadRequestException("不能重复添加同一张参考图");
    }
    const ownedCount = await this.repository.countOwned(userId, uploadIds);
    if (ownedCount !== uploadIds.length) {
      throw new BadRequestException("参考图无效或不属于当前用户");
    }
  }

  private validateFileEnvelope(
    file: ReferenceUploadFile | undefined,
  ): asserts file is ReferenceUploadFile {
    if (!file?.buffer || file.buffer.byteLength === 0 || file.size < 1) {
      throw new BadRequestException("请选择参考图");
    }
    if (file.size !== file.buffer.byteLength || file.size > maxBytes) {
      throw new BadRequestException("参考图大小应不超过 10MB");
    }
    if (!file.originalname.trim() || file.originalname.length > 255) {
      throw new BadRequestException("参考图文件名不正确");
    }
    if (!allowedMimeTypes.has(file.mimetype)) {
      throw new BadRequestException("参考图仅支持 JPG、PNG、WebP");
    }
  }

  private async sanitize(file: ReferenceUploadFile) {
    try {
      const source = sharp(file.buffer, { failOn: "error", limitInputPixels: maxInputPixels });
      const metadata = await source.metadata();
      const actualMimeType = metadata.format
        ? formatMimeTypes[metadata.format as keyof typeof formatMimeTypes]
        : undefined;
      if (!actualMimeType || actualMimeType !== file.mimetype || (metadata.pages ?? 1) !== 1) {
        throw new BadRequestException("参考图内容与文件类型不一致");
      }
      const result = await source
        .rotate()
        .webp({ quality: 90 })
        .toBuffer({ resolveWithObject: true });
      if (!result.info.width || !result.info.height) throw new Error("image dimensions missing");
      return { data: result.data, width: result.info.width, height: result.info.height };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException("参考图已损坏或超出像素限制");
    }
  }

  private parseReferenceUrl(value: string) {
    let parsed: URL;
    try {
      parsed = new URL(value, this.publicOrigin);
    } catch {
      throw new BadRequestException("参考图地址不正确");
    }
    if (parsed.origin !== this.publicOrigin.origin || parsed.search || parsed.hash) {
      throw new BadRequestException("参考图必须使用本服务的上传地址");
    }
    const matched = referencePath.exec(parsed.pathname);
    if (!matched?.[1]) throw new BadRequestException("参考图地址不正确");
    return matched[1];
  }

  private mapResponse(record: {
    id: string;
    originalFilename: string;
    mimeType: string;
    width: number;
    height: number;
    byteSize: number;
    checksumSha256: string;
  }): ReferenceUploadResponse {
    return {
      id: record.id,
      url: new URL(`/uploads/references/${record.id}/content`, this.publicOrigin).toString(),
      filename: record.originalFilename,
      mimeType: record.mimeType,
      width: record.width,
      height: record.height,
      byteSize: record.byteSize,
      checksumSha256: record.checksumSha256,
    };
  }
}
