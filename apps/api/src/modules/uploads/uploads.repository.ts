import type { DatabaseClient, ReferenceUploadModel } from "@dream-space/db";
import { Inject, Injectable } from "@nestjs/common";
import { DATABASE_CLIENT } from "../database/database.module";

export interface CreateReferenceUploadRecord {
  userId: string;
  objectKey: string;
  originalFilename: string;
  mimeType: string;
  byteSize: number;
  width: number;
  height: number;
  checksumSha256: string;
}

@Injectable()
export class UploadsRepository {
  constructor(@Inject(DATABASE_CLIENT) private readonly database: DatabaseClient) {}

  create(input: CreateReferenceUploadRecord): Promise<ReferenceUploadModel> {
    return this.database.referenceUpload.create({ data: input });
  }

  findOwned(userId: string, uploadId: string): Promise<ReferenceUploadModel | null> {
    return this.database.referenceUpload.findFirst({
      where: { id: uploadId, userId, deletedAt: null },
    });
  }

  countOwned(userId: string, uploadIds: string[]) {
    return this.database.referenceUpload.count({
      where: { id: { in: uploadIds }, userId, deletedAt: null },
    });
  }
}
