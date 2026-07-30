import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BillingService } from './billing.service';

type PrismaMock = {
  plan: { findMany: jest.Mock; findUnique: jest.Mock };
  subscription: { findUnique: jest.Mock; update: jest.Mock };
  invoice: { create: jest.Mock; findMany: jest.Mock };
};

describe('BillingService', () => {
  let service: BillingService;
  let prisma: PrismaMock;

  beforeEach(() => {
    prisma = {
      plan: { findMany: jest.fn(), findUnique: jest.fn() },
      subscription: { findUnique: jest.fn(), update: jest.fn() },
      invoice: { create: jest.fn(), findMany: jest.fn() },
    };
    service = new BillingService(prisma as unknown as PrismaService);
  });

  describe('listPlans', () => {
    it('converts cents to dollars and passes through null (custom) prices', async () => {
      prisma.plan.findMany.mockResolvedValue([
        {
          key: 'starter',
          name: 'Starter',
          monthlyPriceCents: 0,
          annualPriceCents: 0,
          description: 'd',
          features: [],
          sortOrder: 0,
        },
        {
          key: 'pro',
          name: 'Pro',
          monthlyPriceCents: 4900,
          annualPriceCents: 3900,
          description: 'd',
          features: [],
          sortOrder: 1,
        },
        {
          key: 'enterprise',
          name: 'Enterprise',
          monthlyPriceCents: null,
          annualPriceCents: null,
          description: 'd',
          features: [],
          sortOrder: 3,
        },
      ]);

      const plans = await service.listPlans();

      expect(plans[1].monthlyPrice).toBe(49);
      expect(plans[1].annualPrice).toBe(39);
      expect(plans[2].monthlyPrice).toBeNull();
      expect(prisma.plan.findMany).toHaveBeenCalledWith({
        orderBy: { sortOrder: 'asc' },
      });
    });
  });

  describe('getSubscription', () => {
    it('throws NotFoundException when the org has no subscription', async () => {
      prisma.subscription.findUnique.mockResolvedValue(null);
      await expect(service.getSubscription('org-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('maps the subscription + plan into the expected shape', async () => {
      prisma.subscription.findUnique.mockResolvedValue({
        status: 'ACTIVE',
        billingCycle: 'MONTHLY',
        currentPeriodEnd: new Date('2026-08-14'),
        plan: {
          key: 'pro',
          name: 'Pro',
          monthlyPriceCents: 4900,
          annualPriceCents: 3900,
        },
      });

      const result = await service.getSubscription('org-1');
      expect(result).toMatchObject({
        planKey: 'pro',
        planName: 'Pro',
        status: 'ACTIVE',
        monthlyPrice: 49,
      });
    });
  });

  describe('changePlan', () => {
    const currentSub = { id: 'sub-1', plan: { name: 'Starter' } };
    const proPlan = {
      id: 'plan-pro',
      key: 'pro',
      name: 'Pro',
      monthlyPriceCents: 4900,
      annualPriceCents: 3900,
    };

    it('rejects a plan that requires contacting sales (null price)', async () => {
      prisma.subscription.findUnique.mockResolvedValue(currentSub);
      prisma.plan.findUnique.mockResolvedValue({
        id: 'plan-ent',
        key: 'enterprise',
        monthlyPriceCents: null,
        annualPriceCents: null,
      });

      await expect(
        service.changePlan('org-1', {
          planKey: 'business' as 'starter' | 'pro' | 'business',
          billingCycle: 'MONTHLY',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws NotFoundException for an unknown plan key', async () => {
      prisma.subscription.findUnique.mockResolvedValue(currentSub);
      prisma.plan.findUnique.mockResolvedValue(null);

      await expect(
        service.changePlan('org-1', {
          planKey: 'pro',
          billingCycle: 'MONTHLY',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('updates the subscription and creates a paid invoice for a priced plan', async () => {
      prisma.subscription.findUnique
        .mockResolvedValueOnce(currentSub) // lookup before update
        .mockResolvedValueOnce({
          status: 'ACTIVE',
          billingCycle: 'MONTHLY',
          currentPeriodEnd: new Date(),
          plan: proPlan,
        }); // getSubscription() call at the end
      prisma.plan.findUnique.mockResolvedValue(proPlan);
      let updateCall:
        | {
            where: { orgId: string };
            data: { planId: string; billingCycle: string; status: string };
          }
        | undefined;
      prisma.subscription.update.mockImplementation((args: unknown) => {
        updateCall = args as typeof updateCall;
        return Promise.resolve({ id: 'sub-1', plan: proPlan });
      });
      let invoiceCall:
        | {
            data: {
              subscriptionId: string;
              amountCents: number;
              status: string;
            };
          }
        | undefined;
      prisma.invoice.create.mockImplementation((args: unknown) => {
        invoiceCall = args as typeof invoiceCall;
        return Promise.resolve({});
      });

      await service.changePlan('org-1', {
        planKey: 'pro',
        billingCycle: 'MONTHLY',
      });

      expect(updateCall?.where).toEqual({ orgId: 'org-1' });
      expect(updateCall?.data).toMatchObject({
        planId: 'plan-pro',
        billingCycle: 'MONTHLY',
        status: 'ACTIVE',
      });
      expect(invoiceCall?.data).toMatchObject({
        subscriptionId: 'sub-1',
        amountCents: 4900,
        status: 'PAID',
      });
    });

    it('does not create an invoice when the plan is free (Starter)', async () => {
      const starterPlan = {
        id: 'plan-starter',
        key: 'starter',
        name: 'Starter',
        monthlyPriceCents: 0,
        annualPriceCents: 0,
      };
      prisma.subscription.findUnique
        .mockResolvedValueOnce(currentSub)
        .mockResolvedValueOnce({
          status: 'ACTIVE',
          billingCycle: 'MONTHLY',
          currentPeriodEnd: new Date(),
          plan: starterPlan,
        });
      prisma.plan.findUnique.mockResolvedValue(starterPlan);
      prisma.subscription.update.mockResolvedValue({
        id: 'sub-1',
        plan: starterPlan,
      });

      await service.changePlan('org-1', {
        planKey: 'starter',
        billingCycle: 'MONTHLY',
      });

      expect(prisma.invoice.create).not.toHaveBeenCalled();
    });
  });

  describe('cancel / resume', () => {
    it('cancel sets status to CANCELING', async () => {
      prisma.subscription.update.mockResolvedValue({});
      prisma.subscription.findUnique.mockResolvedValue({
        status: 'CANCELING',
        billingCycle: 'MONTHLY',
        currentPeriodEnd: new Date(),
        plan: {
          key: 'pro',
          name: 'Pro',
          monthlyPriceCents: 4900,
          annualPriceCents: 3900,
        },
      });

      await service.cancel('org-1');
      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: { orgId: 'org-1' },
        data: { status: 'CANCELING' },
      });
    });

    it('resume sets status back to ACTIVE', async () => {
      prisma.subscription.update.mockResolvedValue({});
      prisma.subscription.findUnique.mockResolvedValue({
        status: 'ACTIVE',
        billingCycle: 'MONTHLY',
        currentPeriodEnd: new Date(),
        plan: {
          key: 'pro',
          name: 'Pro',
          monthlyPriceCents: 4900,
          annualPriceCents: 3900,
        },
      });

      await service.resume('org-1');
      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: { orgId: 'org-1' },
        data: { status: 'ACTIVE' },
      });
    });
  });

  describe('listInvoices', () => {
    it('throws NotFoundException when the org has no subscription', async () => {
      prisma.subscription.findUnique.mockResolvedValue(null);
      await expect(service.listInvoices('org-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('maps invoice cents to dollars, newest first', async () => {
      prisma.subscription.findUnique.mockResolvedValue({ id: 'sub-1' });
      prisma.invoice.findMany.mockResolvedValue([
        {
          id: 'inv-1',
          amountCents: 4900,
          status: 'PAID',
          description: 'Pro plan',
          issuedAt: new Date(),
        },
      ]);

      const invoices = await service.listInvoices('org-1');
      expect(invoices[0].amount).toBe(49);
      expect(prisma.invoice.findMany).toHaveBeenCalledWith({
        where: { subscriptionId: 'sub-1' },
        orderBy: { issuedAt: 'desc' },
      });
    });
  });
});
