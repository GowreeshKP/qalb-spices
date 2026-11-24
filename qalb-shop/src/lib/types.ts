import type { OrderStatus, ProductCategory, ProductStatus, UserRole } from "./validators";
import type { PageMeta } from "./pagination";

export interface UserDTO {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

export interface ProductDTO {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: ProductCategory;
  flavour: string;
  packSize: string;
  priceCents: number;
  stock: number;
  status: ProductStatus;
  imageUrl: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProductListDTO {
  items: ProductDTO[];
  meta: PageMeta;
}

export interface CartItemDTO {
  id: string;
  productId: string;
  quantity: number;
  product: Pick<ProductDTO, "id" | "slug" | "name" | "priceCents" | "stock" | "imageUrl" | "status" | "packSize">;
}

export interface CartDTO {
  items: CartItemDTO[];
  itemCount: number;
  totalCents: number;
}

export interface OrderItemDTO {
  id: string;
  productId: string;
  name: string;
  unitPriceCents: number;
  quantity: number;
}

export interface OrderDTO {
  id: string;
  status: OrderStatus;
  totalCents: number;
  shippingName: string;
  shippingAddress: string;
  shippingCity: string;
  shippingPostal: string;
  createdAt: string;
  items: OrderItemDTO[];
  customer?: { id: string; name: string; email: string };
}

export interface OrderListDTO {
  items: OrderDTO[];
  meta: PageMeta;
}
