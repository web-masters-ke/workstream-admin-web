import { Sidebar } from '@/components/layout/Sidebar';
import { Topbar } from '@/components/layout/Topbar';
import { ScrollResetter } from '@/components/layout/MainScrollArea';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar />
        <main className="content-scroll min-w-0 flex-1 overflow-y-auto p-6">
          <ScrollResetter />
          {children}
        </main>
      </div>
    </div>
  );
}
