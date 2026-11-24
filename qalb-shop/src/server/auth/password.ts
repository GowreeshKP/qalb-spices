import bcrypt from "bcryptjs";
import { bcryptCost } from "../env";

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, bcryptCost());
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

let dummyHash: Promise<string> | undefined;

/** Burn comparable CPU when the account does not exist, so login timing does not reveal valid emails. */
export async function burnPasswordCheck(plain: string): Promise<void> {
  dummyHash ??= hashPassword("not-a-real-password-0");
  await bcrypt.compare(plain, await dummyHash);
}
