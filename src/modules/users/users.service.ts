import {
    Injectable,
    Inject,
    HttpException,
    HttpStatus,
    UnauthorizedException,
    BadRequestException,
    NotFoundException,
} from '@nestjs/common';
import { ENHANCED_PRISMA } from '@zenstackhq/server/nestjs';
import { User } from '@prisma/client';
import { PrismaService } from 'src/modules/prisma/prisma.service';
import bcrypt from 'bcrypt';
import { ClsService } from 'nestjs-cls';
import { UpdateUserDto } from './dto/update-user.dto';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UsersService {
    constructor(
        private readonly cls: ClsService,
        private readonly prisma: PrismaService,
    ) {}

    async create(body: CreateUserDto): Promise<User> {
        const { role } = await this.cls.get('auth');
        if (role === 'SURVEYOR') {
            throw new UnauthorizedException();
        }

        if (role === 'ADMIN' && body.role !== 'SURVEYOR') {
            throw new UnauthorizedException();
        }

        if (
            body.password &&
            body.confirm_password &&
            body.password !== body.confirm_password
        ) {
            throw new HttpException(
                'Passwords do not match',
                HttpStatus.BAD_REQUEST,
            );
        }

        const user = await this.prisma.user.findFirst({
            where: {
                OR: [{ email: body.email }, { username: body.username }],
            },
        });

        if (user) throw new BadRequestException('Email/Username already used');

        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(body.password, saltRounds);
        const data = {
            name: body.name,
            username: body.username,
            role: body.role,
            password: hashedPassword,
            email: body.email,
        };

        return this.prisma.user.create({ data });
    }

    async findByUsername(username: string): Promise<User | null> {
        return this.prisma.user.findFirst({
            where: {
                username: username,
            },
        });
    }

    async findAll(): Promise<User[]> {
        const { role } = await this.cls.get('auth');
        if (role === 'SURVEYOR') {
            throw new UnauthorizedException();
        }

        if (role === 'ADMIN') {
            return this.prisma.user.findMany({
                where: {
                    role: 'SURVEYOR',
                },
                orderBy: {
                    name: 'asc',
                },
            });
        }
        return this.prisma.user.findMany({
            where: {
                NOT: {
                    role: 'SUPERADMIN',
                },
            },
            orderBy: {
                name: 'asc',
            },
        });
    }

    async updateUser(id: string, data: UpdateUserDto) {
        if (data.username) {
            const user = await this.prisma.user.findUnique({
                where: { username: data.username },
            });

            if (user && id !== user.id)
                throw new BadRequestException('Username already used');
        }

        return this.prisma.user.update({
            where: { id },
            data,
        });
    }

    async updatePassword(
        id: string,
        data: { new: string; confirm: string; old: string },
    ) {
        if (data.new !== data.confirm)
            throw new BadRequestException('Password does not match');

        const user = await this.prisma.user.findUnique({ where: { id } });

        if (!user) throw new NotFoundException();

        const isPasswordValid = await bcrypt.compare(data.old, user.password);

        if (!isPasswordValid)
            throw new UnauthorizedException('Incorrect password');

        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(data.old, saltRounds);

        return this.prisma.user.update({
            where: { id },
            data: {
                password: hashedPassword,
            },
        });
    }
}
