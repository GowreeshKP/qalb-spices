import { z } from "zod";

/** Strip control characters (except newline/tab) and trim. Defence in depth: React also escapes output. */
export function cleanText(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
}

const text = (min: number, max: number, label: string) =>
  z
    .string({ required_error: `${label} is required`, invalid_type_error: `${label} must be text` })
    .transform(cleanText)
    .pipe(
      z
        .string()
        .min(min, min === 1 ? `${label} is required` : `${label} must be at least ${min} characters`)
        .max(max, `${label} must be at most ${max} characters`),
    );

export const emailSchema = z
  .string({ required_error: "Email is required", invalid_type_error: "Email must be text" })
  .transform((v) => v.trim().toLowerCase())
  .pipe(z.string().email("Enter a valid email address").max(254, "Email is too long"));

export const passwordSchema = z
  .string({ required_error: "Password is required", invalid_type_error: "Password must be text" })
  .min(10, "Password must be at least 10 characters")
  .max(128, "Password must be at most 128 characters")
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), "Password must contain a letter and a number");

export const USER_ROLES = ["USER", "ADMIN"] as const;
export const PRODUCT_STATUSES = ["ACTIVE", "ARCHIVED"] as const;
export const ORDER_STATUSES = ["PLACED", "SHIPPED", "DELIVERED", "CANCELLED"] as const;
export const PRODUCT_CATEGORIES = ["whole", "ground", "blend"] as const;
export const PRODUCT_SORTS = ["newest", "price_asc", "price_desc", "name"] as const;

export type UserRole = (typeof USER_ROLES)[number];
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];
export type ProductSort = (typeof PRODUCT_SORTS)[number];

/* ---------- Auth & profile ---------- */

export const signupSchema = z.object({
  name: text(2, 80, "Name"),
  email: emailSchema,
  password: passwordSchema,
});
export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string({ required_error: "Password is required" }).min(1, "Password is required").max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({ email: emailSchema });
export const resetPasswordSchema = z.object({
  token: z.string().min(20, "Reset token is invalid").max(200, "Reset token is invalid"),
  password: passwordSchema,
});

export const updateProfileSchema = z
  .object({ name: text(2, 80, "Name").optional(), email: emailSchema.optional() })
  .refine((v) => v.name !== undefined || v.email !== undefined, "Provide a name or email to update");

export const changePasswordSchema = z.object({
  currentPassword: z.string({ required_error: "Current password is required" }).min(1, "Current password is required").max(128),
  newPassword: passwordSchema,
});

/* ---------- Products ---------- */

/** Only same-origin image paths are allowed: blocks javascript:/data: URLs and remote tracking pixels. */
export const imageUrlSchema = z
  .string()
  .max(200)
  .regex(
    /^(\/images\/[A-Za-z0-9._-]+|\/api\/uploads\/[a-f0-9-]{36}\.(png|jpg|webp))$/,
    "Image must be an uploaded file or a bundled image",
  );

const productFields = {
  name: text(2, 120, "Name"),
  description: text(10, 2000, "Description"),
  category: z.enum(PRODUCT_CATEGORIES, { errorMap: () => ({ message: "Choose a valid category" }) }),
  flavour: text(0, 160, "Flavour notes").default(""),
  packSize: text(0, 40, "Pack size").default(""),
  priceCents: z
    .number({ required_error: "Price is required", invalid_type_error: "Price must be a number" })
    .int("Price must be a whole number of cents")
    .min(1, "Price must be greater than zero")
    .max(10_000_000, "Price is too high"),
  stock: z
    .number({ required_error: "Stock is required", invalid_type_error: "Stock must be a number" })
    .int("Stock must be a whole number")
    .min(0, "Stock cannot be negative")
    .max(100_000, "Stock is too high"),
  status: z.enum(PRODUCT_STATUSES).default("ACTIVE"),
  imageUrl: imageUrlSchema.nullable().optional(),
};

export const createProductSchema = z.object(productFields);
export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = z
  .object({
    name: productFields.name.optional(),
    description: productFields.description.optional(),
    category: productFields.category.optional(),
    flavour: text(0, 160, "Flavour notes").optional(),
    packSize: text(0, 40, "Pack size").optional(),
    priceCents: productFields.priceCents.optional(),
    stock: productFields.stock.optional(),
    status: z.enum(PRODUCT_STATUSES).optional(),
    imageUrl: imageUrlSchema.nullable().optional(),
    /** Optimistic concurrency: reject the update if someone else changed the product meanwhile. */
    version: z.number().int().min(1).optional(),
  })
  .refine((v) => Object.keys(v).some((k) => k !== "version"), "Provide at least one field to update");
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

const intParam = (def: number, min: number, max: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? def : Number(v)))
    .pipe(z.number().int("Must be a whole number").min(min).max(max));

/** HTML forms submit "" for an unselected "All" option; treat it as "not provided". */
const emptyToUndefined = (value: unknown): unknown => (value === "" ? undefined : value);

export const listProductsQuerySchema = z.object({
  q: z
    .string()
    .optional()
    .transform((v) => (v ? cleanText(v).slice(0, 80) : undefined)),
  category: z.preprocess(emptyToUndefined, z.enum(PRODUCT_CATEGORIES).optional()),
  status: z.preprocess(emptyToUndefined, z.enum(PRODUCT_STATUSES).optional()),
  sort: z.preprocess(emptyToUndefined, z.enum(PRODUCT_SORTS).default("newest")),
  page: intParam(1, 1, 10_000),
  pageSize: intParam(12, 1, 50),
});
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;

/* ---------- Cart & orders ---------- */

export const MAX_CART_QUANTITY = 20;

export const cartAddSchema = z.object({
  productId: z.string().min(1, "Product is required").max(40),
  quantity: z.number().int("Quantity must be a whole number").min(1, "Quantity must be at least 1").max(MAX_CART_QUANTITY, `Maximum ${MAX_CART_QUANTITY} per item`),
});
export const cartUpdateSchema = z.object({
  quantity: z.number().int("Quantity must be a whole number").min(1, "Quantity must be at least 1").max(MAX_CART_QUANTITY, `Maximum ${MAX_CART_QUANTITY} per item`),
});

export const checkoutSchema = z.object({
  shippingName: text(2, 80, "Full name"),
  shippingAddress: text(5, 200, "Address"),
  shippingCity: text(2, 80, "City"),
  shippingPostal: text(3, 12, "Postal code"),
  idempotencyKey: z
    .string({ required_error: "Idempotency key is required" })
    .min(8, "Idempotency key is invalid")
    .max(100, "Idempotency key is invalid")
    .regex(/^[A-Za-z0-9_-]+$/, "Idempotency key is invalid"),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;

export const updateOrderSchema = z.object({
  status: z.enum(ORDER_STATUSES),
});

export const listOrdersQuerySchema = z.object({
  scope: z.enum(["mine", "all"]).default("mine"),
  status: z.preprocess(emptyToUndefined, z.enum(ORDER_STATUSES).optional()),
  page: intParam(1, 1, 10_000),
  pageSize: intParam(10, 1, 50),
});
