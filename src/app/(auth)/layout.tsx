export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-4">
      <span className="text-xl font-semibold tracking-tight">Job Manager</span>
      {children}
    </main>
  );
}
