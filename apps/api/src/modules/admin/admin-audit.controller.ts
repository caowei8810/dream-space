import { Controller, Get, Inject, Query, UseGuards } from "@nestjs/common";
import { AdminPermissionGuard, RequireAdminPermission } from "./admin-permission.guard";
import { AdminAuditService } from "./admin-audit.service";

@Controller("admin/audit")
@UseGuards(AdminPermissionGuard)
@RequireAdminPermission("audit:read")
export class AdminAuditController {
  constructor(@Inject(AdminAuditService) private readonly service: AdminAuditService) {}

  @Get("logs")
  list(@Query() query: Record<string, string | undefined>) {
    return this.service.list(query);
  }
}
