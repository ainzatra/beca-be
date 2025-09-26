import {
    Controller,
    Post,
    Body,
    UseInterceptors,
    UploadedFiles,
    BadRequestException,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { LlmService } from './llm.service';

@Controller('llm')
export class LlmController {
    constructor(private readonly llmService: LlmService) {}

    @Post('count-votes')
    @UseInterceptors(
        FileFieldsInterceptor([
            { name: 'voteFiles', maxCount: 10 },
            { name: 'precinctFile', maxCount: 1 },
        ]),
    )
    async countVotes(
        @Body() body: { year: number },
        @UploadedFiles()
        files: {
            voteFiles?: Express.Multer.File[];
            precinctFile?: Express.Multer.File[];
        },
    ) {
        if (!body.year) {
            throw new BadRequestException('Year is required');
        }

        if (!files.precinctFile || files.precinctFile.length === 0) {
            throw new BadRequestException('Precinct file is required');
        }

        if (!files.voteFiles || files.voteFiles.length === 0) {
            throw new BadRequestException('At least one vote file is required');
        }

        const result = await this.llmService.countVotes(
            body.year,
            files.voteFiles,
            files.precinctFile[0],
        );

        return result;
    }
}
