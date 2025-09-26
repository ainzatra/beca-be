import { Module } from '@nestjs/common';
import { CampaignService } from './campaign.service';
import { CampaignController } from './campaign.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { LlmModule } from '../llm/llm.module';

@Module({
    imports: [PrismaModule, LlmModule],
    providers: [CampaignService],
    controllers: [CampaignController],
})
export class CampaignModule {}
