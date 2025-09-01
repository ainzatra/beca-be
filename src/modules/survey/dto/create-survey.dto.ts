import { CampaignPhase } from "@prisma/client";
import { IsNotEmpty, IsOptional, IsString } from "class-validator";

export class CreateSurveyDto {
    @IsString()
    @IsNotEmpty()
    title: string

    @IsString()
    @IsNotEmpty()
    phase: CampaignPhase

    @IsString()
    @IsNotEmpty()
    campaignId: string

    @IsString()
    @IsOptional()
    form: string
}