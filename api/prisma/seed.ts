import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Idempotent by `key` — safe to run on every deploy (docker-entrypoint.sh
// runs it after migrations) as well as ad-hoc in local dev.
const PLANS = [
  {
    key: 'starter',
    name: 'Starter',
    monthlyPriceCents: 0,
    annualPriceCents: 0,
    description: 'For solo builders trying shivecom out.',
    features: ['500 AI queries / month', '1 connected data source', 'Community support', '7-day query history'],
    queryLimit: 500,
    sortOrder: 0,
  },
  {
    key: 'pro',
    name: 'Pro',
    monthlyPriceCents: 4900,
    annualPriceCents: 3900,
    description: 'For small teams shipping on real data.',
    features: [
      '10,000 AI queries / month',
      '5 connected data sources',
      'Team messaging',
      'Priority email support',
      'Saved & scheduled queries',
    ],
    queryLimit: 10000,
    sortOrder: 1,
  },
  {
    key: 'business',
    name: 'Business',
    monthlyPriceCents: 19900,
    annualPriceCents: 15900,
    description: 'For growing teams with compliance needs.',
    features: [
      '50,000 AI queries / month',
      'Unlimited data sources',
      'SSO & audit logs',
      'Dedicated Slack channel',
      '99.9% uptime SLA',
    ],
    queryLimit: 50000,
    sortOrder: 2,
  },
  {
    key: 'enterprise',
    name: 'Enterprise',
    monthlyPriceCents: null,
    annualPriceCents: null,
    description: 'For large orgs with custom requirements.',
    features: ['Unlimited AI queries', 'Custom data residency', 'Dedicated infrastructure', 'Custom SLA & onboarding'],
    queryLimit: null,
    sortOrder: 3,
  },
];

async function main() {
  for (const plan of PLANS) {
    await prisma.plan.upsert({
      where: { key: plan.key },
      update: plan,
      create: plan,
    });
  }
  console.log(`Seeded ${PLANS.length} plans.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
