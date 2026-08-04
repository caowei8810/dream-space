import { Module } from "@nestjs/common";
import { AdminAuthController } from "./admin-auth.controller";
import { AdminAuthRepository } from "./admin-auth.repository";
import { AdminAuthService } from "./admin-auth.service";
import { AdminPermissionGuard } from "./admin-permission.guard";
import { AdminTasksController } from "./admin-tasks.controller";
import { AdminTasksRepository } from "./admin-tasks.repository";
import { AdminTasksService } from "./admin-tasks.service";

@Module({
  controllers: [AdminAuthController, AdminTasksController],
  providers: [
    AdminAuthRepository,
    AdminAuthService,
    AdminPermissionGuard,
    AdminTasksRepository,
    AdminTasksService,
  ],
  exports: [AdminAuthService],
})
export class AdminModule {}
