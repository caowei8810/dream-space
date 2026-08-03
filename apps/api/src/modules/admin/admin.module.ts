import { Module } from "@nestjs/common";
import { AdminAuthController } from "./admin-auth.controller";
import { AdminAuthRepository } from "./admin-auth.repository";
import { AdminAuthService } from "./admin-auth.service";
import { AdminInspirationsController } from "./admin-inspirations.controller";
import { AdminInspirationsRepository } from "./admin-inspirations.repository";
import { AdminInspirationsService } from "./admin-inspirations.service";
import { AdminPermissionGuard } from "./admin-permission.guard";
import { AdminTasksController } from "./admin-tasks.controller";
import { AdminTasksRepository } from "./admin-tasks.repository";
import { AdminTasksService } from "./admin-tasks.service";

@Module({
  controllers: [AdminAuthController, AdminInspirationsController, AdminTasksController],
  providers: [
    AdminAuthRepository,
    AdminAuthService,
    AdminPermissionGuard,
    AdminInspirationsRepository,
    AdminInspirationsService,
    AdminTasksRepository,
    AdminTasksService,
  ],
  exports: [AdminAuthService],
})
export class AdminModule {}
