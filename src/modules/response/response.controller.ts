import { Body, Controller, Param, Post, Get, UseGuards } from '@nestjs/common';
import { ResponseService } from './response.service';
import { AuthGuard } from '../auth/guard/auth.guard';

@Controller('response')
export class ResponseController {
    constructor(private readonly service: ResponseService) {}

    @Post('/bulk-submit')
    async bulkSubmit(@Body() body) {
        return this.service.bulkSubmit(body)
    }
    @Post(':surveyId')
    async submitResponse(@Param('surveyId') surveyId: string, @Body() body) {
        return this.service.submitResponse(surveyId, body)
    }

    @UseGuards(AuthGuard)
    @Get('survey/:surveyId')
    async findSurveyResponses(@Param('surveyId') surveyId: string) {
        return this.service.fetchResponse(surveyId)
    }
}
