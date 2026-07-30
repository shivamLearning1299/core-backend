import { AiStubService } from './ai-stub.service';

describe('AiStubService', () => {
  let service: AiStubService;

  beforeEach(() => {
    service = new AiStubService();
  });

  it('matches the revenue-by-region dataset on revenue/region/mrr keywords', () => {
    const answer = service.answer('What is our MRR this quarter?');
    expect(answer.matchedTopic).toBe(
      'Monthly revenue by region, last 6 months',
    );
    expect(answer.chartCaption).toContain('Revenue by region');
  });

  it('matches the top-customers dataset on customer/ltv/lifetime keywords', () => {
    const answer = service.answer('Who are our top customers by LTV?');
    expect(answer.matchedTopic).toBe('Top customers by lifetime value');
  });

  it('matches the failed-payments dataset on fail/declin/payment keywords', () => {
    const answer = service.answer('Show me payments that failed recently');
    expect(answer.matchedTopic).toBe('Payments that failed in the last 7 days');
  });

  it('is case-insensitive', () => {
    const answer = service.answer('FAILED PAYMENTS THIS WEEK');
    expect(answer.matchedTopic).toBe('Payments that failed in the last 7 days');
  });

  it('defaults to revenue-by-region when nothing matches', () => {
    const answer = service.answer('what is the meaning of life');
    expect(answer.matchedTopic).toBe(
      'Monthly revenue by region, last 6 months',
    );
  });

  it('returns a fresh object each call (not a shared mutable reference)', () => {
    const first = service.answer('revenue by region');
    first.rows.push({ region: 'MARS', month: 'Jan', revenue: 1, orders: 1 });
    const second = service.answer('revenue by region');
    expect(second.rows).not.toContain(first.rows[first.rows.length - 1]);
  });
});
