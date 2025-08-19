import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

@Schema({ timestamps: true, versionKey: false })
export class User {
  @Prop({ type: String, required: true, trim: true, minlength: 1 })
  name: string;

  @Prop({ type: String, required: true, trim: true, minlength: 1 })
  companyName: string;

  @Prop({ type: String, trim: true })
  lastName?: string;

  @Prop({ type: String, required: true, unique: true, trim: true })
  email: string;

  @Prop({ type: String, required: true, trim: true, minlength: 10 })
  phoneNumber: string;

  // timestamps generados automáticamente por Mongoose
  readonly createdAt?: Date;
  readonly updatedAt?: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);
