import { Module } from '@nestjs/common';
import { ClsModule, ClsService } from 'nestjs-cls';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuthInterceptor } from './modules/auth/auth.interceptor';
import { PrismaService } from './modules/prisma/prisma.service';
import { UsersModule } from './modules/users/users.module';
import { ZenstackModule } from './zenstack.module';
import { AuthModule } from './modules/auth/auth.module';
import { CampaignModule } from './modules/campaign/campaign.module';
import { SurveyModule } from './modules/survey/survey.module';
import { ResponseModule } from './modules/response/response.module';
import { LlmModule } from './modules/llm/llm.module';
import { PrismaModule } from './modules/prisma/prisma.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { FacebookModule } from './modules/facebook/facebook.module';

@Module({
    imports: [
        ClsModule.forRoot({
            global: true,
            middleware: {
                mount: true,
            },
        }),
        UsersModule,
        ZenstackModule,
        AuthModule,
        CampaignModule,
        SurveyModule,
        ResponseModule,
        LlmModule,
        PrismaModule,
        EventEmitterModule.forRoot(),
        FacebookModule,
    ],
    controllers: [],
    providers: [
        PrismaService,
        {
            provide: APP_INTERCEPTOR,
            useClass: AuthInterceptor,
        },
    ],
})
export class AppModule {}
