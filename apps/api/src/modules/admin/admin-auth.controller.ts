import type { AdminLoginRequest, SendCodeRequest } from "@dream-space/contracts";
import { parseApiEnv } from "@dream-space/config";
import { Body, Controller, Get, Headers, HttpCode, Inject, Post, Res } from "@nestjs/common";
import { AdminAuthService } from "./admin-auth.service";
import { adminSessionCookieName, readAdminSessionToken } from "./admin-session-cookie";

interface CookieOptions {
  httpOnly: boolean;
  maxAge?: number;
  path: string;
  sameSite: "lax";
  secure: boolean;
}

interface CookieResponse {
  cookie(name: string, value: string, options: CookieOptions): void;
  clearCookie(name: string, options: Omit<CookieOptions, "maxAge">): void;
}

@Controller("admin/auth")
export class AdminAuthController {
  private readonly env = parseApiEnv(process.env);

  constructor(@Inject(AdminAuthService) private readonly service: AdminAuthService) {}

  @Post("codes")
  sendCode(@Body() input: SendCodeRequest) {
    return this.service.sendCode(input);
  }

  @Post("login")
  @HttpCode(200)
  async login(
    @Body() input: AdminLoginRequest,
    @Res({ passthrough: true }) response: CookieResponse,
  ) {
    const result = await this.service.login(input);
    response.cookie(adminSessionCookieName, result.token, {
      httpOnly: true,
      maxAge: result.expiresAt.getTime() - Date.now(),
      path: "/",
      sameSite: "lax",
      secure: this.env.NODE_ENV === "production",
    });
    return result.response;
  }

  @Get("session")
  getSession(@Headers("cookie") cookieHeader: string | undefined) {
    return this.service.getSession(readAdminSessionToken(cookieHeader));
  }

  @Post("logout")
  @HttpCode(204)
  async logout(
    @Headers("cookie") cookieHeader: string | undefined,
    @Res({ passthrough: true }) response: CookieResponse,
  ) {
    await this.service.logout(readAdminSessionToken(cookieHeader));
    response.clearCookie(adminSessionCookieName, {
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: this.env.NODE_ENV === "production",
    });
  }
}
