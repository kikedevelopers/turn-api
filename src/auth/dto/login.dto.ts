import { Transform, TransformFnParams } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

const trimString = (value: unknown): string | undefined => {
  return typeof value === 'string' ? value.trim() : undefined;
};

export class LoginDto {
  @IsEmail()
  @IsNotEmpty()
  @Transform(({ value }: TransformFnParams) => trimString(value), { toClassOnly: true })
  username: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}
