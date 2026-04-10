import { useState, useEffect } from 'react';
import { Sun, Moon, MessageSquareText } from 'lucide-react';

export default function Header({ 
  stats, 
  onToggleSidebar, 
  sidebarOpen, 
  onToggleAIChat, 
  aiChatOpen,
  theme,
  onToggleTheme
}) {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header 
      className="flex items-center justify-between px-6 h-[64px] bg-[var(--bg-header)] backdrop-blur-md border-b border-[var(--border-subtle)] z-[1000] shrink-0 transition-all duration-300" 
      id="main-header"
    >
      <div className="flex items-center gap-3">
        {/* <button
          className="flex items-center justify-center w-9 h-9 border border-[var(--border-subtle)] rounded-[var(--radius-sm)] bg-transparent text-[var(--text-secondary)] cursor-pointer transition-all duration-200 hover:bg-[var(--accent-cyan-dim)] hover:text-[var(--accent-cyan)] hover:border-[var(--border-glow)]"
          id="sidebar-toggle"
          onClick={onToggleSidebar}
          aria-label="Toggle sidebar"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {sidebarOpen ? (
              <path d="M18 6L6 18M6 6l12 12" />
            ) : (
              <>
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </>
            )}
          </svg>
        </button> */}
        <div className="flex items-center  gap-2.5">
          <div className="flex items-center animate-[breathe_4s_ease-in-out_infinite]">
            <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
              <circle cx="16" cy="16" r="14" stroke="url(#logoGrad)" strokeWidth="2.5" />
              <circle cx="10" cy="13" r="2.5" fill="#06b6d4" />
              <circle cx="22" cy="13" r="2.5" fill="#10b981" />
              <circle cx="16" cy="22" r="2.5" fill="#f59e0b" />
              <line x1="10" y1="13" x2="22" y2="13" stroke="#06b6d4" strokeWidth="1" opacity="0.5" />
              <line x1="10" y1="13" x2="16" y2="22" stroke="#f59e0b" strokeWidth="1" opacity="0.5" />
              <line x1="22" y1="13" x2="16" y2="22" stroke="#10b981" strokeWidth="1" opacity="0.5" />
              <defs>
                <linearGradient id="logoGrad" x1="0" y1="0" x2="32" y2="32">
                  <stop offset="0%" stopColor="#06b6d4" />
                  <stop offset="100%" stopColor="#10b981" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <div className="flex flex-col gap-0">
            <h1 className="text-[1.1rem] font-extrabold tracking-tight bg-gradient-to-br from-[#06b6d4] to-[#10b981] bg-clip-text text-transparent leading-tight">SwarmCast</h1>
            <span className="text-[0.65rem] font-medium text-[var(--text-muted)] tracking-[0.08em] uppercase">Mesh Weather Intelligence</span>
          </div>
        </div>
      </div>

      {/* <div className="flex items-center">
        {stats && (
          <div className="flex items-center gap-4 px-4 py-1 bg-[#0f172a]/50 border border-[var(--border-subtle)] rounded-[var(--radius-lg)]">
            <div className="flex flex-col items-center gap-[1px]" id="stat-nodes">
              <span className="text-base font-bold font-mono text-[var(--text-primary)]">{stats.total_nodes || '—'}</span>
              <span className="text-[0.6rem] font-medium text-[var(--text-muted)] uppercase tracking-[0.05em]">Nodes</span>
            </div>
            <div className="w-px h-7 bg-[var(--border-subtle)]" />
            <div className="flex flex-col items-center gap-[1px]" id="stat-online">
              <span className="text-base font-bold font-mono text-[var(--accent-emerald)]">{stats.online_nodes || '—'}</span>
              <span className="text-[0.6rem] font-medium text-[var(--text-muted)] uppercase tracking-[0.05em]">Online</span>
            </div>
            <div className="w-px h-7 bg-[var(--border-subtle)]" />
            <div className="flex flex-col items-center gap-[1px]" id="stat-health">
              <span className={`text-[0.65rem] font-semibold px-2 py-0.5 rounded-[20px] capitalize ${stats.network_health === 'excellent' ? 'bg-[var(--accent-emerald-dim)] text-[var(--accent-emerald)]' : 'bg-[var(--accent-amber-dim)] text-[var(--accent-amber)]'}`}>
                {stats.network_health || '—'}
              </span>
              <span className="text-[0.6rem] font-medium text-[var(--text-muted)] uppercase tracking-[0.05em]">Network</span>
            </div>
          </div>
        )}
      </div> */}

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 mr-2">
          <button
            onClick={onToggleTheme}
            className="p-1.5 rounded-lg border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-card)] transition-colors cursor-pointer"
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>

        <div className="flex items-center gap-1.5 font-mono text-[0.8rem] font-medium text-[var(--text-secondary)] border-l border-[var(--border-subtle)] pl-4" id="live-clock">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12,6 12,12 16,14" />
          </svg>
          <span>{currentTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        <div className="relative flex items-center justify-center min-w-[85px] h-[30px] border border-[var(--accent-emerald-dim)] rounded-full bg-[var(--accent-emerald-dim)]" id="live-indicator">
          <span className="absolute left-2.5 w-1.5 h-1.5 rounded-full bg-[var(--accent-emerald)] animate-pulse shadow-[0_0_5px_var(--accent-emerald)]" />
          <span className="text-[0.7rem] font-bold text-[var(--accent-emerald)] tracking-[0.12em] leading-none select-none">LIVE</span>
        </div>
      </div>
    </header>
  );
}
