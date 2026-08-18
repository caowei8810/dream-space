import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { UploadsModule } from "../uploads/uploads.module";
import { RiskModule } from "../risk/risk.module";
import { GenerationController } from "./generation.controller";
import { GenerationQueue } from "./generation.queue";
import { GenerationRepository } from "./generation.repository";
import { GenerationResultAssetsService } from "./generation-result-assets.service";
import { GenerationService } from "./generation.service";

@Module({
  imports: [AuthModule, UploadsModule, RiskModule],
  controllers: [GenerationController],
  providers: [
    GenerationQueue,
    GenerationRepository,
    GenerationResultAssetsService,
    GenerationService,
  ],
  exports: [GenerationResultAssetsService],
})
export class GenerationModule {}
