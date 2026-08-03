import { Module } from "@nestjs/common";
import { HealthController } from "./modules/health/health.controller";
import { DatabaseModule } from "./modules/database/database.module";
import { InspirationsModule } from "./modules/inspirations/inspirations.module";
import { AuthModule } from "./modules/auth/auth.module";

@Module({
  imports: [DatabaseModule, InspirationsModule, AuthModule],
  controllers: [HealthController],
})
export class AppModule {}
