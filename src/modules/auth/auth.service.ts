import {
    HttpException,
    HttpStatus,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import { LoginAuthDto } from './dto/login-auth.dto';
import * as bcrypt from 'bcrypt';
import { User } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { ClsService } from 'nestjs-cls';

type TokenPayload = {
    token: string;
    id: string;
    username: string;
    role: string;
    email: string;
    name: string;
};

@Injectable()
export class AuthService {
    constructor(
        private readonly cls: ClsService,
        private readonly service: UsersService,
        private readonly jwtService: JwtService,
    ) {}

    async login(data: LoginAuthDto) {
        const user = await this.service.findByUsername(data.username);

        if (!user) {
            throw new UnauthorizedException('Invalid username or password');
        }
        const isPasswordValid = await bcrypt.compare(
            data.password,
            user.password,
        );

        if (!isPasswordValid)
            throw new UnauthorizedException('Invalid username or password');

        const payload = await this.generateJWT(user);
        return payload;
    }

    async generateJWT(user: User) {
        const tokenPayload = {
            id: user.id,
            username: user.username,
            name: user.name,
            role: user.role,
            email: user.email,
        };

        const token = await this.jwtService.signAsync(tokenPayload);

        return {
            token,
            id: user.id,
            username: user.username,
            role: user.role,
            email: user.email,
            name: user.name,
        };
    }

    async verifyJwtToken(token: string) {
        const result = await this.jwtService.decode(token);
        return result;
    }

    async refresh() {
        const auth = this.cls.get('auth');
        const result = await this.verifyJwtToken(auth.token);
        const user = await this.service.findByUsername(result.username);

        if (!result || !user) {
            throw new UnauthorizedException('Invalid Token');
        }

        return {
            id: user.id,
            token: result.token,
            name: user.name,
            email: user.email,
            username: user.username,
            role: user.role,
        };
    }
}
