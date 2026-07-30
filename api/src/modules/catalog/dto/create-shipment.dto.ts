import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class CreateShipmentDto {
  @IsUUID()
  productId: string;

  @IsIn(['INBOUND', 'OUTBOUND'])
  direction: 'INBOUND' | 'OUTBOUND';

  @IsInt()
  @Min(1)
  quantity: number;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsISO8601()
  expectedAt?: string;
}
