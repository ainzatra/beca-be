import {
    IsArray,
    IsString,
    IsNotEmpty,
    IsOptional,
    ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ResponseDataDto {
    @IsString()
    @IsNotEmpty()
    surveyId: string;

    @IsString()
    @IsNotEmpty()
    name: string;

    @IsString()
    @IsNotEmpty()
    address: string;

    @IsString()
    @IsNotEmpty()
    phone: string;

    @IsString()
    @IsNotEmpty()
    valid_id: string;

    @IsNotEmpty()
    data: any; // JSON object containing survey answers
}

export class BulkResponseDto {
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ResponseDataDto)
    responses: ResponseDataDto[];
}
