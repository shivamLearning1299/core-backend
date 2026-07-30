import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CatalogService } from './catalog.service';

type PrismaMock = {
  category: {
    findMany: jest.Mock;
    findUnique: jest.Mock;
    create: jest.Mock;
    count: jest.Mock;
  };
  product: {
    findMany: jest.Mock;
    findUnique: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  productShipment: {
    findMany: jest.Mock;
    findUnique: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    groupBy: jest.Mock;
    aggregate: jest.Mock;
  };
  $transaction: jest.Mock;
};

describe('CatalogService', () => {
  let service: CatalogService;
  let prisma: PrismaMock;

  beforeEach(() => {
    prisma = {
      category: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        count: jest.fn(),
      },
      product: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      productShipment: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        groupBy: jest.fn(),
        aggregate: jest.fn(),
      },
      $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(prisma)),
    };
    service = new CatalogService(prisma as unknown as PrismaService);
  });

  describe('createCategory', () => {
    it('rejects a duplicate name within the org', async () => {
      prisma.category.findUnique.mockResolvedValue({ id: 'cat-1' });
      await expect(
        service.createCategory('org-1', { name: 'Apparel' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('creates the category when the name is free', async () => {
      prisma.category.findUnique.mockResolvedValue(null);
      prisma.category.create.mockResolvedValue({
        id: 'cat-1',
        name: 'Apparel',
      });
      const result = await service.createCategory('org-1', { name: 'Apparel' });
      expect(result).toMatchObject({ id: 'cat-1' });
      expect(prisma.category.create).toHaveBeenCalledWith({
        data: { orgId: 'org-1', name: 'Apparel', description: undefined },
      });
    });
  });

  describe('listProducts', () => {
    it('flags low stock and attaches pipeline totals per product', async () => {
      prisma.product.findMany.mockResolvedValue([
        {
          id: 'prod-1',
          sku: 'TEE-001',
          name: 'Classic Tee',
          description: null,
          priceCents: 1999,
          stockQty: 8,
          reorderPoint: 15,
          category: { id: 'cat-1', name: 'Apparel' },
          updatedAt: new Date(),
        },
        {
          id: 'prod-2',
          sku: 'HOOD-001',
          name: 'Hoodie',
          description: null,
          priceCents: 4999,
          stockQty: 40,
          reorderPoint: 10,
          category: { id: 'cat-1', name: 'Apparel' },
          updatedAt: new Date(),
        },
      ]);
      prisma.productShipment.groupBy.mockResolvedValue([
        { productId: 'prod-1', direction: 'INBOUND', _sum: { quantity: 50 } },
        { productId: 'prod-2', direction: 'OUTBOUND', _sum: { quantity: 10 } },
      ]);

      const products = await service.listProducts('org-1');

      expect(products[0]).toMatchObject({
        id: 'prod-1',
        lowStock: true,
        inboundPipelineQty: 50,
        outboundPipelineQty: 0,
      });
      expect(products[1]).toMatchObject({
        id: 'prod-2',
        lowStock: false,
        inboundPipelineQty: 0,
        outboundPipelineQty: 10,
      });
    });
  });

  describe('createProduct', () => {
    it('throws NotFoundException when the category belongs to another org', async () => {
      prisma.category.findUnique.mockResolvedValue({
        id: 'cat-1',
        orgId: 'org-2',
      });
      await expect(
        service.createProduct('org-1', {
          categoryId: 'cat-1',
          sku: 'X',
          name: 'X',
          priceCents: 100,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects a duplicate SKU within the org', async () => {
      prisma.category.findUnique.mockResolvedValue({
        id: 'cat-1',
        orgId: 'org-1',
      });
      prisma.product.findUnique.mockResolvedValue({ id: 'prod-1' });
      await expect(
        service.createProduct('org-1', {
          categoryId: 'cat-1',
          sku: 'TEE-001',
          name: 'Classic Tee',
          priceCents: 1999,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('defaults stockQty and reorderPoint to 0 when omitted', async () => {
      prisma.category.findUnique.mockResolvedValue({
        id: 'cat-1',
        orgId: 'org-1',
      });
      prisma.product.findUnique.mockResolvedValue(null);
      let createArgs:
        | { data: { stockQty: number; reorderPoint: number } }
        | undefined;
      prisma.product.create.mockImplementation((args: unknown) => {
        createArgs = args as typeof createArgs;
        return Promise.resolve({ id: 'prod-1' });
      });

      await service.createProduct('org-1', {
        categoryId: 'cat-1',
        sku: 'TEE-001',
        name: 'Classic Tee',
        priceCents: 1999,
      });

      expect(createArgs?.data.stockQty).toBe(0);
      expect(createArgs?.data.reorderPoint).toBe(0);
    });
  });

  describe('createShipment', () => {
    it('rejects an OUTBOUND shipment that exceeds available stock', async () => {
      prisma.product.findUnique.mockResolvedValue({
        id: 'prod-1',
        orgId: 'org-1',
        stockQty: 5,
      });
      await expect(
        service.createShipment('org-1', {
          productId: 'prod-1',
          direction: 'OUTBOUND',
          quantity: 10,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.product.update).not.toHaveBeenCalled();
    });

    it('decrements stock immediately for an OUTBOUND shipment', async () => {
      prisma.product.findUnique.mockResolvedValue({
        id: 'prod-1',
        orgId: 'org-1',
        stockQty: 40,
      });
      prisma.productShipment.create.mockResolvedValue({ id: 'ship-1' });

      await service.createShipment('org-1', {
        productId: 'prod-1',
        direction: 'OUTBOUND',
        quantity: 10,
      });

      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: 'prod-1' },
        data: { stockQty: { decrement: 10 } },
      });
    });

    it('does not touch stock for an INBOUND shipment', async () => {
      prisma.product.findUnique.mockResolvedValue({
        id: 'prod-1',
        orgId: 'org-1',
        stockQty: 8,
      });
      prisma.productShipment.create.mockResolvedValue({ id: 'ship-1' });

      await service.createShipment('org-1', {
        productId: 'prod-1',
        direction: 'INBOUND',
        quantity: 50,
      });

      expect(prisma.product.update).not.toHaveBeenCalled();
    });
  });

  describe('updateShipmentStatus', () => {
    it('rejects transitions on an already-finalized shipment', async () => {
      prisma.productShipment.findUnique.mockResolvedValue({
        id: 'ship-1',
        orgId: 'org-1',
        status: 'COMPLETED',
      });

      await expect(
        service.updateShipmentStatus('org-1', 'ship-1', { status: 'CANCELED' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('increments stock when an INBOUND shipment completes', async () => {
      prisma.productShipment.findUnique.mockResolvedValue({
        id: 'ship-1',
        orgId: 'org-1',
        status: 'PENDING',
        direction: 'INBOUND',
        productId: 'prod-1',
        quantity: 50,
      });
      prisma.productShipment.update.mockResolvedValue({
        id: 'ship-1',
        status: 'COMPLETED',
      });

      await service.updateShipmentStatus('org-1', 'ship-1', {
        status: 'COMPLETED',
      });

      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: 'prod-1' },
        data: { stockQty: { increment: 50 } },
      });
    });

    it('releases reserved stock when an OUTBOUND shipment is canceled', async () => {
      prisma.productShipment.findUnique.mockResolvedValue({
        id: 'ship-1',
        orgId: 'org-1',
        status: 'PENDING',
        direction: 'OUTBOUND',
        productId: 'prod-1',
        quantity: 10,
      });
      prisma.productShipment.update.mockResolvedValue({
        id: 'ship-1',
        status: 'CANCELED',
      });

      await service.updateShipmentStatus('org-1', 'ship-1', {
        status: 'CANCELED',
      });

      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: 'prod-1' },
        data: { stockQty: { increment: 10 } },
      });
    });

    it('does not touch stock for a plain IN_TRANSIT transition', async () => {
      prisma.productShipment.findUnique.mockResolvedValue({
        id: 'ship-1',
        orgId: 'org-1',
        status: 'PENDING',
        direction: 'OUTBOUND',
        productId: 'prod-1',
        quantity: 10,
      });
      prisma.productShipment.update.mockResolvedValue({
        id: 'ship-1',
        status: 'IN_TRANSIT',
      });

      await service.updateShipmentStatus('org-1', 'ship-1', {
        status: 'IN_TRANSIT',
      });

      expect(prisma.product.update).not.toHaveBeenCalled();
    });
  });

  describe('summary', () => {
    it('aggregates category/product counts, stock totals, and pipeline quantities', async () => {
      prisma.category.count.mockResolvedValue(2);
      prisma.product.findMany.mockResolvedValue([
        { stockQty: 8, reorderPoint: 15 },
        { stockQty: 40, reorderPoint: 10 },
        { stockQty: 5, reorderPoint: 20 },
        { stockQty: 120, reorderPoint: 30 },
      ]);
      prisma.productShipment.aggregate
        .mockResolvedValueOnce({ _sum: { quantity: 50 } }) // inbound
        .mockResolvedValueOnce({ _sum: { quantity: 13 } }); // outbound

      const result = await service.summary('org-1');

      expect(result).toEqual({
        categoryCount: 2,
        productCount: 4,
        totalStockQty: 173,
        lowStockCount: 2,
        inboundPipelineQty: 50,
        outboundPipelineQty: 13,
      });
    });
  });
});
