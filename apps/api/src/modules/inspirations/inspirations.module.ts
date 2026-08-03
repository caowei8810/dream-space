import { Module } from "@nestjs/common";
import { InspirationsController } from "./inspirations.controller";
import { InspirationsRepository } from "./inspirations.repository";
import { InspirationsService } from "./inspirations.service";

@Module({
  controllers: [InspirationsController],
  providers: [InspirationsRepository, InspirationsService],
})
export class InspirationsModule {}
