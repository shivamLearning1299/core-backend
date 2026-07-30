import { Prisma } from '@prisma/client';

// Mirrors the channel set from the dashboard-frontend design mock. DMs aren't
// seeded here: they need a second real user, and there's no team-invite flow
// yet, so a fresh org's Direct Messages list is genuinely empty until one exists.
const DEFAULT_CHANNELS = [
  { name: 'general', description: 'Company-wide announcements' },
  { name: 'product', description: 'Product & roadmap discussion' },
  {
    name: 'data-alerts',
    description: 'Automated alerts from shivecom queries',
  },
  { name: 'incidents', description: 'Active incident coordination' },
];

const WELCOME_ALERT_TEXT =
  "Welcome to shivecom! I'll post here whenever something in your data needs attention — for example: failed payments are up 3x vs last week (5 failures in the last 24h). Try asking me about it below.";

/**
 * Runs inside the same transaction as org/user creation (called from
 * AuthService.register) so a new workspace boots atomically with a usable
 * default subscription and a few channels — never a half-created org if
 * something in here fails.
 */
export async function provisionNewOrg(
  tx: Prisma.TransactionClient,
  orgId: string,
  userId: string,
): Promise<void> {
  const proPlan = await tx.plan.findUniqueOrThrow({ where: { key: 'pro' } });

  await tx.subscription.create({
    data: {
      orgId,
      planId: proPlan.id,
      status: 'ACTIVE',
      billingCycle: 'MONTHLY',
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });

  for (const channel of DEFAULT_CHANNELS) {
    const created = await tx.channel.create({
      data: {
        orgId,
        name: channel.name,
        description: channel.description,
        members: { create: { userId } },
      },
    });

    if (channel.name === 'data-alerts') {
      await tx.message.create({
        data: {
          channelId: created.id,
          senderType: 'AI',
          aiTag: 'Alert',
          text: WELCOME_ALERT_TEXT,
        },
      });
    }
  }
}
