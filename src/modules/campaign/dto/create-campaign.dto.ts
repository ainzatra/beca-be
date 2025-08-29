import { CampaignStatus } from "@prisma/client";
import { IsNotEmpty, IsOptional, IsString } from "class-validator";

export class CreateCampaignDto {
    @IsString()
    @IsNotEmpty()
    title: string

    @IsString()
    @IsOptional()
    description: string
    
    @IsString()
    @IsOptional()
    status: CampaignStatus
}