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
import { BillingModule } from "../billing/billing.module";
import { AdminBillingController } from "../billing/admin-billing.controller";
import { AdminAuditController } from "./admin-audit.controller";
import { AdminAuditRepository } from "./admin-audit.repository";
import { AdminAuditService } from "./admin-audit.service";
import { AdminModelsController } from "./admin-models.controller";
import { ModelsModule } from "../models/models.module";
import { AdminModelHealthService } from "./admin-model-health.service";

@Module({
  imports: [GenerationModule, RiskModule, BillingModule, ModelsModule],
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
    AdminBillingController,
    AdminAuditController,
    AdminModelsController,
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
    AdminAuditRepository,
    AdminAuditService,
    AdminModelHealthService,
  ],
  exports: [AdminAuthService, AdminPermissionGuard],
})
export class AdminModule {}
