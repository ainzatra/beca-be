import {
    Body,
    Controller,
    Get,
    Param,
    Post,
    Put,
    UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { AuthGuard } from '../auth/guard/auth.guard';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@UseGuards(AuthGuard)
@Controller('users')
export class UsersController {
    constructor(private readonly service: UsersService) {}

    @Post()
    async create(@Body() body: CreateUserDto) {
        return this.service.create(body);
    }

    @Get()
    async fetchUsers() {
        return this.service.findAll();
    }

    @Put('password/:id')
    async updatePassword(@Param('id') id: string, @Body() body) {
        return this.service.updatePassword(id, body);
    }

    @Put(':id')
    async updateUser(@Param('id') id: string, @Body() body: UpdateUserDto) {
        return this.service.updateUser(id, body);
    }
}
