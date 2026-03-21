import { useLocation } from 'wouter';
import { cn } from '@/lib/utils';
import { useTheme } from '@/lib/useTheme';
import {
  LayoutGrid,
  MessageSquareMore,
  Bot,
  Wrench,
  Layers,
  ShieldCheck,
  GitCommitHorizontal,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const NAV_ITEMS: { path: string; label: string; icon: LucideIcon }[] = [
  { path: '/', label: 'Overview', icon: LayoutGrid },
  { path: '/sessions', label: 'Sessions', icon: MessageSquareMore },
  { path: '/agents', label: 'Agents', icon: Bot },
  { path: '/tools', label: 'Tools', icon: Wrench },
  { path: '/models', label: 'Models', icon: Layers },
  { path: '/quality', label: 'Quality', icon: ShieldCheck },
  { path: '/commits', label: 'Commits', icon: GitCommitHorizontal },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const { theme, toggle } = useTheme();

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 bg-surface border-r border-border flex flex-col">
        <div className="py-4 border-b border-border flex justify-center">
          <img src="/logo.png" alt="LoopLens" className="h-20 max-w-full px-2" />
        </div>
        <nav className="flex-1 py-2">
          {NAV_ITEMS.map((item) => {
            const active = item.path === '/'
              ? location === '/'
              : location.startsWith(item.path);
            return (
              <button
                key={item.path}
                onClick={() => setLocation(item.path)}
                className={cn(
                  'w-full flex items-center gap-2.5 px-4 py-2 text-sm transition-colors',
                  active
                    ? 'bg-accent/10 text-accent border-r-2 border-accent'
                    : 'text-text2 hover:text-text hover:bg-surface2'
                )}
              >
                <item.icon className="w-4 h-4 opacity-70 flex-shrink-0" />
                {item.label}
              </button>
            );
          })}
        </nav>
        <div className="p-3 border-t border-border space-y-2">
          <div className="flex items-center justify-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green animate-pulse" />
            <span className="text-[10px] text-text2">Listening on :4244</span>
          </div>
          <button
            onClick={toggle}
            className="w-full flex items-center justify-center gap-2 px-2 py-1.5 rounded text-[11px] text-text2 hover:text-text hover:bg-surface2 transition-colors"
          >
            <span className="text-sm">{theme === 'dark' ? '☀' : '☾'}</span>
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto bg-bg">
        <div className="max-w-[1200px] mx-auto p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
