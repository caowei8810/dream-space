import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AdminModule } from "../admin/admin.module";
import { UploadsModule } from "../uploads/uploads.module";
import { PrivacyController, AdminPrivacyController } from "./privacy.controller";
import { PrivacyRepository } from "./privacy.repository";
import { PrivacyService } from "./privacy.service";

@Module({
  imports: [AuthModule, AdminModule, UploadsModule],
  controllers: [PrivacyController, AdminPrivacyController],
  providers: [PrivacyRepository, PrivacyService],
})
export class PrivacyModule {}
