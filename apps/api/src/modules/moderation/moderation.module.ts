import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AdminModule } from "../admin/admin.module";
import { GenerationModule } from "../generation/generation.module";
import { ModerationController, AdminModerationController } from "./moderation.controller";
import { ModerationRepository } from "./moderation.repository";
import { ModerationService } from "./moderation.service";

@Module({
  imports: [AuthModule, AdminModule, GenerationModule],
  controllers: [ModerationController, AdminModerationController],
  providers: [ModerationRepository, ModerationService],
  exports: [ModerationRepository, ModerationService],
})
export class ModerationModule {}
