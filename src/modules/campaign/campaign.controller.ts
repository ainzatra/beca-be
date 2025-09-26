import {
    Body,
    Controller,
    Get,
    Param,
    Post,
    Put,
    UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/guard/auth.guard';
import { CampaignService } from './campaign.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { CampaignPhase } from '@prisma/client';
import { UpdateCampaignDto } from './dto/update-campaign.dto';

// @UseGuards(AuthGuard)
@Controller('campaign')
export class CampaignController {
    constructor(private readonly service: CampaignService) {}

    @Get('analysis/:campaignId')
    async getAnalysis(@Param('campaignId') campaignId: string) {
        return this.service.getPhaseAnalysis(campaignId);
    }

    @Get()
    async findAll() {
        return this.service.getAllCampaigns();
    }

    @Get('dashboard')
    async getAllDashboard() {
        return this.service.getDashboardInfo();
    }

    @Get('with-survey')
    async findAllWithSurvey() {
        return this.service.getAllCampaignsWithSurvey();
    }

    @Post()
    async create(@Body() body: CreateCampaignDto) {
        return this.service.createCampaign(body);
    }

    @Put(':id')
    async update(@Body() body: UpdateCampaignDto, @Param('id') id: string) {
        return this.service.updateCampaign(id, body);
    }

    @Get(':id')
    async findById(@Param('id') id: string) {
        return this.service.getCampaignById(id);
    }
}
