import { Module } from '@nestjs/common';
import { SurveyService } from './survey.service';
import { SurveyController } from './survey.controller';
import { PrismaService } from 'src/modules/prisma/prisma.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
    imports: [PrismaModule],
    providers: [SurveyService],
    controllers: [SurveyController],
})
export class SurveyModule {}
