export function ConfigMissingBanner() {
  return (
    <div className="card-surface flex h-64 flex-col items-center justify-center gap-2 p-6 text-center">
      <p className="font-medium">This account isn&apos;t connected to a restaurant yet</p>
      <p className="max-w-sm text-sm text-muted-foreground">
        Something needs to be set up before this page can load. Please contact support so we can
        get your restaurant connected.
      </p>
    </div>
  );
}

export function LoadingBanner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="card-surface flex h-64 items-center justify-center p-6 text-muted-foreground">
      {label}
    </div>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="card-surface flex h-64 flex-col items-center justify-center gap-2 p-6 text-center">
      <p className="font-medium text-danger">Something went wrong</p>
      <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
