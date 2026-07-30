import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ChangePlanDto } from './dto/change-plan.dto';

function centsToDollars(cents: number | null): number | null {
  return cents === null ? null : cents / 100;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService) {}

  async listPlans() {
    const plans = await this.prisma.plan.findMany({
      orderBy: { sortOrder: 'asc' },
    });
    return plans.map((p) => ({
      key: p.key,
      name: p.name,
      monthlyPrice: centsToDollars(p.monthlyPriceCents),
      annualPrice: centsToDollars(p.annualPriceCents),
      description: p.description,
      features: p.features,
      queryLimit: p.queryLimit,
      sortOrder: p.sortOrder,
    }));
  }

  async getSubscription(orgId: string) {
    const sub = await this.prisma.subscription.findUnique({
      where: { orgId },
      include: { plan: true },
    });
    if (!sub)
      throw new NotFoundException('No subscription for this organization');

    return {
      planKey: sub.plan.key,
      planName: sub.plan.name,
      status: sub.status,
      billingCycle: sub.billingCycle,
      currentPeriodEnd: sub.currentPeriodEnd,
      monthlyPrice: centsToDollars(sub.plan.monthlyPriceCents),
      annualPrice: centsToDollars(sub.plan.annualPriceCents),
      queryLimit: sub.plan.queryLimit,
    };
  }

  async changePlan(orgId: string, dto: ChangePlanDto) {
    const [sub, targetPlan] = await Promise.all([
      this.prisma.subscription.findUnique({
        where: { orgId },
        include: { plan: true },
      }),
      this.prisma.plan.findUnique({ where: { key: dto.planKey } }),
    ]);
    if (!sub)
      throw new NotFoundException('No subscription for this organization');
    if (!targetPlan) throw new NotFoundException('Unknown plan');

    const priceCents =
      dto.billingCycle === 'ANNUAL'
        ? targetPlan.annualPriceCents
        : targetPlan.monthlyPriceCents;
    if (priceCents === null) {
      throw new BadRequestException('This plan requires contacting sales');
    }

    const periodDays = dto.billingCycle === 'ANNUAL' ? 365 : 30;
    const updated = await this.prisma.subscription.update({
      where: { orgId },
      data: {
        planId: targetPlan.id,
        billingCycle: dto.billingCycle,
        status: 'ACTIVE',
        currentPeriodEnd: new Date(Date.now() + periodDays * MS_PER_DAY),
      },
      include: { plan: true },
    });

    if (priceCents > 0) {
      const billedAmount =
        dto.billingCycle === 'ANNUAL' ? priceCents * 12 : priceCents;
      await this.prisma.invoice.create({
        data: {
          subscriptionId: updated.id,
          amountCents: billedAmount,
          status: 'PAID',
          description: `${sub.plan.name} → ${targetPlan.name}${dto.billingCycle === 'ANNUAL' ? ', billed annually' : ''}`,
        },
      });
    }

    return this.getSubscription(orgId);
  }

  async cancel(orgId: string) {
    await this.prisma.subscription.update({
      where: { orgId },
      data: { status: 'CANCELING' },
    });
    return this.getSubscription(orgId);
  }

  async resume(orgId: string) {
    await this.prisma.subscription.update({
      where: { orgId },
      data: { status: 'ACTIVE' },
    });
    return this.getSubscription(orgId);
  }

  async listInvoices(orgId: string) {
    const sub = await this.prisma.subscription.findUnique({ where: { orgId } });
    if (!sub)
      throw new NotFoundException('No subscription for this organization');

    const invoices = await this.prisma.invoice.findMany({
      where: { subscriptionId: sub.id },
      orderBy: { issuedAt: 'desc' },
    });

    return invoices.map((inv) => ({
      id: inv.id,
      amount: inv.amountCents / 100,
      status: inv.status,
      description: inv.description,
      issuedAt: inv.issuedAt,
    }));
  }
}
