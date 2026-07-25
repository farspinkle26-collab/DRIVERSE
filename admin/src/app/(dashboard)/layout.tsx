import { Nav } from "@/components/Nav";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Nav />
      <main className="flex-1 overflow-x-hidden px-6 py-6">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
