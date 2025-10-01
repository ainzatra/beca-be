import {
    Controller,
    Post,
    Body,
    UseInterceptors,
    UploadedFiles,
    BadRequestException,
    Get,
    Query,
    Delete,
    Param,
    UseGuards,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { LlmService } from './llm.service';
import { AuthGuard } from '../auth/guard/auth.guard';

@UseGuards(AuthGuard)
@Controller('llm')
export class LlmController {
    constructor(private readonly llmService: LlmService) {}

    @Post('count-votes')
    @UseInterceptors(
        FileFieldsInterceptor([
            { name: 'voteFiles', maxCount: 1 },
            { name: 'precinctFile', maxCount: 1 },
        ]),
    )
    async countVotes(
        @Body() body: { year: number; position: string },
        @UploadedFiles()
        files: {
            voteFiles?: Express.Multer.File[];
            precinctFile?: Express.Multer.File[];
        },
    ) {
        if (!body.year) {
            throw new BadRequestException('Year is required');
        }

        if (!body.position) {
            throw new BadRequestException('Position is required');
        }

        if (!files.precinctFile || files.precinctFile.length === 0) {
            throw new BadRequestException('Precinct file is required');
        }

        if (!files.voteFiles || files.voteFiles.length === 0) {
            throw new BadRequestException('At least one vote file is required');
        }

        return this.llmService.countVotes(
            body.year,
            body.position,
            files.voteFiles,
            files.precinctFile[0],
        );
    }

    @Get('history')
    async getHistory(
        @Query('position') position: string,
        @Query('year') year: string,
    ) {
        if (!position) {
            throw new BadRequestException('Position is required');
        }

        if (!year) {
            throw new BadRequestException('Year is required');
        }

        return this.llmService.getHistory(position, year);
    }

    @Delete('history/:id')
    async deleteHistory(
        @Query('position') position: string,
        @Query('year') year: string,
        @Param('id') id: string,
    ) {
        return this.llmService.deleteHistory(id, position, year);
    }
}
