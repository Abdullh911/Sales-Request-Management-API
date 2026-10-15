import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Public } from '../common/decorators/public.decorator';
import { CreateWebhookRequestDto } from './dto/create-webhook-request.dto';
import { SalesRequest } from './entities/sales-request.entity';
import { RequestsService } from './requests.service';

@Controller('webhooks')
export class WebhooksController {
  constructor(
    private readonly requestsService: RequestsService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Requirement 1: Receive incoming sales requests from an external system (webhook).
   * Marked `@Public()` because external webhook callers do not use internal user headers.
   * Optionally validates `x-webhook-secret` if `WEBHOOK_SECRET` is configured in `.env`.
   */
  @Public()
  @Post('requests')
  @HttpCode(HttpStatus.CREATED)
  async receiveSalesRequest(
    @Body() dto: CreateWebhookRequestDto,
    @Headers('x-webhook-secret') webhookSecret?: string,
  ): Promise<SalesRequest> {
    const configuredSecret = this.configService.get<string>('WEBHOOK_SECRET');
    if (configuredSecret && configuredSecret.trim().length > 0) {
      if (webhookSecret !== configuredSecret) {
        throw new UnauthorizedException('Invalid or missing x-webhook-secret header.');
      }
    }

    return this.requestsService.createFromWebhook(dto);
  }
}
