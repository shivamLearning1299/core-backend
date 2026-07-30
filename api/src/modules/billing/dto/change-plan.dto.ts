import { IsIn } from 'class-validator';

export class ChangePlanDto {
  @IsIn(['starter', 'pro', 'business'])
  planKey: 'starter' | 'pro' | 'business';

  @IsIn(['MONTHLY', 'ANNUAL'])
  billingCycle: 'MONTHLY' | 'ANNUAL';
}
