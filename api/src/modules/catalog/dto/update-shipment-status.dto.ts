import { IsIn } from 'class-validator';

export class UpdateShipmentStatusDto {
  @IsIn(['IN_TRANSIT', 'COMPLETED', 'CANCELED'])
  status: 'IN_TRANSIT' | 'COMPLETED' | 'CANCELED';
}
