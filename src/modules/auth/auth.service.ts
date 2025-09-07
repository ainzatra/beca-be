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
  role: string
};

@Injectable()
export class AuthService {
  constructor(
    private readonly cls: ClsService,
    private readonly service: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async login(data: LoginAuthDto) {
    const user = await this.service.findByUsername(
      data.username,
    );

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

  async generateJWT(user: User): Promise<TokenPayload> {
    const tokenPayload = {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role
    };

    const token = await this.jwtService.signAsync(tokenPayload);

    return { token, id: user.id, username: user.username, role: user.role };
  }

  async verifyJwtToken(token: string): Promise<TokenPayload> {
    const result = await this.jwtService.decode(token);
    return result;
  }

  async refresh(): Promise<TokenPayload> {
    const auth = this.cls.get('auth')
    console.log('refresh', auth)
    const result = await this.verifyJwtToken(auth.token)

    if (!result) {
      throw new UnauthorizedException('Invalid Token')
    }

    console.log('valid token')
    return result 
  }
}
