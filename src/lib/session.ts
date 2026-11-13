import "server-only";
import { cookies } from "next/headers";
import { db } from "./db";
import type { User } from "./types";

export async function currentUser(): Promise<User> {
  const jar = await cookies();
  const id = jar.get("uid")?.value;
  const users = db().users;
  return users.find((u) => u.id === id) ?? users[0];
}

/** Reviewer or administrator: sees the queue, analytics and management tools. */
export const canReview = (u: User | null) => !!u && (u.role === "reviewer" || u.role === "admin");
export const isAdmin = (u: User | null) => !!u && u.role === "admin";

export { canProcess } from "./db";
