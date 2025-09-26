import { Global, Module } from '@nestjs/common';
import { LlmController } from './llm.controller';
import { LlmService } from './llm.service';
import { PrismaModule } from '../prisma/prisma.module';
import { S3Service } from 'src/s3.service';

@Global()
@Module({
    controllers: [LlmController],
    providers: [LlmService, S3Service],
    imports: [PrismaModule],
    exports: [LlmService],
})
export class LlmModule {}
