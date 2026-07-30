import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { CatalogService } from './catalog.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { CreateShipmentDto } from './dto/create-shipment.dto';
import { UpdateShipmentStatusDto } from './dto/update-shipment-status.dto';

@Controller('catalog')
@UseGuards(JwtAuthGuard)
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get('summary')
  summary(@Req() req: Request & { user: AuthenticatedUser }) {
    return this.catalogService.summary(req.user.orgId);
  }

  @Get('categories')
  listCategories(@Req() req: Request & { user: AuthenticatedUser }) {
    return this.catalogService.listCategories(req.user.orgId);
  }

  @Post('categories')
  createCategory(
    @Req() req: Request & { user: AuthenticatedUser },
    @Body() dto: CreateCategoryDto,
  ) {
    return this.catalogService.createCategory(req.user.orgId, dto);
  }

  @Get('products')
  listProducts(@Req() req: Request & { user: AuthenticatedUser }) {
    return this.catalogService.listProducts(req.user.orgId);
  }

  @Post('products')
  createProduct(
    @Req() req: Request & { user: AuthenticatedUser },
    @Body() dto: CreateProductDto,
  ) {
    return this.catalogService.createProduct(req.user.orgId, dto);
  }

  @Patch('products/:id')
  updateProduct(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.catalogService.updateProduct(req.user.orgId, id, dto);
  }

  @Get('shipments')
  listShipments(@Req() req: Request & { user: AuthenticatedUser }) {
    return this.catalogService.listShipments(req.user.orgId);
  }

  @Post('shipments')
  createShipment(
    @Req() req: Request & { user: AuthenticatedUser },
    @Body() dto: CreateShipmentDto,
  ) {
    return this.catalogService.createShipment(req.user.orgId, dto);
  }

  @Patch('shipments/:id/status')
  updateShipmentStatus(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('id') id: string,
    @Body() dto: UpdateShipmentStatusDto,
  ) {
    return this.catalogService.updateShipmentStatus(req.user.orgId, id, dto);
  }
}
