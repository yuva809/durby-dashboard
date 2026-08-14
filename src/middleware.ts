import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// This app is the Durby customer application only — the marketing site
// (extrahand.cc, including /privacy, /terms, /about, /products) is a
// separate deployment (see /marketing) and none of those routes exist
// here. "/" itself stays public because the root page.tsx does its own
// auth() check and redirect (to /dashboard or /login) — it isn't a
// landing page, so it doesn't need Clerk's protect-and-redirect either.
const isPublicRoute = createRouteMatcher([
  "/",
  "/login",
  "/sign-in(.*)",
  // Deliberately no "/sign-up" route — Durby is invitation-only.
  // Self-service account creation was removed (see the deleted
  // src/app/sign-up route); the only way to create an account is
  // /invite/:token's ticket-gated flow below, which is a completely
  // separate code path (useSignUp() + strategy:"ticket"), not this route.
  "/invite(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
