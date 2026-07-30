import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma, SenderType } from '@prisma/client';
import { AiStubService } from '../../common/ai-stub/ai-stub.service';
import { PrismaService } from '../../prisma/prisma.service';

interface MessageRecord {
  id: string;
  senderType: SenderType;
  sender?: { email: string } | null;
  text: string;
  aiTag: string | null;
  resultJson: Prisma.JsonValue | null;
  createdAt: Date;
}

@Injectable()
export class MessagingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiStub: AiStubService,
  ) {}

  async listChannels(orgId: string, userId: string) {
    const memberships = await this.prisma.channelMember.findMany({
      where: { userId, channel: { orgId } },
      include: { channel: true },
    });

    const withUnread = await Promise.all(
      memberships.map(async (m) => {
        const unreadCount = await this.prisma.message.count({
          where: {
            channelId: m.channelId,
            createdAt: { gt: m.lastReadAt },
            NOT: { senderType: 'USER', senderId: userId },
          },
        });
        return {
          id: m.channel.id,
          kind: m.channel.kind,
          name: m.channel.name,
          description: m.channel.description,
          unreadCount,
        };
      }),
    );

    return {
      channels: withUnread.filter((c) => c.kind === 'CHANNEL'),
      directMessages: withUnread.filter((c) => c.kind === 'DM'),
    };
  }

  async getMessages(channelId: string, userId: string) {
    await this.assertMember(channelId, userId);

    const messages = await this.prisma.message.findMany({
      where: { channelId },
      orderBy: { createdAt: 'asc' },
      include: { sender: { select: { email: true } } },
    });

    await this.prisma.channelMember.update({
      where: { channelId_userId: { channelId, userId } },
      data: { lastReadAt: new Date() },
    });

    return messages.map((m) => this.toDto(m));
  }

  async sendMessage(channelId: string, userId: string, text: string) {
    await this.assertMember(channelId, userId);

    const message = await this.prisma.message.create({
      data: { channelId, senderType: 'USER', senderId: userId, text },
      include: { sender: { select: { email: true } } },
    });
    return this.toDto(message);
  }

  async askAi(channelId: string, userId: string, text: string) {
    await this.assertMember(channelId, userId);

    const userMessage = await this.prisma.message.create({
      data: { channelId, senderType: 'USER', senderId: userId, text },
      include: { sender: { select: { email: true } } },
    });

    const answer = this.aiStub.answer(text);
    const currency = answer.columns.some((c) => c.currency);
    const rows = answer.chart.map((c) => ({
      label: c.label,
      value: currency
        ? `$${c.value.toLocaleString('en-US')}`
        : c.value.toLocaleString('en-US'),
    }));

    const aiMessage = await this.prisma.message.create({
      data: {
        channelId,
        senderType: 'AI',
        aiTag: 'Answer',
        text: `Here's what I found for "${answer.matchedTopic}":`,
        resultJson: {
          caption: answer.chartCaption,
          rows,
        } as Prisma.InputJsonObject,
      },
    });

    return {
      userMessage: this.toDto(userMessage),
      aiMessage: this.toDto(aiMessage),
    };
  }

  private async assertMember(channelId: string, userId: string) {
    const membership = await this.prisma.channelMember.findUnique({
      where: { channelId_userId: { channelId, userId } },
    });
    if (!membership)
      throw new ForbiddenException('Not a member of this channel');
    return membership;
  }

  private toDto(message: MessageRecord) {
    return {
      id: message.id,
      senderType: message.senderType,
      senderEmail: message.sender?.email ?? null,
      text: message.text,
      aiTag: message.aiTag,
      resultJson: message.resultJson,
      createdAt: message.createdAt,
    };
  }
}
