import { CampaignPhase, CampaignStatus } from "@prisma/client";
import { IsNotEmpty, IsOptional, IsString } from "class-validator";

export class UpdateCampaignDto {
    @IsString()
    @IsNotEmpty()
    title: string

    @IsString()
    @IsOptional()
    description: string
    
    @IsString()
    @IsOptional()
    status: CampaignStatus

    @IsString()
    @IsOptional()
    activePhase: CampaignPhase
}