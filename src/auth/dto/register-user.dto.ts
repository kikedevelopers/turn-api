import { Transform, TransformFnParams } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

const trimString = (value: unknown): string | undefined => {
    return typeof value === 'string' ? value.trim() : undefined;
};

export class RegisterUserDto {
    @IsString()
    @IsNotEmpty()
    @MinLength(1)
    @Transform(({ value }: TransformFnParams) => trimString(value), { toClassOnly: true })
    name: string;

    @IsString()
    @IsNotEmpty()
    @MinLength(1)
    @Transform(({ value }: TransformFnParams) => trimString(value), { toClassOnly: true })
    companyName: string;

    @IsOptional()
    @IsString()
    @Transform(({ value }: TransformFnParams) => trimString(value), { toClassOnly: true })
    lastName?: string;

    @IsEmail()
    @IsNotEmpty()
    @Transform(({ value }: TransformFnParams) => trimString(value), { toClassOnly: true })
    email: string;

    @IsString()
    @IsNotEmpty()
    @MinLength(10)
    @Transform(({ value }: TransformFnParams) => trimString(value), { toClassOnly: true })
    phoneNumber: string;

    @IsString()
    @IsNotEmpty()
    @MinLength(8)
    password: string;
}
