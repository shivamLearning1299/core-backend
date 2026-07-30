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

// Demo catalog data so a fresh org has something to look at on the Catalog
// page immediately, consistent with the channel-seeding approach above.
const DEFAULT_CATEGORIES = [
  {
    name: 'Apparel',
    description: 'Clothing and wearables',
    products: [
      {
        sku: 'TEE-001',
        name: 'Classic Tee',
        priceCents: 1999,
        stockQty: 8,
        reorderPoint: 15,
      },
      {
        sku: 'HOOD-001',
        name: 'Hoodie',
        priceCents: 4999,
        stockQty: 40,
        reorderPoint: 10,
      },
    ],
  },
  {
    name: 'Electronics',
    description: 'Gadgets and accessories',
    products: [
      {
        sku: 'EARB-001',
        name: 'Wireless Earbuds',
        priceCents: 7999,
        stockQty: 5,
        reorderPoint: 20,
      },
      {
        sku: 'CABL-001',
        name: 'USB-C Cable',
        priceCents: 999,
        stockQty: 120,
        reorderPoint: 30,
      },
    ],
  },
];

const DAY_MS = 24 * 60 * 60 * 1000;

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

  const productsBySku = new Map<string, string>();
  for (const category of DEFAULT_CATEGORIES) {
    const createdCategory = await tx.category.create({
      data: { orgId, name: category.name, description: category.description },
    });

    for (const product of category.products) {
      const createdProduct = await tx.product.create({
        data: {
          orgId,
          categoryId: createdCategory.id,
          sku: product.sku,
          name: product.name,
          priceCents: product.priceCents,
          stockQty: product.stockQty,
          reorderPoint: product.reorderPoint,
        },
      });
      productsBySku.set(product.sku, createdProduct.id);
    }
  }

  await tx.productShipment.create({
    data: {
      orgId,
      productId: productsBySku.get('TEE-001')!,
      direction: 'INBOUND',
      status: 'PENDING',
      quantity: 50,
      reference: 'Supplier: Acme Textiles',
      expectedAt: new Date(Date.now() + 7 * DAY_MS),
    },
  });
  await tx.productShipment.create({
    data: {
      orgId,
      productId: productsBySku.get('HOOD-001')!,
      direction: 'OUTBOUND',
      status: 'PENDING',
      quantity: 10,
      reference: 'Order #10234',
    },
  });
  await tx.productShipment.create({
    data: {
      orgId,
      productId: productsBySku.get('EARB-001')!,
      direction: 'OUTBOUND',
      status: 'IN_TRANSIT',
      quantity: 3,
      reference: 'Order #10235',
    },
  });
}
