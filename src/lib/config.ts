// This is the dashboard SaaS application (dashboard.durby.tech in
// production) — it owns all auth and never assumes the product site
// (durby.tech) or the company site (extrahand.cc) live on the same
// origin. DURBY_URL/EXTRAHAND_URL are only used for occasional outbound
// links (e.g. the sidebar's "Powered by ExtraHand"), never functionally.
export const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
export const DURBY_URL = (process.env.NEXT_PUBLIC_DURBY_URL ?? "http://localhost:3002").replace(/\/$/, "");
export const EXTRAHAND_URL = (process.env.NEXT_PUBLIC_EXTRAHAND_URL ?? "http://localhost:3003").replace(/\/$/, "");
export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/$/, "");
