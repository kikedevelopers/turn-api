import { HttpService } from '@nestjs/axios';
import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { RegisterUserDto } from '../../auth/dto/register-user.dto';

interface Auth0TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface Auth0UserResponse {
user_id: string;
  [key: string]: any;
}

@Injectable()
export class Auth0Service {
  private readonly logger = new Logger(Auth0Service.name);

  constructor(private readonly http: HttpService, private readonly config: ConfigService) {}

  private getBaseUrl(): string {
    const domain = this.config.get<string>('AUTH0_DOMAIN');
    if (!domain) throw new InternalServerErrorException('Missing AUTH0_DOMAIN');
    return domain.startsWith('http') ? domain.replace(/\/$/, '') : `https://${domain}`;
  }

  private getMgmtAudience(): string {
    const audience = this.config.get<string>('AUTH0_MGMT_AUDIENCE');
    if (audience && audience.length > 0) {
      const a = audience.trim();
      return a.startsWith('http') ? a : `https://${a.replace(/^https?:\/\//, '')}`;
    }
    return `${this.getBaseUrl()}/api/v2/`;
  }

  private async getManagementToken(): Promise<string> {
    const client_id = this.config.get<string>('AUTH0_MGMT_CLIENT_ID');
    const client_secret = this.config.get<string>('AUTH0_MGMT_CLIENT_SECRET');
    const audience = this.getMgmtAudience();
    const url = `${this.getBaseUrl()}/oauth/token`;

    try {
      const { data } = await firstValueFrom(
        this.http.post<Auth0TokenResponse>(url, {
          grant_type: 'client_credentials',
          client_id,
          client_secret,
          audience,
          scope: 'create:users delete:users',
        }),
      );
      return data.access_token;
    } catch (error) {
      this.logger.error('Error obtaining Auth0 management token', error);
      throw new InternalServerErrorException('Auth0 token acquisition failed');
    }
  }

  async createUser(payload: RegisterUserDto): Promise<Auth0UserResponse> {
    const token = await this.getManagementToken();
    const url = `${this.getBaseUrl()}/api/v2/users`;
    const connection = this.config.get<string>('AUTH0_DB_CONNECTION');

    const body = {
      connection,
      email: payload.email,
      password: payload.password,
      name: payload.name,
      family_name: payload.lastName ?? undefined,
      user_metadata: {
        companyName: payload.companyName,
        phoneNumber: payload.phoneNumber,
      },
    };

    try {
      const { data } = await firstValueFrom(
        this.http.post<Auth0UserResponse>(url, body, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      return data;
    } catch (error) {
      this.logger.error('Error creating Auth0 user', error);
      throw new InternalServerErrorException('Auth0 user creation failed');
    }
  }

  async deleteUser(userId: string): Promise<void> {
    const token = await this.getManagementToken();
    const url = `${this.getBaseUrl()}/api/v2/users/${encodeURIComponent(userId)}`;
    try {
      await firstValueFrom(
        this.http.delete(url, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
    } catch (error) {
      this.logger.error(`Error deleting Auth0 user ${userId}`, error);
      // No rethrow to avoid masking original errors in rollback callers
    }
  }
}
