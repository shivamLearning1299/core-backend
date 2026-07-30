import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { BillingService } from './billing.service';
import { ChangePlanDto } from './dto/change-plan.dto';

@Controller('billing')
@UseGuards(JwtAuthGuard)
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get('plans')
  listPlans() {
    return this.billingService.listPlans();
  }

  @Get('subscription')
  getSubscription(@Req() req: Request & { user: AuthenticatedUser }) {
    return this.billingService.getSubscription(req.user.orgId);
  }

  @Post('subscription/change')
  changePlan(
    @Req() req: Request & { user: AuthenticatedUser },
    @Body() dto: ChangePlanDto,
  ) {
    return this.billingService.changePlan(req.user.orgId, dto);
  }

  @Post('subscription/cancel')
  cancel(@Req() req: Request & { user: AuthenticatedUser }) {
    return this.billingService.cancel(req.user.orgId);
  }

  @Post('subscription/resume')
  resume(@Req() req: Request & { user: AuthenticatedUser }) {
    return this.billingService.resume(req.user.orgId);
  }

  @Get('invoices')
  listInvoices(@Req() req: Request & { user: AuthenticatedUser }) {
    return this.billingService.listInvoices(req.user.orgId);
  }
}
