import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';

@Injectable()
export class ResponseService {
    constructor(private readonly prisma: PrismaService) {}

    async submitResponse(surveyId, data) {
        const survey = await this.prisma.survey.findUnique({
            where: { id: surveyId },
            include: {
                campaign: true
            }
        })
        
        if (!survey) {
            throw new NotFoundException('Survey not found')
        }
        
        if (survey.campaign.activePhase !== survey.phase || !survey.isFinalized) {
            throw new BadRequestException('Survey is not accepting any more respondents.')
        }

        const response = await this.prisma.response.create({ data })

        if(!response) {
            throw new BadRequestException()
        }

        return 'Response saved'
    }
}
