import {
    BadRequestException,
    HttpException,
    HttpStatus,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { CampaignPhase, CampaignStatus } from '@prisma/client';
import { PrismaService } from 'src/modules/prisma/prisma.service';
import { LlmService } from '../llm/llm.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';

@Injectable()
export class CampaignService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly llmService: LlmService,
    ) {}

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
        const oldCampaign = await this.prisma.campaign.findUnique({
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

        if (!oldCampaign) {
            throw new NotFoundException('Campaign not found');
        }

        const oldPhase = oldCampaign.activePhase;

        if (data.activePhase && oldCampaign._count.surveys === 0) {
            throw new HttpException(
                'Requirements not met',
                HttpStatus.BAD_REQUEST,
            );
        }

        if (data.activePhase && data.activePhase === 'POST') {
            data.status = 'COMPLETED';
        }

        const updatedCampaign = await this.prisma.campaign.update({
            where: { id },
            data,
        });

        if (data.activePhase && data.activePhase !== oldPhase) {
            await this.triggerPhaseAnalysis(id, oldPhase);
        }

        return updatedCampaign;
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
    private async triggerPhaseAnalysis(
        campaignId: string,
        completedPhase: CampaignPhase,
    ) {
        // Fetch all finalized surveys in the completed phase

        const finalizedSurveys = await this.prisma.survey.findMany({
            where: {
                campaignId,
                phase: completedPhase,
                isFinalized: true,
            },
            include: {
                responses: true,
            },
        });

        if (finalizedSurveys.length === 0) {
            console.log(
                `No finalized surveys found for phase ${completedPhase} in campaign ${campaignId}`,
            );
            return;
        }

        // Aggregate all surveys and their responses
        const phaseData = finalizedSurveys.map((survey) => ({
            title: survey.title,
            form: JSON.parse(survey.form), // Parse form string to array
            responses: survey.responses.map((response) => ({
                id: response.id,
                name: response.name,
                address: response.address,
                data: JSON.parse(response.data), // Parse response data to array of answers
            })),
        }));

        // Fetch campaign title
        const campaign = await this.prisma.campaign.findUnique({
            where: { id: campaignId },
            select: { title: true },
        });

        if (!campaign) {
            throw new NotFoundException('Campaign not found');
        }

        // Fetch previous report (latest for campaign)
        const previousReports = await this.prisma.aiReport.findMany({
            where: {
                campaignId,
            },
            select: {
                report: true,
            },
            orderBy: {
                createdAt: 'desc',
            },
        });

        try {
            const analysisResult = await this.llmService.analyzeSurveyResponses(
                phaseData,
                campaign.title,
                completedPhase,
                previousReports,
            );

            // Store in AiReport
            await this.prisma.aiReport.create({
                data: {
                    campaignId: campaignId,
                    phase: completedPhase,
                    report: analysisResult,
                },
            });

            console.log(JSON.stringify(analysisResult, null, 2));

            console.log(
                `Analysis for phase ${completedPhase} stored successfully`,
            );
        } catch (error) {
            console.error('Error triggering phase analysis:', error);
            // Don't throw, as phase update should succeed even if analysis fails
        }
    }

    async getPhaseAnalysis(campaignId: string) {
        const analysis = await this.prisma.aiReport.findMany({
            where: {
                campaignId,
            },
            orderBy: {
                createdAt: 'desc',
            },
        });

        if (!analysis) throw new NotFoundException('No AI report found');

        analysis.forEach((result) => {
            const report = result.report as any;
            report?.topIssues?.forEach((issue: any) => delete issue.responses);
            report?.locationSentiment?.forEach(
                (loc: any) => delete loc.sentiments,
            );
        });
        return analysis;
    }
}
