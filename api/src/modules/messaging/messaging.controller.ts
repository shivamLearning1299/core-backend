import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { SendMessageDto } from './dto/send-message.dto';
import { MessagingService } from './messaging.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class MessagingController {
  constructor(private readonly messagingService: MessagingService) {}

  @Get('channels')
  listChannels(@Req() req: Request & { user: AuthenticatedUser }) {
    return this.messagingService.listChannels(req.user.orgId, req.user.userId);
  }

  @Get('channels/:id/messages')
  getMessages(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('id') id: string,
  ) {
    return this.messagingService.getMessages(id, req.user.userId);
  }

  @Post('channels/:id/messages')
  sendMessage(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.messagingService.sendMessage(id, req.user.userId, dto.text);
  }

  @Post('channels/:id/ask-ai')
  askAi(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.messagingService.askAi(id, req.user.userId, dto.text);
  }
}
