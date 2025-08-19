import { Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { RegisterUserDto } from './dto/register-user.dto';
import { LoginDto } from './dto/login.dto';
import { User, UserDocument } from '../common/schemas/user.schema';
import { Auth0Service } from '../common/auth0/auth0.service';

@Injectable()
export class AuthService {
    private readonly logger = new Logger(AuthService.name);

    constructor(
        @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
        private readonly auth0Service: Auth0Service,
    ) {}

    async register(payload: RegisterUserDto) {
        const { password, ...safe } = payload;
        const masked = password ? '*'.repeat(8) : undefined;
        this.logger.log(`Register payload: ${JSON.stringify({ ...safe, password: masked })}`);

        // 1) Crear usuario en Auth0
        const auth0User = await this.auth0Service.createUser(payload);

        // 2) Registrar en MongoDB; si falla, hacer rollback en Auth0
        try {
            const doc = await this.userModel.create({
                name: payload.name,
                companyName: payload.companyName,
                lastName: payload.lastName,
                email: payload.email,
                phoneNumber: payload.phoneNumber,
            });

            return {
                isSuccess: true,
                message: 'User registered',
                data: {
                    _id: doc._id,
                    email: doc.email,
                    name: doc.name,
                    companyName: doc.companyName,
                    lastName: doc.lastName,
                    phoneNumber: doc.phoneNumber,
                    authProfile: auth0User,  
                },
            };

        } catch (error) {
            await this.auth0Service.deleteUser(auth0User.user_id);
            this.logger.error('Mongo user creation failed, rolled back Auth0 user', error);
            throw new InternalServerErrorException('Mongo user creation failed');
        }
    }

    async login(payload: LoginDto) {
        const { password, ...safe } = payload;
        const masked = password ? '*'.repeat(8) : undefined;
        this.logger.log(`Login payload: ${JSON.stringify({ ...safe, password: masked })}`);

        // 1) Verificar existencia de usuario en MongoDB
        const user = await this.userModel.findOne({ email: payload.username }).exec();
        if (!user) {
            throw new NotFoundException('User not found');
        }

        // 2) Autenticar contra Auth0 (Authentication API)
        const tokens = await this.auth0Service.loginWithPassword(payload.username, password);

        // 3) (Opcional) Obtener userinfo si hay access_token
        let auth0Profile: Record<string, unknown> | undefined;
        if (tokens?.access_token) {
            try {
                auth0Profile = await this.auth0Service.getUserInfo(tokens.access_token);
            } catch (error) {
                // No bloquear login si falla userinfo; ya tenemos tokens
                const err = error as Error;
                this.logger.warn(`Failed to fetch Auth0 userinfo after login: ${err.message}`);
            }
        }

        return {
            isSuccess: true,
            message: 'Login successful',
            data: {
                user: {
                    _id: user._id,
                    email: user.email,
                    name: user.name,
                    companyName: user.companyName,
                    lastName: user.lastName,
                    phoneNumber: user.phoneNumber,
                },
                tokens,
                auth0Profile,
            },
        };
    }
}
