import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AiStubService, AiAnswer } from '../../common/ai-stub/ai-stub.service';
import { PrismaService } from '../../prisma/prisma.service';

export interface QueryResult extends AiAnswer {
  id: string;
  question: string;
  createdAt: Date;
}

@Injectable()
export class QueriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiStub: AiStubService,
  ) {}

  async ask(
    orgId: string,
    userId: string,
    question: string,
  ): Promise<QueryResult> {
    const answer = this.aiStub.answer(question);

    const record = await this.prisma.queryHistory.create({
      data: {
        orgId,
        userId,
        question,
        status: 'OK',
        sql: answer.sql,
        rowCount: answer.rows.length,
        resultJson: answer as unknown as Prisma.InputJsonObject,
      },
    });

    return { id: record.id, question, createdAt: record.createdAt, ...answer };
  }

  async count(orgId: string): Promise<{ count: number }> {
    const count = await this.prisma.queryHistory.count({ where: { orgId } });
    return { count };
  }

  async recent(orgId: string) {
    const rows = await this.prisma.queryHistory.findMany({
      where: { orgId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        question: true,
        status: true,
        rowCount: true,
        createdAt: true,
      },
    });
    return rows;
  }
}
