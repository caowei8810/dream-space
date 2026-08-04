import type { AdminPermission } from "@dream-space/contracts";
import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AdminAuthService } from "./admin-auth.service";

const permissionMetadataKey = "dreamspace:admin-permission";

export const RequireAdminPermission = (permission: AdminPermission) =>
  SetMetadata(permissionMetadataKey, permission);

@Injectable()
export class AdminPermissionGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AdminAuthService) private readonly auth: AdminAuthService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const permission = this.reflector.getAllAndOverride<AdminPermission>(permissionMetadataKey, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!permission) return true;
    const request = context.switchToHttp().getRequest<{ headers: { cookie?: string } }>();
    await this.auth.requirePermission(request.headers.cookie, permission);
    return true;
  }
}
