import { Injectable } from '@nestjs/common';

export interface AiColumn {
  key: string;
  label: string;
  numeric?: boolean;
  currency?: boolean;
}

export interface AiAnswer {
  matchedTopic: string;
  sql: string;
  columns: AiColumn[];
  rows: Record<string, string | number>[];
  chart: { label: string; value: number }[];
  chartCaption: string;
  chartHorizontal?: boolean;
}

interface Dataset extends AiAnswer {
  keywords: string[];
}

// Stand-in for analytics-engine (FastAPI), which doesn't exist yet: real NL
// -> SQL -> execution needs an LLM and a connected data source, neither of
// which this service has. This keyword-matches a question against three
// fixed, realistic datasets so the query/chat plumbing (persistence, API
// shapes, the frontend) can be built and exercised for real today.
// Swapping this out for a call to analytics-engine's /v1/query should not
// require changing anything upstream of `AiStubService.answer()`.
const DATASETS: Dataset[] = [
  {
    matchedTopic: 'Monthly revenue by region, last 6 months',
    keywords: ['revenue', 'region', 'mrr'],
    sql: `SELECT region,
       date_trunc('month', created_at) AS month,
       SUM(amount)::numeric(12,2) AS revenue,
       COUNT(*) AS orders
FROM orders
WHERE created_at >= now() - interval '6 months'
GROUP BY region, month
ORDER BY month, region;`,
    columns: [
      { key: 'region', label: 'Region' },
      { key: 'month', label: 'Month' },
      { key: 'revenue', label: 'Revenue', numeric: true, currency: true },
      { key: 'orders', label: 'Orders', numeric: true },
    ],
    rows: [
      { region: 'NA', month: 'Feb', revenue: 128400, orders: 812 },
      { region: 'EMEA', month: 'Feb', revenue: 94200, orders: 601 },
      { region: 'APAC', month: 'Feb', revenue: 61300, orders: 388 },
      { region: 'NA', month: 'Mar', revenue: 141900, orders: 874 },
      { region: 'EMEA', month: 'Mar', revenue: 101500, orders: 655 },
      { region: 'APAC', month: 'Mar', revenue: 68900, orders: 421 },
      { region: 'NA', month: 'Apr', revenue: 156200, orders: 940 },
      { region: 'EMEA', month: 'Apr', revenue: 108700, orders: 690 },
      { region: 'APAC', month: 'Apr', revenue: 74800, orders: 459 },
    ],
    chart: [
      { label: 'NA', value: 426500 },
      { label: 'EMEA', value: 304400 },
      { label: 'APAC', value: 205000 },
    ],
    chartCaption: 'Revenue by region, 3-month total (USD)',
  },
  {
    matchedTopic: 'Top customers by lifetime value',
    keywords: ['customer', 'ltv', 'lifetime'],
    sql: `SELECT c.name AS customer,
       c.plan,
       SUM(o.amount)::numeric(12,2) AS ltv,
       COUNT(o.id) AS orders
FROM customers c
JOIN orders o ON o.customer_id = c.id
GROUP BY c.name, c.plan
ORDER BY ltv DESC
LIMIT 7;`,
    columns: [
      { key: 'customer', label: 'Customer' },
      { key: 'plan', label: 'Plan' },
      { key: 'ltv', label: 'LTV', numeric: true, currency: true },
      { key: 'orders', label: 'Orders', numeric: true },
    ],
    rows: [
      {
        customer: 'Northwind Traders',
        plan: 'Enterprise',
        ltv: 84200,
        orders: 46,
      },
      { customer: 'Globex Retail', plan: 'Enterprise', ltv: 71950, orders: 39 },
      { customer: 'Initech Labs', plan: 'Pro', ltv: 52300, orders: 61 },
      { customer: 'Umbrella Supply', plan: 'Pro', ltv: 44100, orders: 28 },
      { customer: 'Soylent Foods', plan: 'Team', ltv: 31800, orders: 22 },
      { customer: 'Hooli Devices', plan: 'Team', ltv: 27650, orders: 19 },
      { customer: 'Wayne Logistics', plan: 'Pro', ltv: 22400, orders: 15 },
    ],
    chart: [
      { label: 'Northwind', value: 84200 },
      { label: 'Globex', value: 71950 },
      { label: 'Initech', value: 52300 },
      { label: 'Umbrella', value: 44100 },
      { label: 'Soylent', value: 31800 },
      { label: 'Hooli', value: 27650 },
      { label: 'Wayne', value: 22400 },
    ],
    chartCaption: 'Lifetime value by customer (USD)',
    chartHorizontal: true,
  },
  {
    matchedTopic: 'Payments that failed in the last 7 days',
    keywords: ['fail', 'declin', 'payment'],
    sql: `SELECT o.id AS order_id,
       c.name AS customer,
       o.amount,
       o.failure_reason,
       o.created_at::date AS date
FROM orders o
JOIN customers c ON c.id = o.customer_id
WHERE o.status = 'failed'
  AND o.created_at >= now() - interval '7 days'
ORDER BY o.created_at DESC;`,
    columns: [
      { key: 'order_id', label: 'Order' },
      { key: 'customer', label: 'Customer' },
      { key: 'amount', label: 'Amount', numeric: true, currency: true },
      { key: 'reason', label: 'Failure reason' },
      { key: 'date', label: 'Date' },
    ],
    rows: [
      {
        order_id: '#8841',
        customer: 'Hooli Devices',
        amount: 1200,
        reason: 'Card declined',
        date: 'Jul 28',
      },
      {
        order_id: '#8833',
        customer: 'Wayne Logistics',
        amount: 640,
        reason: 'Insufficient funds',
        date: 'Jul 27',
      },
      {
        order_id: '#8820',
        customer: 'Soylent Foods',
        amount: 2150,
        reason: 'Card declined',
        date: 'Jul 25',
      },
      {
        order_id: '#8807',
        customer: 'Umbrella Supply',
        amount: 980,
        reason: 'Expired card',
        date: 'Jul 24',
      },
      {
        order_id: '#8795',
        customer: 'Initech Labs',
        amount: 315,
        reason: 'Card declined',
        date: 'Jul 23',
      },
    ],
    chart: [
      { label: 'Card declined', value: 3 },
      { label: 'Insufficient funds', value: 1 },
      { label: 'Expired card', value: 1 },
    ],
    chartCaption: 'Failed payments by reason, last 7 days',
    chartHorizontal: true,
  },
];

@Injectable()
export class AiStubService {
  answer(question: string): AiAnswer {
    const q = question.toLowerCase();
    const matched =
      DATASETS.find((d) => d.keywords.some((k) => q.includes(k))) ??
      DATASETS[0];
    // Shallow-copy the array fields — DATASETS is a shared module-level
    // singleton, so returning its arrays directly would let one caller's
    // mutation (e.g. `.push`) corrupt the dataset for every future request.
    return {
      matchedTopic: matched.matchedTopic,
      sql: matched.sql,
      columns: [...matched.columns],
      rows: [...matched.rows],
      chart: [...matched.chart],
      chartCaption: matched.chartCaption,
      chartHorizontal: matched.chartHorizontal,
    };
  }
}
