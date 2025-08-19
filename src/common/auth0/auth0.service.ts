import { HttpService } from '@nestjs/axios';
import { BadRequestException, Injectable, InternalServerErrorException, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { RegisterUserDto } from '../../auth/dto/register-user.dto';
import type { AxiosError } from 'axios';

interface Auth0TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface Auth0UserInfo {
  sub?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  nickname?: string;
  picture?: string;
  updated_at?: string;
  email?: string;
  email_verified?: boolean;
  [key: string]: unknown;
}

export interface Auth0UserResponse {
  user_id: string;
  [key: string]: any;
}

export interface Auth0PasswordLoginResponse {
  access_token?: string;
  id_token?: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
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

  // Helpers para Authentication API (login de usuario)
  private getAuthnClientId(): string {
    const id = this.config.get<string>('AUTH0_AUTHN_CLIENT_ID');
    if (!id) throw new InternalServerErrorException('Missing AUTH0_AUTHN_CLIENT_ID');
    return id;
  }

  private getAuthnClientSecret(): string | undefined {
    return this.config.get<string>('AUTH0_AUTHN_CLIENT_SECRET') || undefined;
  }

  private getAuthnAudience(): string | undefined {
    const aud = this.config.get<string>('AUTH0_AUTHN_AUDIENCE');
    if (!aud) return undefined;
    const a = aud.trim();
    return a.startsWith('http') ? a : `https://${a.replace(/^https?:\/\//, '')}`;
  }

  private getAuthnScope(): string {
    return this.config.get<string>('AUTH0_AUTHN_SCOPE') || 'openid profile email';
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
      const err = error as Error;
      this.logger.error('Error obtaining Auth0 management token', err.stack);
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
      const err = error as Error;
      this.logger.error('Error creating Auth0 user', err.stack);
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
      const err = error as Error;
      this.logger.error(`Error deleting Auth0 user ${userId}`, err.stack);
      // No rethrow to avoid masking original errors in rollback callers
    }
  }

  // Authentication API: Resource Owner Password Credentials (si está habilitado)
  async loginWithPassword(username: string, password: string): Promise<Auth0PasswordLoginResponse> {
    const url = `${this.getBaseUrl()}/oauth/token`;
    const body: Record<string, any> = {
      grant_type: 'password',
      username,
      password,
      client_id: this.getAuthnClientId(),
      scope: this.getAuthnScope(),
    };
    const clientSecret = this.getAuthnClientSecret();
    if (clientSecret) body.client_secret = clientSecret;
    const audience = this.getAuthnAudience();
    if (audience) body.audience = audience;

    try {
      const { data } = await firstValueFrom(
        this.http.post<Auth0PasswordLoginResponse>(url, body),
      );
      return data;
    } catch (error) {
      const axiosErr = error as AxiosError<{ error?: string; error_description?: string }>;
      const errData = axiosErr.response?.data;
      const code = errData?.error;
      const desc = errData?.error_description || 'Fallo en autenticación con Auth0';
      this.logger.warn(`Auth0 login error: ${code} - ${desc}`);
      if (code === 'invalid_grant') {
        throw new UnauthorizedException('Credenciales inválidas');
      }
      throw new BadRequestException(`${code ?? 'auth0_error'}: ${desc}`);
    }
  }

  async getUserInfo(accessToken: string): Promise<Auth0UserInfo> {
    const url = `${this.getBaseUrl()}/userinfo`;
    try {
      const { data } = await firstValueFrom(
        this.http.get<Auth0UserInfo>(url, { headers: { Authorization: `Bearer ${accessToken}` } }),
      );
      return data;
    } catch (error) {
      const axiosErr = error as AxiosError<{ error_description?: string; message?: string }>;
      const status = axiosErr.response?.status;
      const errData = axiosErr.response?.data;
      const msg = errData?.error_description || errData?.message || 'Fallo al obtener userinfo de Auth0';
      if (status === 401) throw new UnauthorizedException('Token de acceso inválido para userinfo');
      throw new InternalServerErrorException(msg);
    }
  }
}
