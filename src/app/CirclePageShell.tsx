export function CirclePageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-[radial-gradient(ellipse_120%_80%_at_50%_-20%,rgba(56,189,248,0.14),transparent),linear-gradient(180deg,#fafafa_0%,#f4f4f5_45%,#e4e4e7_100%)] dark:bg-[radial-gradient(ellipse_120%_80%_at_50%_-20%,rgba(56,189,248,0.18),transparent),linear-gradient(180deg,#09090b_0%,#0c0c0f_40%,#09090b_100%)]">
      {children}
    </div>
  );
}
