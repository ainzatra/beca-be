import {
    BadRequestException,
    HttpException,
    HttpStatus,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { CampaignPhase, CampaignStatus } from '@prisma/client';
import { PrismaService } from 'src/modules/prisma/prisma.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';

@Injectable()
export class CampaignService {
    constructor(private readonly prisma: PrismaService) {}

    async getAllCampaigns() {
        return await this.prisma.campaign.findMany();
    }

    async getAllCampaignsWithSurvey() {
        return await this.prisma.campaign.findMany({
            include: {
                surveys: true,
            },
        });
    }

    async getCampaignById(id: string) {
        const campaign = await this.prisma.campaign.findUnique({
            where: { id },
            include: {
                surveys: {
                    include: {
                        _count: {
                            select: {
                                responses: true,
                            },
                        },
                    },
                },
                _count: {
                    select: {
                        surveys: true,
                    },
                },
            },
        });

        if (!campaign) {
            throw new NotFoundException('Campaign not found');
        }

        // Initialize totals for each phase
        const totals: Record<
            CampaignPhase,
            { surveys: number; responses: number }
        > = {
            [CampaignPhase.PRE]: { surveys: 0, responses: 0 },
            [CampaignPhase.MID]: { surveys: 0, responses: 0 },
            [CampaignPhase.POST]: { surveys: 0, responses: 0 },
        };

        // Aggregate counts from surveys
        if (campaign.surveys && campaign.surveys.length > 0) {
            for (const survey of campaign.surveys) {
                const phase = survey.phase as CampaignPhase;
                totals[phase].surveys += 1;
                totals[phase].responses += survey._count?.responses ?? 0;
            }
        }

        // Return campaign model plus per-phase totals
        return {
            ...campaign,
            totalsByPhase: totals,
        };
    }

    async createCampaign(data: CreateCampaignDto) {
        return await this.prisma.campaign.create({
            data,
        });
    }

    async updateCampaign(id: string, data: UpdateCampaignDto) {
        const campaign = await this.prisma.campaign.findUnique({
            where: {
                id,
            },
            include: {
                _count: {
                    select: {
                        surveys: true,
                    },
                },
            },
        });

        if (!campaign) {
            throw new NotFoundException('Campaign not found');
        }

        // if (data.activePhase && campaign.activePhase == data.activePhase) {
        //     throw new HttpException('Bad Request', HttpStatus.BAD_REQUEST)
        // }

        if (data.activePhase && campaign._count.surveys === 0) {
            throw new HttpException(
                'Requirements not met',
                HttpStatus.BAD_REQUEST,
            );
        }

        if (data.activePhase && data.activePhase === 'POST') {
            data.status = 'COMPLETED';
        }

        return this.prisma.campaign.update({
            where: { id },
            data,
        });
    }

    async getDashboardInfo() {
        const [pre, mid, post] = await Promise.all([
            this.prisma.campaign.count({ where: { activePhase: 'PRE' } }),
            this.prisma.campaign.count({ where: { activePhase: 'MID' } }),
            this.prisma.campaign.count({ where: { activePhase: 'POST' } }),
        ]);

        const responseCount = await this.prisma.response.count();
        const surveyorCount = await this.prisma.user.count({
            where: {
                role: 'SURVEYOR',
            },
        });
        const campaignCount = {
            PRE: pre,
            MID: mid,
            POST: post,
            total: pre + mid + post,
        };

        const data = { campaignCount, responseCount, surveyorCount };
        console.log('dashboard', data);
        return data;
    }
}
