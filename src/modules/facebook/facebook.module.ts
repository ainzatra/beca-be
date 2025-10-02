import { Module } from '@nestjs/common';
import { FacebookController } from './facebook.controller';
import { FacebookService } from './facebook.service';
import { CampaignModule } from '../campaign/campaign.module';

@Module({
    controllers: [FacebookController],
    providers: [FacebookService],
    imports: [CampaignModule],
})
export class FacebookModule {}
