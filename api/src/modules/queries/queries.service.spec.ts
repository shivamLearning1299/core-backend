import { AiStubService } from '../../common/ai-stub/ai-stub.service';
import { PrismaService } from '../../prisma/prisma.service';
import { QueriesService } from './queries.service';

type PrismaMock = {
  queryHistory: { create: jest.Mock; findMany: jest.Mock; count: jest.Mock };
};

describe('QueriesService', () => {
  let service: QueriesService;
  let prisma: PrismaMock;
  let aiStub: { answer: jest.Mock };

  beforeEach(() => {
    prisma = {
      queryHistory: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
    };
    aiStub = { answer: jest.fn() };
    service = new QueriesService(
      prisma as unknown as PrismaService,
      aiStub as unknown as AiStubService,
    );
  });

  describe('ask', () => {
    it('persists a QueryHistory row scoped to the org/user and returns the answer', async () => {
      aiStub.answer.mockReturnValue({
        matchedTopic: 'Top customers by lifetime value',
        sql: 'SELECT ...',
        columns: [],
        rows: [{ customer: 'Acme' }],
        chart: [],
        chartCaption: 'caption',
      });
      prisma.queryHistory.create.mockResolvedValue({
        id: 'q1',
        createdAt: new Date('2026-07-30'),
      });

      const result = await service.ask(
        'org-1',
        'user-1',
        'top customers by ltv',
      );

      expect(prisma.queryHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          orgId: 'org-1',
          userId: 'user-1',
          question: 'top customers by ltv',
          status: 'OK',
          rowCount: 1,
        }) as unknown,
      });
      expect(result.id).toBe('q1');
      expect(result.matchedTopic).toBe('Top customers by lifetime value');
    });
  });

  describe('count', () => {
    it('returns the org-scoped total query count', async () => {
      prisma.queryHistory.count.mockResolvedValue(42);
      const result = await service.count('org-1');
      expect(prisma.queryHistory.count).toHaveBeenCalledWith({
        where: { orgId: 'org-1' },
      });
      expect(result).toEqual({ count: 42 });
    });
  });

  describe('recent', () => {
    it('returns the org scoped history, newest first, capped at 20', async () => {
      prisma.queryHistory.findMany.mockResolvedValue([
        {
          id: 'q1',
          question: 'q',
          status: 'OK',
          rowCount: 3,
          createdAt: new Date(),
        },
      ]);

      const rows = await service.recent('org-1');

      expect(prisma.queryHistory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { orgId: 'org-1' },
          orderBy: { createdAt: 'desc' },
          take: 20,
        }),
      );
      expect(rows).toHaveLength(1);
    });
  });
});
