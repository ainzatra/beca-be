import { Controller, Get, Query } from '@nestjs/common';
import { FacebookService } from './facebook.service';
import { CampaignPhase } from '@prisma/client';

@Controller('facebook')
export class FacebookController {
    constructor(private readonly facebookService: FacebookService) {}

    @Get('posts-comments')
    async getPostsAndComments(
        @Query('campaignId') campaignId: string,
        @Query('phase') phase: CampaignPhase,
    ) {
        console.log({ campaignId, phase });
        return this.facebookService.getPostsAndComments(
            decodeURIComponent(campaignId),
            phase,
        );
    }
}
