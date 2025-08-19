import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { RegisterUserDto } from './dto/register-user.dto';
import { LoginDto } from './dto/login.dto';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) {}
    @Post('register/admin')
    @HttpCode(HttpStatus.CREATED)
    register(@Body() payload: RegisterUserDto) {
        return this.authService.register(payload);
    }

    @Post('login')
    @HttpCode(HttpStatus.OK)
    login(@Body() payload: LoginDto) {
        return this.authService.login(payload);
    }
}