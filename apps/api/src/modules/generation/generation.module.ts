import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { UploadsModule } from "../uploads/uploads.module";
import { RiskModule } from "../risk/risk.module";
import { BillingModule } from "../billing/billing.module";
import { ModelsModule } from "../models/models.module";
import { GenerationController } from "./generation.controller";
import { GenerationQueue } from "./generation.queue";
import { GenerationRepository } from "./generation.repository";
import { GenerationResultAssetsService } from "./generation-result-assets.service";
import { GenerationService } from "./generation.service";

@Module({
  imports: [AuthModule, UploadsModule, RiskModule, BillingModule, ModelsModule],
  controllers: [GenerationController],
  providers: [
    GenerationQueue,
    GenerationRepository,
    GenerationResultAssetsService,
    GenerationService,
  ],
  exports: [GenerationResultAssetsService, GenerationQueue],
})
export class GenerationModule {}
