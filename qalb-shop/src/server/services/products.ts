import type { Prisma, Product } from "@prisma/client";
import { db } from "../db";
import { Errors } from "../errors";
import { buildPageMeta, skipFor } from "@/lib/pagination";
import { slugify, uniqueSlug } from "@/lib/slug";
import type { ProductDTO, ProductListDTO } from "@/lib/types";
import type {
  CreateProductInput,
  ListProductsQuery,
  ProductCategory,
  ProductStatus,
  UpdateProductInput,
} from "@/lib/validators";

export function toProductDTO(p: Product): ProductDTO {
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    description: p.description,
    category: p.category as ProductCategory,
    flavour: p.flavour,
    packSize: p.packSize,
    priceCents: p.priceCents,
    stock: p.stock,
    status: p.status as ProductStatus,
    imageUrl: p.imageUrl,
    version: p.version,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

function orderBy(sort: ListProductsQuery["sort"]): Prisma.ProductOrderByWithRelationInput[] {
  switch (sort) {
    case "price_asc":
      return [{ priceCents: "asc" }, { id: "asc" }];
    case "price_desc":
      return [{ priceCents: "desc" }, { id: "asc" }];
    case "name":
      return [{ name: "asc" }, { id: "asc" }];
    default:
      return [{ createdAt: "desc" }, { id: "asc" }];
  }
}

/** Public callers only ever see ACTIVE products; admins may filter by any status. */
export async function listProducts(query: ListProductsQuery, opts: { isAdmin: boolean }): Promise<ProductListDTO> {
  const where: Prisma.ProductWhereInput = {
    ...(opts.isAdmin ? (query.status ? { status: query.status } : {}) : { status: "ACTIVE" }),
    ...(query.category ? { category: query.category } : {}),
    ...(query.q
      ? { OR: [{ name: { contains: query.q } }, { description: { contains: query.q } }, { flavour: { contains: query.q } }] }
      : {}),
  };
  const [total, rows] = await Promise.all([
    db.product.count({ where }),
    db.product.findMany({
      where,
      orderBy: orderBy(query.sort),
      skip: skipFor(query.page, query.pageSize),
      take: query.pageSize,
    }),
  ]);
  return { items: rows.map(toProductDTO), meta: buildPageMeta(query.page, query.pageSize, total) };
}

export async function getProductById(id: string, opts: { isAdmin: boolean }): Promise<ProductDTO> {
  const product = await db.product.findUnique({ where: { id } });
  if (!product || (!opts.isAdmin && product.status !== "ACTIVE")) throw Errors.notFound("Product");
  return toProductDTO(product);
}

export async function getProductBySlug(slug: string, opts: { isAdmin: boolean }): Promise<ProductDTO | null> {
  const product = await db.product.findUnique({ where: { slug } });
  if (!product || (!opts.isAdmin && product.status !== "ACTIVE")) return null;
  return toProductDTO(product);
}

export async function createProduct(input: CreateProductInput): Promise<ProductDTO> {
  const slug = await uniqueSlug(slugify(input.name), async (s) => (await db.product.findUnique({ where: { slug: s } })) !== null);
  const product = await db.product.create({
    data: {
      slug,
      name: input.name,
      description: input.description,
      category: input.category,
      flavour: input.flavour,
      packSize: input.packSize,
      priceCents: input.priceCents,
      stock: input.stock,
      status: input.status,
      imageUrl: input.imageUrl ?? null,
    },
  });
  return toProductDTO(product);
}

export async function updateProduct(id: string, input: UpdateProductInput): Promise<ProductDTO> {
  const { version, ...fields } = input;
  const data: Prisma.ProductUpdateManyMutationInput = {
    ...Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)),
    version: { increment: 1 },
  };
  // Compare-and-set on version so concurrent admin edits cannot silently overwrite each other.
  const result = await db.product.updateMany({
    where: { id, ...(version !== undefined ? { version } : {}) },
    data,
  });
  if (result.count === 0) {
    const exists = await db.product.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw Errors.notFound("Product");
    throw Errors.conflict("This product was changed by someone else. Reload and try again.", "VERSION_CONFLICT");
  }
  const updated = await db.product.findUniqueOrThrow({ where: { id } });
  return toProductDTO(updated);
}

export async function deleteProduct(id: string): Promise<void> {
  const product = await db.product.findUnique({ where: { id }, select: { id: true } });
  if (!product) throw Errors.notFound("Product");
  const ordered = await db.orderItem.count({ where: { productId: id } });
  if (ordered > 0) {
    throw Errors.conflict("This product appears in past orders. Archive it instead of deleting it.", "PRODUCT_HAS_ORDERS");
  }
  await db.product.delete({ where: { id } });
}
