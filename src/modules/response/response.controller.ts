import { Body, Controller, Param, Post } from '@nestjs/common';
import { ResponseService } from './response.service';

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


}
