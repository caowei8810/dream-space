import { Controller, Get, Inject, Param, Query, UseGuards } from "@nestjs/common";
import { AdminPermissionGuard, RequireAdminPermission } from "./admin-permission.guard";
import { AdminTasksService } from "./admin-tasks.service";

@Controller("admin/tasks")
@UseGuards(AdminPermissionGuard)
@RequireAdminPermission("tasks:read")
export class AdminTasksController {
  constructor(@Inject(AdminTasksService) private readonly service: AdminTasksService) {}

  @Get()
  list(
    @Query("status") status?: string,
    @Query("model") model?: string,
    @Query("query") query?: string,
    @Query("createdFrom") createdFrom?: string,
    @Query("createdTo") createdTo?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return this.service.list({ status, model, query, createdFrom, createdTo, page, pageSize });
  }

  @Get(":taskId")
  get(@Param("taskId") taskId: string) {
    return this.service.get(taskId);
  }
}
