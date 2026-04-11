import { Plus, ChevronLeft, ChevronRight, Thermometer, Droplets, Wind, CloudRain, Activity, Cloud, Compass, Clock, MapPin, Gauge } from 'lucide-react';

function getAqiLevel(aqi) {
  if (aqi <= 50) return { label: 'Good', color: '#10b981' };
  if (aqi <= 100) return { label: 'Moderate', color: '#f59e0b' };
  if (aqi <= 150) return { label: 'Unhealthy (SG)', color: '#f97316' };
  return { label: 'Unhealthy', color: '#f43f5e' };
}

export function getBatteryIcon(level) {
  if (level > 75) return '🔋';
  if (level > 35) return '🔋';
  if (level > 15) return '🪫';
  return '🪫';
}

export default function Sidebar({ nodes, selectedNode, onSelectNode, isOpen, onToggle, onAddNode, onEditNode }) {
  const handleContextMenu = (e, node) => {
    e.preventDefault();
    onEditNode(node);
  };

  return (
    <>
      <aside
        className={`h-full bg-[var(--bg-glass)] backdrop-blur-xl border-r border-[var(--border-subtle)] flex flex-col transition-all duration-350 ease-[cubic-bezier(0.4,0,0.2,1)] z-[500] overflow-hidden w-80 min-w-[320px] shadow-2xl`}
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

        <div className={`flex-1 overflow-y-auto p-2.5 flex flex-col gap-1.5 transition-opacity duration-200 ${!isOpen && 'opacity-0 pointer-events-none'}`} id="node-list">
          {nodes.map((node, i) => {
            const aqiInfo = getAqiLevel(node.aqi);
            const isSelected = selectedNode?.node_id === node.node_id;
            return (
              <button
                key={node.node_id}
                className={`flex flex-col gap-2 p-3.5 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-card)] cursor-pointer transition-all duration-250 ease-out text-left animate-[fadeInUp_0.4s_ease_both] w-full hover:bg-[var(--bg-card-hover)] hover:border-[var(--border-glow)] hover:shadow-[var(--shadow-glow-cyan)] hover:translate-x-0.75 ${isSelected ? 'bg-[var(--bg-card-hover)] border-[var(--accent-cyan)] shadow-[var(--shadow-glow-cyan),inset_0_0_0_1px_rgba(6,182,212,0.1)]' : ''
                  }`}
                id={`node-card-${node.node_id}`}
                onClick={() => onSelectNode(node)}
                onContextMenu={(e) => handleContextMenu(e, node)}
                title="Left-click to track, Right-click to edit configuration"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                {/* Header: ID & Battery */}
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[0.7rem] font-bold text-[var(--accent-cyan)] bg-[var(--accent-cyan-dim)] px-1.5 py-0.5 rounded border border-[var(--accent-cyan)]/20">{node.node_id}</span>
                  </div>
                  <span className="text-[0.7rem] font-bold text-[var(--text-muted)] flex items-center gap-1">
                    {getBatteryIcon(node.battery)} {node.battery}%
                  </span>
                </div>

                {/* Name & Location */}
                <div className="flex items-start justify-between gap-3 min-h-[1.5rem]">
                  <div className="text-[0.85rem] font-bold text-[var(--text-primary)] leading-tight tracking-tight max-w-[65%]">{node.name}</div>
                  <div className="flex items-center gap-1 mt-0.5 whitespace-nowrap">
                    <MapPin size={11} className="text-[var(--text-muted)]" />
                    <span className="font-mono text-[0.6rem] font-bold text-[var(--text-muted)] tracking-tighter uppercase">
                      {node.lat.toFixed(3)} {node.lon.toFixed(3)}
                    </span>
                  </div>
                </div>

                {/* Data Grid 1: Basic Telemetry */}
                <div className="grid grid-cols-3 gap-1 py-1 border-t border-[var(--border-subtle)]/50 mt-1">
                  <div className="flex flex-col items-center p-1 bg-[var(--bg-secondary)]/30 rounded">
                    <Thermometer size={12} className="text-rose-400 mb-0.5" />
                    <span className="font-mono text-[0.7rem] font-bold text-[var(--text-primary)]">{node.temperature.toFixed(1)}°</span>
                  </div>
                  <div className="flex flex-col items-center p-1 bg-[var(--bg-secondary)]/30 rounded">
                    <Droplets size={12} className="text-cyan-400 mb-0.5" />
                    <span className="font-mono text-[0.7rem] font-bold text-[var(--text-primary)]">{node.humidity}%</span>
                  </div>
                  <div className="flex flex-col items-center p-1 bg-[var(--bg-secondary)]/30 rounded">
                    <Gauge size={12} className="text-amber-400 mb-0.5" />
                    <span className="font-mono text-[0.7rem] font-bold text-[var(--text-primary)]">{Math.round(node.pressure)}</span>
                  </div>
                </div>

                {/* Data Grid 2: Environment */}
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <div className="flex items-center gap-2 p-1.5 bg-[var(--bg-secondary)]/30 rounded border border-[var(--border-subtle)]/30">
                    <Wind size={12} className="text-violet-400" />
                    <div className="flex flex-col">
                      <span className="text-[0.5rem] font-bold text-[var(--text-muted)] uppercase tracking-tighter leading-none">Wind</span>
                      <span className="font-mono text-[0.65rem] font-bold text-[var(--text-secondary)]">{node.wind_direction} {node.wind_intensity}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-1.5 bg-[var(--bg-secondary)]/30 rounded border border-[var(--border-subtle)]/30">
                    <Activity size={12} style={{ color: aqiInfo.color }} />
                    <div className="flex flex-col">
                      <span className="text-[0.5rem] font-bold text-[var(--text-muted)] uppercase tracking-tighter leading-none">AQI</span>
                      <span className="font-mono text-[0.65rem] font-bold" style={{ color: aqiInfo.color }}>{node.aqi} • {aqiInfo.label}</span>
                    </div>
                  </div>
                </div>

                {/* Data Grid 3: Condition & Rain */}
                <div className="flex items-center justify-between mt-1 p-1.5 bg-[var(--bg-secondary)]/30 rounded border border-[var(--border-subtle)]/30">
                   <div className="flex items-center gap-1 bg-[var(--bg-secondary)] px-2 py-0.5 rounded-full border border-[var(--border-subtle)]">
                     <Cloud size={10} className="text-slate-400" />
                     <span className="text-[0.6rem] font-bold text-[var(--text-secondary)] uppercase">{node.condition}</span>
                  </div>
                  <div className="flex items-center gap-1.5 pr-1">
                    <span className="text-[0.55rem] font-bold text-[var(--text-muted)] uppercase tracking-tighter">Rain:</span>
                    <span className={`text-[0.6rem] font-black uppercase ${node.rain_intensity !== 'none' ? 'text-blue-400' : 'text-slate-500'}`}>
                      {node.rain_intensity}
                    </span>
                  </div>
                </div>

                {/* Footer: Status & Time */}
                <div className="flex items-center justify-between mt-1 pt-1.5 border-t border-[var(--border-subtle)]/30">
                  <span className={`text-[0.6rem] font-black px-1.5 py-0.5 rounded flex items-center gap-1 uppercase tracking-tighter ${node.status === 'online' ? 'bg-[var(--accent-emerald-dim)] text-[var(--accent-emerald)]' : 'bg-[var(--accent-amber-dim)] text-[var(--accent-amber)]'
                    }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${node.status === 'online' ? 'bg-[var(--accent-emerald)] animate-pulse' : 'bg-[var(--accent-amber)]'}`} />
                    {node.status}
                  </span>
                  <span className="text-[0.6rem] font-bold text-[var(--text-muted)] flex items-center gap-1">
                    <Clock size={10} /> {node.last_updated}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* Sleek Toggle Button at the middle right edge */}
      <button
        onClick={onToggle}
        className="absolute top-1/2 left-full -translate-y-1/2 w-8 h-20 bg-[var(--bg-glass)] backdrop-blur-2xl border border-l-0 border-[var(--border-subtle)] rounded-r-2xl flex items-center justify-center cursor-pointer transition-all duration-500 hover:bg-[var(--bg-card-hover)] hover:text-[var(--accent-cyan)] z-[600] group shadow-[10px_0_30px_rgba(0,0,0,0.2)]"
        id="sidebar-edge-toggle"
        title={isOpen ? "Collapse Sidebar" : "Expand Sidebar"}
      >
        {/* Glow effect on hover */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent to-[var(--accent-cyan)]/10 opacity-0 group-hover:opacity-100 transition-opacity rounded-r-2xl" />

        <div className="relative flex items-center justify-center">
          {isOpen ? (
            <ChevronLeft size={20} className="group-hover:-translate-x-0.5 transition-transform duration-300" />
          ) : (
            <ChevronRight size={20} className="group-hover:translate-x-0.5 transition-transform duration-300" />
          )}
        </div>

        {/* Decorative notch effect */}
        <div className="absolute top-0 right-0 w-0.5 h-full bg-gradient-to-b from-transparent via-[var(--accent-cyan)]/20 to-transparent opacity-50" />
      </button>
    </>
  );
}
