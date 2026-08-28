import { Module } from "@nestjs/common";
import { AdminModelsRepository } from "../admin/admin-models.repository";
import { AdminModelsService } from "../admin/admin-models.service";
import { AdminModelHealthService } from "../admin/admin-model-health.service";

@Module({
  providers: [AdminModelsRepository, AdminModelsService, AdminModelHealthService],
  exports: [AdminModelsRepository, AdminModelsService],
})
export class ModelsModule {}
