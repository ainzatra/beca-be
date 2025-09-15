import { Role } from '@prisma/client';
import {
    IsBoolean,
    IsEmail,
    IsNotEmpty,
    IsOptional,
    IsString,
} from 'class-validator';

export class CreateUserDto {
    @IsString()
    @IsNotEmpty()
    name: string;

    @IsString()
    @IsNotEmpty()
    username: string;

    @IsString()
    @IsNotEmpty()
    password: string;

    @IsString()
    @IsNotEmpty()
    confirm_password: string;

    @IsString()
    @IsNotEmpty()
    role: Role;

    @IsEmail()
    @IsNotEmpty()
    email: string;
}
