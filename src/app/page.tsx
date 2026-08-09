import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

// This app (durby.tech) is the customer application only — the marketing
// site (extrahand.cc) is a separate deployment (see /marketing) and never
// assumes this root route renders a landing page. Signed-in visitors land
// on their dashboard; everyone else goes to /login.
export default async function RootPage() {
  const { userId } = await auth();
  redirect(userId ? "/dashboard" : "/login");
}
