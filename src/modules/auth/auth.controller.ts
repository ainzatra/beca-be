import { Body, Controller, Get, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginAuthDto } from './dto/login-auth.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly service: AuthService) {}

  @Post('login')
  async login(@Body() data: LoginAuthDto) {
    return this.service.login(data);
  }

  @Get('me')
  async refresh() {
    return this.service.refresh()
  }
}
