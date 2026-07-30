import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateQueryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  question: string;
}
