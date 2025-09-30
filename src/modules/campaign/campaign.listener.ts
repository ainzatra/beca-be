import { Injectable } from '@nestjs/common';
import { CampaignPhase } from '@prisma/client';
import { CampaignService } from './campaign.service';
import { OnEvent } from '@nestjs/event-emitter';

@Injectable()
export class CampaignListener {
    constructor(private readonly service: CampaignService) {}

    @OnEvent('campaign.phaseChanged')
    async handlePhaseChange(payload: {
        campaignId: string;
        completedPhase: CampaignPhase;
    }) {
        const { campaignId, completedPhase } = payload;
        console.log('Triggering phase analysis for campaign:', campaignId);
        try {
            await this.service.triggerPhaseAnalysis(campaignId, completedPhase);
        } catch (error) {
            console.error(
                `Error handling phase change for campaign ${campaignId}:`,
                error,
            );
        }
    }
}
