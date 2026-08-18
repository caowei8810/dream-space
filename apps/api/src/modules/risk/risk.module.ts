import { Module } from "@nestjs/common";
import { RiskRepository } from "./risk.repository";
import { RiskService } from "./risk.service";

@Module({
  providers: [RiskRepository, RiskService],
  exports: [RiskRepository, RiskService],
})
export class RiskModule {}
