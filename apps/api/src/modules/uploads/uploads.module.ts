import { parseApiEnv } from "@dream-space/config";
import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { LocalReferenceObjectStorage } from "./local-reference-object-storage";
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
        if (env.EXTERNAL_SERVICES_MODE !== "mock") {
          throw new Error("真实对象存储适配器尚未配置");
        }
        return new LocalReferenceObjectStorage(env.LOCAL_STORAGE_DIR);
      },
    },
  ],
  exports: [UploadsService],
})
export class UploadsModule {}
