import { Module } from "@nestjs/common";
import { GenerationModule } from "../generation/generation.module";
import { AdminAuthController } from "./admin-auth.controller";
import { AdminAuthRepository } from "./admin-auth.repository";
import { AdminAuthService } from "./admin-auth.service";
import { AdminAccountsController } from "./admin-accounts.controller";
import { AdminAccountsRepository } from "./admin-accounts.repository";
import { AdminAccountsService } from "./admin-accounts.service";
import { AdminUsersController } from "./admin-users.controller";
import { AdminUsersRepository } from "./admin-users.repository";
import { AdminUsersService } from "./admin-users.service";
import { AdminDashboardController } from "./admin-dashboard.controller";
import { AdminDashboardRepository } from "./admin-dashboard.repository";
import { AdminDashboardService } from "./admin-dashboard.service";
import { AdminRolesController } from "./admin-roles.controller";
import { AdminRolesRepository } from "./admin-roles.repository";
import { AdminRolesService } from "./admin-roles.service";
import {
  AdminInspirationCandidatesController,
  AdminInspirationsController,
} from "./admin-inspirations.controller";
import { AdminInspirationsRepository } from "./admin-inspirations.repository";
import { AdminInspirationsService } from "./admin-inspirations.service";
import { AdminPermissionGuard } from "./admin-permission.guard";
import { AdminTasksController } from "./admin-tasks.controller";
import { AdminTasksRepository } from "./admin-tasks.repository";
import { AdminTasksService } from "./admin-tasks.service";
import { AdminRiskController } from "./admin-risk.controller";
import { AdminRiskService } from "./admin-risk.service";
import { RiskModule } from "../risk/risk.module";

@Module({
  imports: [GenerationModule, RiskModule],
  controllers: [
    AdminAuthController,
    AdminDashboardController,
    AdminRolesController,
    AdminAccountsController,
    AdminUsersController,
    AdminInspirationsController,
    AdminInspirationCandidatesController,
    AdminTasksController,
    AdminRiskController,
  ],
  providers: [
    AdminAuthRepository,
    AdminAuthService,
    AdminDashboardRepository,
    AdminDashboardService,
    AdminRolesRepository,
    AdminRolesService,
    AdminAccountsRepository,
    AdminAccountsService,
    AdminUsersRepository,
    AdminUsersService,
    AdminPermissionGuard,
    AdminInspirationsRepository,
    AdminInspirationsService,
    AdminTasksRepository,
    AdminTasksService,
    AdminRiskService,
  ],
  exports: [AdminAuthService],
})
export class AdminModule {}
