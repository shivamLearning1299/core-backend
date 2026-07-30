import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { CreateShipmentDto } from './dto/create-shipment.dto';
import { UpdateShipmentStatusDto } from './dto/update-shipment-status.dto';

const OPEN_SHIPMENT_STATUSES = ['PENDING', 'IN_TRANSIT'] as const;

interface PipelineTotals {
  inboundQty: number;
  outboundQty: number;
}

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async listCategories(orgId: string) {
    return this.prisma.category.findMany({
      where: { orgId },
      orderBy: { name: 'asc' },
    });
  }

  async createCategory(orgId: string, dto: CreateCategoryDto) {
    const existing = await this.prisma.category.findUnique({
      where: { orgId_name: { orgId, name: dto.name } },
    });
    if (existing) {
      throw new BadRequestException('A category with this name already exists');
    }
    return this.prisma.category.create({
      data: { orgId, name: dto.name, description: dto.description },
    });
  }

  private async pipelineTotalsByProduct(
    orgId: string,
    productIds: string[],
  ): Promise<Map<string, PipelineTotals>> {
    const totals = new Map<string, PipelineTotals>();
    if (productIds.length === 0) return totals;

    const grouped = await this.prisma.productShipment.groupBy({
      by: ['productId', 'direction'],
      where: {
        orgId,
        productId: { in: productIds },
        status: { in: [...OPEN_SHIPMENT_STATUSES] },
      },
      _sum: { quantity: true },
    });

    for (const row of grouped) {
      const entry = totals.get(row.productId) ?? {
        inboundQty: 0,
        outboundQty: 0,
      };
      const qty = row._sum.quantity ?? 0;
      if (row.direction === 'INBOUND') entry.inboundQty += qty;
      else entry.outboundQty += qty;
      totals.set(row.productId, entry);
    }
    return totals;
  }

  async listProducts(orgId: string) {
    const products = await this.prisma.product.findMany({
      where: { orgId },
      include: { category: true },
      orderBy: { name: 'asc' },
    });
    const totals = await this.pipelineTotalsByProduct(
      orgId,
      products.map((p) => p.id),
    );

    return products.map((p) => {
      const pipeline = totals.get(p.id) ?? { inboundQty: 0, outboundQty: 0 };
      return {
        id: p.id,
        sku: p.sku,
        name: p.name,
        description: p.description,
        priceCents: p.priceCents,
        stockQty: p.stockQty,
        reorderPoint: p.reorderPoint,
        lowStock: p.stockQty <= p.reorderPoint,
        category: { id: p.category.id, name: p.category.name },
        inboundPipelineQty: pipeline.inboundQty,
        outboundPipelineQty: pipeline.outboundQty,
        updatedAt: p.updatedAt,
      };
    });
  }

  async createProduct(orgId: string, dto: CreateProductDto) {
    const category = await this.prisma.category.findUnique({
      where: { id: dto.categoryId },
    });
    if (!category || category.orgId !== orgId) {
      throw new NotFoundException('Unknown category');
    }

    const existingSku = await this.prisma.product.findUnique({
      where: { orgId_sku: { orgId, sku: dto.sku } },
    });
    if (existingSku) {
      throw new BadRequestException('A product with this SKU already exists');
    }

    return this.prisma.product.create({
      data: {
        orgId,
        categoryId: dto.categoryId,
        sku: dto.sku,
        name: dto.name,
        description: dto.description,
        priceCents: dto.priceCents,
        stockQty: dto.stockQty ?? 0,
        reorderPoint: dto.reorderPoint ?? 0,
      },
    });
  }

  async updateProduct(orgId: string, productId: string, dto: UpdateProductDto) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });
    if (!product || product.orgId !== orgId) {
      throw new NotFoundException('Unknown product');
    }

    if (dto.categoryId) {
      const category = await this.prisma.category.findUnique({
        where: { id: dto.categoryId },
      });
      if (!category || category.orgId !== orgId) {
        throw new NotFoundException('Unknown category');
      }
    }

    return this.prisma.product.update({
      where: { id: productId },
      data: {
        categoryId: dto.categoryId,
        name: dto.name,
        description: dto.description,
        priceCents: dto.priceCents,
        reorderPoint: dto.reorderPoint,
      },
    });
  }

  async listShipments(orgId: string) {
    return this.prisma.productShipment.findMany({
      where: { orgId },
      include: { product: { select: { id: true, name: true, sku: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createShipment(orgId: string, dto: CreateShipmentDto) {
    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
    });
    if (!product || product.orgId !== orgId) {
      throw new NotFoundException('Unknown product');
    }

    if (dto.direction === 'OUTBOUND' && product.stockQty < dto.quantity) {
      throw new BadRequestException(
        'Not enough stock to allocate this delivery',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      if (dto.direction === 'OUTBOUND') {
        await tx.product.update({
          where: { id: product.id },
          data: { stockQty: { decrement: dto.quantity } },
        });
      }

      return tx.productShipment.create({
        data: {
          orgId,
          productId: dto.productId,
          direction: dto.direction,
          quantity: dto.quantity,
          reference: dto.reference,
          expectedAt: dto.expectedAt ? new Date(dto.expectedAt) : undefined,
        },
      });
    });
  }

  async updateShipmentStatus(
    orgId: string,
    shipmentId: string,
    dto: UpdateShipmentStatusDto,
  ) {
    const shipment = await this.prisma.productShipment.findUnique({
      where: { id: shipmentId },
    });
    if (!shipment || shipment.orgId !== orgId) {
      throw new NotFoundException('Unknown shipment');
    }
    if (shipment.status === 'COMPLETED' || shipment.status === 'CANCELED') {
      throw new BadRequestException('This shipment has already been finalized');
    }

    return this.prisma.$transaction(async (tx) => {
      if (dto.status === 'COMPLETED' && shipment.direction === 'INBOUND') {
        await tx.product.update({
          where: { id: shipment.productId },
          data: { stockQty: { increment: shipment.quantity } },
        });
      }
      if (dto.status === 'CANCELED' && shipment.direction === 'OUTBOUND') {
        await tx.product.update({
          where: { id: shipment.productId },
          data: { stockQty: { increment: shipment.quantity } },
        });
      }

      return tx.productShipment.update({
        where: { id: shipmentId },
        data: {
          status: dto.status,
          completedAt: dto.status === 'COMPLETED' ? new Date() : undefined,
        },
      });
    });
  }

  async summary(orgId: string) {
    const [categoryCount, products, inboundAgg, outboundAgg] =
      await Promise.all([
        this.prisma.category.count({ where: { orgId } }),
        this.prisma.product.findMany({
          where: { orgId },
          select: { stockQty: true, reorderPoint: true },
        }),
        this.prisma.productShipment.aggregate({
          where: {
            orgId,
            direction: 'INBOUND',
            status: { in: [...OPEN_SHIPMENT_STATUSES] },
          },
          _sum: { quantity: true },
        }),
        this.prisma.productShipment.aggregate({
          where: {
            orgId,
            direction: 'OUTBOUND',
            status: { in: [...OPEN_SHIPMENT_STATUSES] },
          },
          _sum: { quantity: true },
        }),
      ]);

    const productCount = products.length;
    const totalStockQty = products.reduce((sum, p) => sum + p.stockQty, 0);
    const lowStockCount = products.filter(
      (p) => p.stockQty <= p.reorderPoint,
    ).length;

    return {
      categoryCount,
      productCount,
      totalStockQty,
      lowStockCount,
      inboundPipelineQty: inboundAgg._sum.quantity ?? 0,
      outboundPipelineQty: outboundAgg._sum.quantity ?? 0,
    };
  }
}
