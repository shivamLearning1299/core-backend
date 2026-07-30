import { Module } from '@nestjs/common';
import { AiStubModule } from '../../common/ai-stub/ai-stub.module';
import { MessagingController } from './messaging.controller';
import { MessagingService } from './messaging.service';

@Module({
  imports: [AiStubModule],
  controllers: [MessagingController],
  providers: [MessagingService],
})
export class MessagingModule {}
