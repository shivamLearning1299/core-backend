import { Module } from '@nestjs/common';
import { AiStubModule } from '../../common/ai-stub/ai-stub.module';
import { QueriesController } from './queries.controller';
import { QueriesService } from './queries.service';

@Module({
  imports: [AiStubModule],
  controllers: [QueriesController],
  providers: [QueriesService],
})
export class QueriesModule {}
