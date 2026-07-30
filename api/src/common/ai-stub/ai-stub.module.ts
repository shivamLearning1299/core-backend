import { Module } from '@nestjs/common';
import { AiStubService } from './ai-stub.service';

@Module({
  providers: [AiStubService],
  exports: [AiStubService],
})
export class AiStubModule {}
