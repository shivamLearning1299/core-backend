import { ForbiddenException } from '@nestjs/common';
import { AiStubService } from '../../common/ai-stub/ai-stub.service';
import { PrismaService } from '../../prisma/prisma.service';
import { MessagingService } from './messaging.service';

type PrismaMock = {
  channelMember: {
    findMany: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
  };
  message: { count: jest.Mock; findMany: jest.Mock; create: jest.Mock };
};

describe('MessagingService', () => {
  let service: MessagingService;
  let prisma: PrismaMock;
  let aiStub: { answer: jest.Mock };

  beforeEach(() => {
    prisma = {
      channelMember: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      message: { count: jest.fn(), findMany: jest.fn(), create: jest.fn() },
    };
    aiStub = { answer: jest.fn() };
    service = new MessagingService(
      prisma as unknown as PrismaService,
      aiStub as unknown as AiStubService,
    );
  });

  describe('listChannels', () => {
    it('splits channels and DMs, with a per-channel unread count excluding my own messages', async () => {
      prisma.channelMember.findMany.mockResolvedValue([
        {
          channelId: 'c1',
          lastReadAt: new Date('2026-01-01'),
          channel: {
            id: 'c1',
            kind: 'CHANNEL',
            name: 'general',
            description: 'd',
          },
        },
        {
          channelId: 'c2',
          lastReadAt: new Date('2026-01-01'),
          channel: { id: 'c2', kind: 'DM', name: 'dm-1', description: null },
        },
      ]);
      let firstCountArgs:
        | {
            where: {
              channelId: string;
              NOT: { senderType: string; senderId: string };
            };
          }
        | undefined;
      prisma.message.count
        .mockImplementationOnce((args: unknown) => {
          firstCountArgs = args as typeof firstCountArgs;
          return Promise.resolve(3);
        })
        .mockResolvedValueOnce(0);

      const result = await service.listChannels('org-1', 'user-1');

      expect(result.channels).toHaveLength(1);
      expect(result.channels[0]).toMatchObject({ id: 'c1', unreadCount: 3 });
      expect(result.directMessages).toHaveLength(1);
      expect(firstCountArgs?.where).toMatchObject({
        channelId: 'c1',
        NOT: { senderType: 'USER', senderId: 'user-1' },
      });
    });
  });

  describe('getMessages', () => {
    it('throws ForbiddenException when the user is not a member', async () => {
      prisma.channelMember.findUnique.mockResolvedValue(null);
      await expect(service.getMessages('c1', 'user-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('marks the channel read and returns mapped messages', async () => {
      prisma.channelMember.findUnique.mockResolvedValue({
        channelId: 'c1',
        userId: 'user-1',
      });
      prisma.message.findMany.mockResolvedValue([
        {
          id: 'm1',
          senderType: 'USER',
          sender: { email: 'a@x.com' },
          text: 'hi',
          aiTag: null,
          resultJson: null,
          createdAt: new Date(),
        },
      ]);
      prisma.channelMember.update.mockResolvedValue({});

      const messages = await service.getMessages('c1', 'user-1');

      expect(messages[0]).toMatchObject({
        id: 'm1',
        senderEmail: 'a@x.com',
        text: 'hi',
      });
      expect(prisma.channelMember.update).toHaveBeenCalledWith({
        where: { channelId_userId: { channelId: 'c1', userId: 'user-1' } },
        data: { lastReadAt: expect.any(Date) as Date },
      });
    });
  });

  describe('sendMessage', () => {
    it('throws ForbiddenException when the user is not a member', async () => {
      prisma.channelMember.findUnique.mockResolvedValue(null);
      await expect(
        service.sendMessage('c1', 'user-1', 'hi'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('creates a USER message', async () => {
      prisma.channelMember.findUnique.mockResolvedValue({
        channelId: 'c1',
        userId: 'user-1',
      });
      prisma.message.create.mockResolvedValue({
        id: 'm1',
        senderType: 'USER',
        sender: { email: 'a@x.com' },
        text: 'hello team',
        aiTag: null,
        resultJson: null,
        createdAt: new Date(),
      });

      const message = await service.sendMessage('c1', 'user-1', 'hello team');

      expect(prisma.message.create).toHaveBeenCalledWith({
        data: {
          channelId: 'c1',
          senderType: 'USER',
          senderId: 'user-1',
          text: 'hello team',
        },
        include: { sender: { select: { email: true } } },
      });
      expect(message.text).toBe('hello team');
    });
  });

  describe('askAi', () => {
    it('persists the user question and a formatted AI reply with currency-formatted values', async () => {
      prisma.channelMember.findUnique.mockResolvedValue({
        channelId: 'c1',
        userId: 'user-1',
      });
      let aiCreateCall:
        | {
            data: {
              resultJson: {
                caption: string;
                rows: { label: string; value: string }[];
              };
            };
          }
        | undefined;
      prisma.message.create
        .mockResolvedValueOnce({
          id: 'm-user',
          senderType: 'USER',
          text: 'revenue by region',
          createdAt: new Date(),
        })
        .mockImplementationOnce((args: unknown) => {
          aiCreateCall = args as typeof aiCreateCall;
          return Promise.resolve({
            id: 'm-ai',
            senderType: 'AI',
            aiTag: 'Answer',
            text: 'placeholder',
            createdAt: new Date(),
          });
        });
      aiStub.answer.mockReturnValue({
        matchedTopic: 'Monthly revenue by region, last 6 months',
        sql: 'SELECT ...',
        columns: [
          { key: 'revenue', label: 'Revenue', numeric: true, currency: true },
        ],
        rows: [],
        chart: [{ label: 'NA', value: 426500 }],
        chartCaption: 'Revenue by region, 3-month total (USD)',
      });

      const result = await service.askAi('c1', 'user-1', 'revenue by region');

      expect(aiStub.answer).toHaveBeenCalledWith('revenue by region');
      expect(aiCreateCall?.data.resultJson.rows[0]).toEqual({
        label: 'NA',
        value: '$426,500',
      });
      expect(result.userMessage.id).toBe('m-user');
      expect(result.aiMessage.id).toBe('m-ai');
    });
  });
});
