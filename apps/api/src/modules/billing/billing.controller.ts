import type { BillingQuoteRequest, RedemptionCodeRedeemInput } from "@dream-space/contracts";
import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Post,
  UnauthorizedException,
} from "@nestjs/common";
import { AuthService } from "../auth/auth.service";
import { readSessionToken } from "../auth/session-cookie";
import { BillingService } from "./billing.service";

@Controller("billing")
export class BillingController {
  constructor(
    @Inject(BillingService) private readonly billing: BillingService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  @Post("quote")
  async quote(@Headers("cookie") cookie: string | undefined, @Body() input: BillingQuoteRequest) {
    const session = await this.auth.getSession(readSessionToken(cookie));
    if (!session.authenticated) throw new UnauthorizedException("请先登录");
    return this.billing.quote(input);
  }

  @Post("wallet")
  async wallet(@Headers("cookie") cookie: string | undefined) {
    const session = await this.auth.getSession(readSessionToken(cookie));
    if (!session.authenticated) throw new UnauthorizedException("请先登录");
    return this.billing.wallet(session.user.id);
  }

  @Get("plans")
  plans() {
    return this.billing.plans();
  }

  @Get("entitlements")
  async entitlements(@Headers("cookie") cookie: string | undefined) {
    const session = await this.auth.getSession(readSessionToken(cookie));
    if (!session.authenticated) throw new UnauthorizedException("请先登录");
    return this.billing.entitlements(session.user.id);
  }

  @Post("redemptions")
  async redeem(
    @Headers("cookie") cookie: string | undefined,
    @Body() input: RedemptionCodeRedeemInput,
  ) {
    const session = await this.auth.getSession(readSessionToken(cookie));
    if (!session.authenticated) throw new UnauthorizedException("请先登录");
    return this.billing.redeemCode(session.user.id, input);
  }
}
