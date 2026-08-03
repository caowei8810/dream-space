import type { LoginRequest, SendCodeRequest } from "@dream-space/contracts";
import { parseApiEnv } from "@dream-space/config";
import { Body, Controller, Get, Headers, HttpCode, Inject, Post, Res } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { readSessionToken, sessionCookieName } from "./session-cookie";

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

@Controller("auth")
export class AuthController {
  private readonly env = parseApiEnv(process.env);

  constructor(@Inject(AuthService) private readonly service: AuthService) {}

  @Post("codes")
  sendCode(@Body() input: SendCodeRequest) {
    return this.service.sendCode(input);
  }

  @Post("login")
  @HttpCode(200)
  async login(@Body() input: LoginRequest, @Res({ passthrough: true }) response: CookieResponse) {
    const result = await this.service.login(input);
    response.cookie(sessionCookieName, result.token, {
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
    return this.service.getSession(readSessionToken(cookieHeader));
  }

  @Post("logout")
  @HttpCode(204)
  async logout(
    @Headers("cookie") cookieHeader: string | undefined,
    @Res({ passthrough: true }) response: CookieResponse,
  ) {
    await this.service.logout(readSessionToken(cookieHeader));
    response.clearCookie(sessionCookieName, {
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: this.env.NODE_ENV === "production",
    });
  }
}
