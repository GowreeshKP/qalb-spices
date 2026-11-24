import { Errors } from "../errors";
import { tokenFromRequest, userFromToken, type PublicUser } from "./session";

export async function optionalUser(request: Request): Promise<PublicUser | null> {
  return userFromToken(tokenFromRequest(request));
}

export async function requireUser(request: Request): Promise<PublicUser> {
  const user = await optionalUser(request);
  if (!user) throw Errors.unauthenticated();
  return user;
}

export async function requireAdmin(request: Request): Promise<PublicUser> {
  const user = await requireUser(request);
  if (user.role !== "ADMIN") throw Errors.forbidden();
  return user;
}
