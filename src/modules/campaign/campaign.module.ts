import { Module } from '@nestjs/common';
import { CampaignService } from './campaign.service';
import { CampaignController } from './campaign.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { LlmModule } from '../llm/llm.module';
import { CampaignListener } from './campaign.listener';

@Module({
    imports: [PrismaModule, LlmModule],
    providers: [CampaignService, CampaignListener],
    controllers: [CampaignController],
    exports: [CampaignService],
})
export class CampaignModule {}
