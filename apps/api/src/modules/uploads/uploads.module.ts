import { parseApiEnv } from "@dream-space/config";
import { createObjectStorage } from "@dream-space/storage";
import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { REFERENCE_OBJECT_STORAGE } from "./reference-object-storage";
import { UploadsController } from "./uploads.controller";
import { UploadsRepository } from "./uploads.repository";
import { UploadsService } from "./uploads.service";

@Module({
  imports: [AuthModule],
  controllers: [UploadsController],
  providers: [
    UploadsRepository,
    UploadsService,
    {
      provide: REFERENCE_OBJECT_STORAGE,
      useFactory: () => {
        const env = parseApiEnv(process.env);
        return createObjectStorage({
          mode: env.OBJECT_STORAGE_MODE,
          localRoot: env.LOCAL_STORAGE_DIR,
          s3: {
            endpoint: env.S3_ENDPOINT,
            region: env.S3_REGION,
            bucket: env.S3_BUCKET,
            accessKey: env.S3_ACCESS_KEY,
            secretKey: env.S3_SECRET_KEY,
            forcePathStyle: env.S3_FORCE_PATH_STYLE,
          },
        });
      },
    },
  ],
  exports: [UploadsService, REFERENCE_OBJECT_STORAGE],
})
export class UploadsModule {}
