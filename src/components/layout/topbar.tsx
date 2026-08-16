import { UserButton } from "@clerk/nextjs";
import { Settings } from "lucide-react";

export function Topbar({ title }: { title: string }) {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-border px-6">
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      <div className="flex items-center gap-4">
        {/* Profile lives here, behind the avatar — not a sidebar item. Clerk's
            own menu already covers "My Profile"/"Account"/"Logout"; this adds
            the one thing it doesn't: a link into the app's own Settings page. */}
        <UserButton afterSignOutUrl="/">
          <UserButton.MenuItems>
            <UserButton.Link label="Settings" labelIcon={<Settings className="h-4 w-4" />} href="/dashboard/settings" />
          </UserButton.MenuItems>
        </UserButton>
      </div>
    </header>
  );
}
