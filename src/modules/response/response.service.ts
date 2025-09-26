import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { Response } from '@prisma/client';
import { PrismaService } from 'src/modules/prisma/prisma.service';

@Injectable()
export class ResponseService {
    constructor(private readonly prisma: PrismaService) {}

    async bulkSubmit(data) {
        for (const response of data.body) {
            response.data = JSON.stringify(response.data);
            await this.prisma.response.create({ data: response });
        }
        return 'Responses saved';
    }

    async submitResponse(surveyId, data) {
        const survey = await this.prisma.survey.findUnique({
            where: { id: surveyId },
            include: {
                campaign: true,
            },
        });

        if (!survey) {
            throw new NotFoundException('Survey not found');
        }

        if (
            survey.campaign.activePhase !== survey.phase ||
            !survey.isFinalized
        ) {
            throw new BadRequestException(
                'Survey is not accepting any more respondents.',
            );
        }

        const response = await this.prisma.response.create({ data });

        if (!response) {
            throw new BadRequestException();
        }

        return 'Response saved';
    }

    async fetchResponse(surveyId) {
        return this.prisma.response.findMany({
            where: {
                surveyId,
            },
        });
    }
}
