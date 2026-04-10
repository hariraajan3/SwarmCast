import { Plus } from 'lucide-react';

function getAqiLevel(aqi) {
  if (aqi <= 50) return { label: 'Good', color: '#10b981' };
  if (aqi <= 100) return { label: 'Moderate', color: '#f59e0b' };
  if (aqi <= 150) return { label: 'Unhealthy (SG)', color: '#f97316' };
  return { label: 'Unhealthy', color: '#f43f5e' };
}

function getBatteryIcon(level) {
  if (level > 75) return '🔋';
  if (level > 40) return '🔋';
  if (level > 15) return '🪫';
  return '🪫';
}

function getNodeTypeColor(type) {
  switch (type) {
    case 'gateway': return 'var(--accent-violet)';
    case 'relay': return 'var(--accent-amber)';
    default: return 'var(--accent-cyan)';
  }
}

export default function Sidebar({ nodes, selectedNode, onSelectNode, isOpen, onAddNode }) {
  return (
    <aside 
      className={`h-full bg-[var(--bg-glass)] backdrop-blur-xl border-r border-[var(--border-subtle)] flex flex-col transition-all duration-350 ease-[cubic-bezier(0.4,0,0.2,1)] z-[500] overflow-hidden ${
        isOpen ? 'w-80 min-w-[320px]' : 'w-0 min-w-0 border-r-0'
      }`} 
      id="sidebar"
    >
      <div className={`p-4 pb-3 border-b border-[var(--border-subtle)] flex items-center justify-between transition-opacity duration-200 ${!isOpen && 'opacity-0 pointer-events-none'}`}>
        <h2 className="flex items-center gap-2 text-[0.85rem] font-bold text-[var(--text-primary)] tracking-tight">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="5" r="3" />
            <line x1="12" y1="8" x2="12" y2="14" />
            <path d="M5 19a7 7 0 0 1 14 0" />
          </svg>
          Network Nodes
        </h2>
        
        <button 
          onClick={onAddNode}
          className="flex items-center justify-center w-7 h-7 rounded-lg bg-[var(--accent-cyan-dim)] text-[var(--accent-cyan)] border border-[var(--accent-cyan)]/20 hover:bg-[var(--accent-cyan)] hover:text-white transition-all shadow-sm"
          title="Add New Node Manually"
        >
          <Plus size={16} />
        </button>
      </div>

      <div className={`flex gap-3 px-4.5 py-2.5 border-b border-[var(--border-subtle)] transition-opacity duration-200 ${!isOpen && 'opacity-0 pointer-events-none'}`}>
        <div className="flex items-center gap-1.5 text-[0.65rem] text-[var(--text-muted)] font-medium">
          <span className="w-2 h-2 rounded-full" style={{ background: 'var(--accent-cyan)' }} />
          <span>Primary</span>
        </div>
        <div className="flex items-center gap-1.5 text-[0.65rem] text-[var(--text-muted)] font-medium">
          <span className="w-2 h-2 rounded-full" style={{ background: 'var(--accent-amber)' }} />
          <span>Relay</span>
        </div>
        <div className="flex items-center gap-1.5 text-[0.65rem] text-[var(--text-muted)] font-medium">
          <span className="w-2 h-2 rounded-full" style={{ background: 'var(--accent-violet)' }} />
          <span>Gateway</span>
        </div>
      </div>

      <div className={`flex-1 overflow-y-auto p-2.5 flex flex-col gap-1.5 transition-opacity duration-200 ${!isOpen && 'opacity-0 pointer-events-none'}`} id="node-list">
        {nodes.map((node, i) => {
          const aqiInfo = getAqiLevel(node.aqi);
          const isSelected = selectedNode?.node_id === node.node_id;
          return (
            <button
              key={node.node_id}
              className={`flex flex-col gap-1.5 p-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-card)] cursor-pointer transition-all duration-250 ease-out text-left animate-[fadeInUp_0.4s_ease_both] w-full hover:bg-[var(--bg-card-hover)] hover:border-[var(--border-glow)] hover:shadow-[var(--shadow-glow-cyan)] hover:translate-x-0.75 ${
                isSelected ? 'bg-[var(--bg-card-hover)] border-[var(--accent-cyan)] shadow-[var(--shadow-glow-cyan),inset_0_0_0_1px_rgba(6,182,212,0.1)]' : ''
              }`}
              id={`node-card-${node.node_id}`}
              onClick={() => onSelectNode(node)}
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-1.5">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: getNodeTypeColor(node.type) }}
                  />
                  <span className="font-mono text-[0.75rem] font-semibold text-[var(--text-secondary)]">{node.node_id}</span>
                </div>
                <span className="text-[0.7rem] font-medium text-[var(--text-muted)]">
                  {getBatteryIcon(node.battery)} {node.battery}%
                </span>
              </div>

              <div className="text-[0.8rem] font-semibold text-[var(--text-primary)] leading-tight">{node.name}</div>

              <div className="grid grid-cols-2 gap-x-2.5 gap-y-1">
                <div className="flex items-center gap-1">
                  <span className="text-[0.7rem]">🌡️</span>
                  <span className="font-mono text-[0.7rem] font-medium text-[var(--text-secondary)]">{node.temperature}°C</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[0.7rem]">💧</span>
                  <span className="font-mono text-[0.7rem] font-medium text-[var(--text-secondary)]">{node.humidity}%</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[0.7rem]">🌬️</span>
                  <span className="font-mono text-[0.7rem] font-medium text-[var(--text-secondary)]">{node.pressure} hPa</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[0.7rem]" style={{ color: aqiInfo.color }}>◉</span>
                  <span className="font-mono text-[0.7rem] font-medium" style={{ color: aqiInfo.color }}>
                    AQI {node.aqi}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap gap-1 mt-0.5">
                {node.rain_intensity !== 'none' && (
                  <span className="text-[0.6rem] font-semibold px-2 py-0.5 rounded-lg bg-blue-500/15 text-blue-400 capitalize">
                    🌧️ {node.rain_intensity}
                  </span>
                )}
                {node.wind_intensity !== 'calm' && (
                  <span className="text-[0.6rem] font-semibold px-2 py-0.5 rounded-lg bg-violet-500/15 text-violet-400 capitalize">
                    💨 {node.wind_intensity}
                  </span>
                )}
                <span className={`text-[0.58rem] font-semibold px-2 py-0.5 rounded-lg capitalize ${
                  node.status === 'online' ? 'bg-[var(--accent-emerald-dim)] text-[var(--accent-emerald)]' : 'bg-[var(--accent-amber-dim)] text-[var(--accent-amber)]'
                }`}>
                  {node.status === 'online' ? '● Online' : '⚠ Low Battery'}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
