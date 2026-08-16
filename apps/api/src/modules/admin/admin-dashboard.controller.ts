import { Controller, Get, Inject, UseGuards } from "@nestjs/common";
import { AdminDashboardService } from "./admin-dashboard.service";
import { AdminPermissionGuard, RequireAdminPermission } from "./admin-permission.guard";

@Controller("admin/dashboard")
@UseGuards(AdminPermissionGuard)
export class AdminDashboardController {
  constructor(@Inject(AdminDashboardService) private readonly service: AdminDashboardService) {}

  @Get("summary")
  @RequireAdminPermission("dashboard:read")
  summary() {
    return this.service.summary();
  }
}
