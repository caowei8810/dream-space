import { parseApiEnv } from "@dream-space/config";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { OBJECT_STORAGE, type ReferenceObjectStorage } from "../uploads/reference-object-storage";
import { GenerationRepository } from "./generation.repository";

type AssetVariant = "content" | "thumbnail";

@Injectable()
export class GenerationResultAssetsService {
  private readonly signedUrlTtlSeconds = parseApiEnv(process.env).S3_SIGNED_URL_TTL_SECONDS;
  constructor(
    @Inject(GenerationRepository) private readonly repository: GenerationRepository,
    @Inject(OBJECT_STORAGE) private readonly storage: ReferenceObjectStorage,
  ) {}

  async readOwned(userId: string, resultId: string, variant: AssetVariant) {
    const result = await this.repository.findOwnedResult(userId, resultId);
    if (!result) throw new NotFoundException("生成结果不存在");
    return this.read(result, variant);
  }

  async readAny(resultId: string, variant: AssetVariant) {
    const result = await this.repository.findResult(resultId);
    if (!result) throw new NotFoundException("生成结果不存在");
    return this.read(result, variant);
  }

  async readModeration(resultId: string, variant: AssetVariant) {
    const result = await this.repository.findResult(resultId);
    if (!result) throw new NotFoundException("生成结果不存在");
    return this.read(result, variant, true);
  }

  private async read(
    result: {
      objectKey: string | null;
      thumbnailObjectKey: string | null;
      mimeType: string;
      moderationStatus: string;
    },
    variant: AssetVariant,
    allowPending = false,
  ) {
    const objectKey = variant === "thumbnail" ? result.thumbnailObjectKey : result.objectKey;
    if (!allowPending && result.moderationStatus !== "APPROVED") {
      throw new NotFoundException("生成结果尚未通过审核");
    }
    if (!objectKey) throw new NotFoundException("生成结果文件不存在");
    const redirectUrl = await this.storage.createSignedGetUrl(objectKey, this.signedUrlTtlSeconds);
    if (redirectUrl) return { redirectUrl, data: null, mimeType: result.mimeType };
    return {
      redirectUrl: null,
      data: await this.storage.get(objectKey),
      mimeType: result.mimeType,
    };
  }
}
