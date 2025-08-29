import { Module } from '@nestjs/common';
import { CampaignService } from './campaign.service';
import { CampaignController } from './campaign.controller';
import { PrismaService } from 'src/prisma.service';

@Module({
  providers: [CampaignService, PrismaService],
  controllers: [CampaignController]
})
export class CampaignModule {}
