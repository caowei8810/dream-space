import type { BillingQuoteRequest, OrderCreateInput, PaymentCallbackInput } from "@dream-space/contracts";
import { createHmac, timingSafeEqual } from "node:crypto";
import { parseApiEnv } from "@dream-space/config";
import { Body, Controller, Get, Headers, Inject, Post, Req, UnauthorizedException, BadRequestException } from "@nestjs/common";
import { AuthService } from "../auth/auth.service";
import { readSessionToken } from "../auth/session-cookie";
import { BillingService } from "./billing.service";

interface RawBodyRequest {
  rawBody?: Buffer;
}

@Controller("billing")
export class BillingController {
  private readonly env = parseApiEnv(process.env);
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
  plans() { return this.billing.plans(); }

  @Post("orders")
  async createOrder(@Headers("cookie") cookie: string | undefined, @Body() input: OrderCreateInput) {
    const session = await this.auth.getSession(readSessionToken(cookie));
    if (!session.authenticated) throw new UnauthorizedException("请先登录");
    return this.billing.createOrder(session.user.id, input);
  }

  @Get("orders")
  async orders(@Headers("cookie") cookie: string | undefined) {
    const session = await this.auth.getSession(readSessionToken(cookie));
    if (!session.authenticated) throw new UnauthorizedException("请先登录");
    return this.billing.orders(session.user.id);
  }

  @Get("entitlements")
  async entitlements(@Headers("cookie") cookie: string | undefined) {
    const session = await this.auth.getSession(readSessionToken(cookie));
    if (!session.authenticated) throw new UnauthorizedException("请先登录");
    return this.billing.entitlements(session.user.id);
  }

  @Post("webhooks/payment")
  paymentWebhook(
    @Body() input: PaymentCallbackInput,
    @Headers("x-payment-signature") signature: string | undefined,
    @Req() request: RawBodyRequest,
  ) {
    if (this.env.EXTERNAL_SERVICES_MODE === "live") {
      const expected = `sha256=${createHmac("sha256", this.env.PAYMENT_WEBHOOK_SECRET).update(request.rawBody ?? Buffer.from(JSON.stringify(input))).digest("hex")}`;
      const actual = Buffer.from(signature ?? "");
      const expectedBuffer = Buffer.from(expected);
      if (actual.length !== expectedBuffer.length || !timingSafeEqual(actual, expectedBuffer)) {
        throw new BadRequestException("支付回调签名无效");
      }
    }
    return this.billing.paymentCallback(input);
  }
}
