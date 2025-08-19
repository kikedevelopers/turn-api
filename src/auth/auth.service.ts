import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { RegisterUserDto } from './dto/register-user.dto';
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
}
