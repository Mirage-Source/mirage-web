import { redirect } from "next/navigation";
import { cookies } from "next/headers";

import { Mirage } from "@/components/Mirage";
import { SignIn } from "@/components/SignIn";
import { SESSION_COOKIE, isValid, passwordConfigured } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;

  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (await isValid(token)) redirect("/console");

  return (
    <Mirage>
      <SignIn configured={passwordConfigured()} reason={reason} />
    </Mirage>
  );
}
