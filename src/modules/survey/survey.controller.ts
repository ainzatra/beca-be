import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { SurveyService } from './survey.service';
import { CampaignPhase } from '@prisma/client';
import { AuthGuard } from '../auth/guard/auth.guard';


@Controller('survey')
export class SurveyController {
    constructor(private readonly service: SurveyService) {}

    @Get('phase/:phase/:campaignId')
    @UseGuards(AuthGuard)
    async findSurveysPerPhase(
        @Param('campaignId') campaignId: string, 
        @Param('phase') phase: CampaignPhase
    ) {
        return this.service.findSurveysPerPhase(campaignId, phase)
    }

    @Post()
    @UseGuards(AuthGuard)
    async create(@Body() body) {
        return this.service.createSurvey(body)
    }

    @Get(':id')
    async findById(@Param('id') id: string) {
        return this.service.findById(id)
    }

    @Put(':id')
    @UseGuards(AuthGuard)
    async updateSurvey(@Param('id') id: string, @Body() body) {
        return this.service.updateSurvey(body, id)
    }

    @Delete(':id')
    @UseGuards(AuthGuard)
    async deleteSurvey(@Param('id') id: string) {
        return this.service.deleteSurvey(id)
    }
}
