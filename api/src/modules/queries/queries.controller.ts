import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { CreateQueryDto } from './dto/create-query.dto';
import { QueriesService } from './queries.service';

@Controller('queries')
@UseGuards(JwtAuthGuard)
export class QueriesController {
  constructor(private readonly queriesService: QueriesService) {}

  @Post()
  ask(
    @Req() req: Request & { user: AuthenticatedUser },
    @Body() dto: CreateQueryDto,
  ) {
    return this.queriesService.ask(
      req.user.orgId,
      req.user.userId,
      dto.question,
    );
  }

  @Get('recent')
  recent(@Req() req: Request & { user: AuthenticatedUser }) {
    return this.queriesService.recent(req.user.orgId);
  }
}
