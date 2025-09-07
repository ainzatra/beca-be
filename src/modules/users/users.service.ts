import { Injectable, Inject, HttpException, HttpStatus, UnauthorizedException } from '@nestjs/common';
import { ENHANCED_PRISMA } from '@zenstackhq/server/nestjs';
import { User } from '@prisma/client';
import { PrismaService } from 'src/prisma.service';
import bcrypt from 'bcrypt'
import { ClsService } from 'nestjs-cls';

@Injectable()
export class UsersService {
  constructor(
      private readonly cls: ClsService,
      private readonly prisma: PrismaService) {}

  async create(body): Promise<User> {
    const { role } = await this.cls.get('auth')
    if (role === 'SURVEYOR') {
      throw new UnauthorizedException()
    }

    if (role === 'ADMIN' && body.role !== 'SURVEYOR') {
      throw new UnauthorizedException()
    }

    if (body.password && body.confirm_password && body.password !== body.confirm_password) {
      throw new HttpException('Passwords do not match', HttpStatus.BAD_REQUEST)
    }

    const saltRounds = 10
    const hashedPassword = await bcrypt.hash(body.password, saltRounds)
    const data = {
      name: body.name,
      username: body.username,
      role: body.role,
      password: hashedPassword
    }
    
    return this.prisma.user.create({ data });
  }

  async findByUsername(username: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: {
        username: username,
      },
    });
  }

  async findAll(): Promise<User[]>{
    const { role } = await this.cls.get('auth')
    if (role === 'SURVEYOR') {
      throw new UnauthorizedException()
    }

    if (role === 'ADMIN') {
    return this.prisma.user.findMany({
      where: {
          role: 'SURVEYOR'
      },
      orderBy: {
        name: 'asc'
      }
    })

    }
    return this.prisma.user.findMany({
      where: {
        NOT: {
          role: 'SUPERADMIN'
        }
      },
      orderBy: {
        name: 'asc'
      }
    })
  }

}