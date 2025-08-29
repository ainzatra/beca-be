import { Injectable, NotFoundException } from '@nestjs/common';
import { CampaignPhase } from '@prisma/client';
import { PrismaService } from 'src/prisma.service';

@Injectable()
export class SurveyService {
    constructor(private readonly prisma: PrismaService) {}

    async findSurveysPerPhase(campaignId: string, phase: CampaignPhase) {
        return await this.prisma.survey.findMany({
            where: {
                campaignId,
                phase
            },
            select: {
                id: true,
                title: true,
                phase: true
            },
            orderBy: {
                title: 'asc'
            }
        })
    }

    async createSurvey(data) {
        return this.prisma.survey.create({ data })
    }

    async findById(id: string) {
        const survey = await this.prisma.survey.findUnique({
            where: { id }
        })

        if (!survey) {
            throw new NotFoundException('Survey not found')
        }

        return survey
    }

    async updateSurvey(data, id: string) {
        return this.prisma.survey.update({
            where: { id },
            data
        })
    }

    async deleteSurvey(id: string) {
        return this.prisma.survey.delete({
            where: { id },
        })
    }
}
