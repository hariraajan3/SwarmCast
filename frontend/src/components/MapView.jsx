import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect } from 'react';
import { Plus, Minus, RefreshCw, Bot, Thermometer, Droplets, Wind, CloudRain, Activity, Cloud } from 'lucide-react';
import { getBatteryIcon } from './Sidebar';

// Fix for default marker icons in Leaflet with React
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

// Custom icons for different node types
const createNodeIcon = (color) => {
  return new L.DivIcon({
    className: 'custom-div-icon',
    html: `<div style="background-color: ${color}; width: 12px; height: 12px; border-radius: 50%; border: 2px solid #fff; box-shadow: 0 0 10px rgba(0,0,0,0.5);"></div>`,
    iconSize: [12, 12],
    iconAnchor: [6, 6]
  });
};


const primaryIcon = createNodeIcon('#06b6d4'); // cyan

const getIcon =() => {
  return primaryIcon;
};

// Component to handle map centering and resizing
// Helper to determine wind intensity level
const getWindInfo = (speed) => {
  const s = parseInt(speed) || 0;
  if (s > 15) return { bars: 3, color: 'var(--accent-rose)', emoji: '🌪️' };
  if (s > 8) return { bars: 2, color: 'var(--accent-amber)', emoji: '🍃' };
  return { bars: 1, color: 'var(--accent-emerald)', emoji: '🎐' };
};

// Helper to determine rain intensity level
const getRainInfo = (intensity) => {
  if (!intensity) return { bars: 0, color: 'var(--text-muted)', emoji: '☀️' };
  switch (intensity.toLowerCase()) {
    case 'heavy': return { bars: 3, color: 'var(--accent-rose)', emoji: '⛈️' };
    case 'mid':
    case 'moderate': return { bars: 2, color: 'var(--accent-amber)', emoji: '🌧️' };
    case 'low':
    case 'light': return { bars: 1, color: 'var(--accent-cyan)', emoji: '🌦️' };
    default: return { bars: 0, color: 'var(--text-muted)', emoji: '☀️' };
  }
};

const IntensityBars = ({ count, activeColor }) => (
  <div className="flex gap-0.5 mt-0.5">
    {[1, 2, 3].map(i => (
      <div
        key={i}
        className={`h-1 w-3 rounded-full transition-colors ${i <= count ? '' : 'bg-slate-700/30'}`}
        style={{ backgroundColor: i <= count ? activeColor : undefined }}
      />
    ))}
  </div>
);

function MapController({ node }) {
  const map = useMap();

  useEffect(() => {
    if (node) {
      map.setView([node.lat, node.lon], 16, { animate: true });
    }
  }, [node, map]);

  // Invalidate size when the map dimension might have changed (e.g., panel toggle)
  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 300); // Match transition duration
    return () => clearTimeout(timer);
  }, [map]);

  return null;
}

// Custom Zoom Controls Component
function ZoomControls() {
  const map = useMap();

  const handleZoomIn = (e) => {
    e.stopPropagation();
    e.preventDefault();
    map.zoomIn();
  };

  const handleZoomOut = (e) => {
    e.stopPropagation();
    e.preventDefault();
    map.zoomOut();
  };

  return (
    <div className="flex flex-col gap-2" onDoubleClick={(e) => e.stopPropagation()}>
      <button
        onClick={handleZoomIn}
        className="w-10 h-10 bg-[var(--bg-card)] backdrop-blur-md border border-[var(--border-subtle)] rounded-lg text-[var(--text-primary)] flex items-center justify-center hover:bg-[var(--accent-cyan)] hover:text-white transition-all shadow-lg cursor-pointer active:scale-95 z-[1001]"
        title="Zoom In"
      >
        <Plus size={20} />
      </button>
      <button
        onClick={handleZoomOut}
        className="w-10 h-10 bg-[var(--bg-card)] backdrop-blur-md border border-[var(--border-subtle)] rounded-lg text-[var(--text-primary)] flex items-center justify-center hover:bg-[var(--accent-cyan)] hover:text-white transition-all shadow-lg cursor-pointer active:scale-95 z-[1001]"
        title="Zoom Out"
      >
        <Minus size={20} />
      </button>
    </div>
  );
}

export default function MapView({ nodes, meshEdges, selectedNode, onSelectNode, networks, activeNetwork, onSelectNetwork, aiChatOpen, onToggleAIChat, theme }) {
  const center = [12.9716, 77.5946]; // Bangalore center

  return (
    <div className="relative w-full h-full bg-[var(--bg-primary)] overflow-hidden" id="map-container">
      <MapContainer
        center={center}
        zoom={13}
        scrollWheelZoom={true}
        className={`w-full h-full !bg-[var(--bg-primary)] transition-all duration-700 ${theme === 'dark' ? 'grayscale-[0.4] contrast-[1.1] brightness-110' : ''
          }`}
        zoomControl={false}
        attributionControl={false}
      >
        <TileLayer
          url={theme === 'dark'
            ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            : "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          }
        />

        {/* Render Mesh Connections */}
        {meshEdges.map((edge, idx) => (
          <Polyline
            key={`edge-${idx}`}
            positions={[
              [edge.from_lat, edge.from_lon],
              [edge.to_lat, edge.to_lon]
            ]}
            pathOptions={{
              color: '#06b6d4',
              weight: 2,
              opacity: 0.4,
              dashArray: '5, 10'
            }}
          />
        ))}

        {/* Render Nodes */}
        {nodes.map((node) => {
          const wind = getWindInfo(node.wind_intensity);
          const rain = getRainInfo(node.rain_intensity);

          return (
            <Marker
              key={node.node_id}
              position={[node.lat, node.lon]}
              icon={getIcon(node.type)}
              eventHandlers={{
                click: () => onSelectNode(node),
                mouseover: (e) => {
                  e.target.openPopup();
                }
              }}
            >
              <Popup className="custom-popup" offset={[0, -10]}>
                <div className="min-w-[220px] bg-[#111827] rounded-2xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.6)] border border-[#374151] p-0">
                  {/* HUD Header */}
                  <div className="bg-gradient-to-r from-[#1f2937] via-[#1f2937]/50 to-transparent p-3.5 pb-2.5 border-b border-[#374151]">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-bold text-white leading-tight">{node.node_id}</h3>
                      <div className={`p-1.5 rounded-full border flex items-center justify-center ${node.status === 'online'
                          ? 'bg-emerald-500/10 border-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.3)]'
                          : 'bg-rose-500/10 border-rose-500/30 shadow-[0_0_10px_rgba(244,63,94,0.3)]'
                        }`}>
                        <span className={`w-2 h-2 rounded-full animate-blink ${node.status === 'online' ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]' : 'bg-rose-500 shadow-[0_0_8px_#f43f5e]'
                          }`} />
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="font-mono text-[0.6rem] text-slate-400 font-bold">{node.name}</p>
                    </div>
                  </div>

                  {/* HUD Grid */}
                  <div className="p-4 grid grid-cols-2 gap-x-5 gap-y-4">
                    <div className="flex items-start gap-2">
                      <div className="mt-1 text-rose-400"><Thermometer size={14} /></div>
                      <div className="flex flex-col">
                        <span className="text-[0.55rem] font-bold text-slate-500 uppercase tracking-widest leading-none mb-1">Temp</span>
                        <span className="text-sm font-mono font-black text-white">{node.temperature.toFixed(1)}°</span>
                      </div>
                    </div>

                    <div className="flex items-start gap-2">
                      <div className="mt-1 text-cyan-400"><Droplets size={14} /></div>
                      <div className="flex flex-col">
                        <span className="text-[0.55rem] font-bold text-slate-500 uppercase tracking-widest leading-none mb-1">Humid</span>
                        <span className="text-sm font-mono font-black text-white">{node.humidity}%</span>
                      </div>
                    </div>

                    <div className="flex items-start gap-2">
                      <div className="mt-1" style={{ color: wind.color }}><Wind size={14} /></div>
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <span className="text-[0.55rem] font-bold text-slate-500 uppercase tracking-widest leading-none">Wind</span>
                          <span className="text-xs">{wind.emoji}</span>
                        </div>
                        <IntensityBars count={wind.bars} activeColor={wind.color} />
                        <span className="text-[0.6rem] font-mono font-bold text-slate-400 mt-1">{node.wind_direction} {node.wind_intensity}</span>
                      </div>
                    </div>

                    <div className="flex items-start gap-2">
                      <div className="mt-1" style={{ color: rain.color }}><CloudRain size={14} /></div>
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <span className="text-[0.55rem] font-bold text-slate-500 uppercase tracking-widest leading-none">Rain</span>
                          <span className="text-xs">{rain.emoji}</span>
                        </div>
                        <IntensityBars count={rain.bars} activeColor={rain.color} />
                        <span className="text-[0.6rem] font-mono font-bold text-slate-400 mt-1">{rain.bars > 0 ? 'Active' : 'Dry'}</span>
                      </div>
                    </div>

                    <div className="flex items-start gap-2">
                      <div className="mt-1 text-amber-400"><Activity size={14} /></div>
                      <div className="flex flex-col">
                        <span className="text-[0.55rem] font-bold text-slate-500 uppercase tracking-widest leading-none mb-1">AQI</span>
                        <span className={`text-[0.8rem] font-black ${node.aqi > 100 ? 'text-rose-400' : 'text-emerald-400'}`}>{node.aqi}</span>
                      </div>
                    </div>

                    <div className="flex items-start gap-2">
                      <div className="mt-1 text-violet-400"><Cloud size={14} /></div>
                      <div className="flex flex-col">
                        <span className="text-[0.55rem] font-bold text-slate-500 uppercase tracking-widest leading-none mb-1">Climate</span>
                        <span className="text-[0.7rem] font-bold text-white">{node.condition}</span>
                      </div>
                    </div>
                  </div>

                  {/* HUD Footer */}
                  <div className="bg-[#1f2937]/50 px-4 py-2 flex items-center justify-between border-t border-[#374151]">
                    <div className="flex items-center gap-2">
                      <span className="text-[0.65rem] font-black text-slate-400 uppercase tracking-wider">{node.battery}%  {getBatteryIcon(node.battery)}</span>
                    </div>
                    <div className="flex items-center gap-1 text-[0.6rem] font-black text-slate-500">
                      <RefreshCw size={9} className="animate-spin-slow opacity-40" />
                      {node.last_updated}
                    </div>
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}

        <MapController node={selectedNode} />

        {/* ZoomControls must be inside MapContainer to access useMap() context */}
        <div className="leaflet-bottom leaflet-right !mb-8 !mr-6 pointer-events-auto flex flex-col gap-2">
          <ZoomControls />
        </div>
      </MapContainer>

      {/* Map Overlay UI */}
      <div className="absolute top-3 right-6 z-[1000] flex flex-col gap-4 items-end pointer-events-none">
        <button
          onClick={onToggleAIChat}
          className={`group relative w-16 h-16 rounded-full flex items-center justify-center transition-all duration-500 shadow-[0_0_40px_rgba(0,0,0,0.5)] overflow-hidden pointer-events-auto cursor-pointer ${aiChatOpen
              ? 'bg-[var(--accent-cyan)] text-white scale-110 shadow-[var(--shadow-glow-cyan)]'
              : 'bg-[var(--bg-card)] text-[var(--accent-cyan)] border-2 border-[var(--border-subtle)] hover:border-[var(--accent-cyan)] hover:scale-105 active:scale-95'
            }`}
          title="AI Assistant"
        >
          {/* Background Glow Effect */}
          <div className={`absolute inset-0 bg-gradient-to-tr from-transparent via-white/20 to-transparent transition-opacity duration-300 ${aiChatOpen ? 'opacity-100' : 'opacity-0'}`} />

          <div className={`relative z-10 ${!aiChatOpen && 'animate-[breathe_3s_ease-in-out_infinite]'}`}>
            <Bot size={36} strokeWidth={1.5} />
            {/* {!aiChatOpen && (
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-rose-500 rounded-full border-2 border-[var(--bg-card)] shadow-lg animate-pulse" />
            )} */}
          </div>

          {/* Tooltip on hover */}
          <div className="absolute right-20 px-3 py-1.5 bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-xl text-[0.7rem] font-bold text-[var(--accent-cyan)] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none uppercase tracking-widest shadow-2xl">
            Assistant
          </div>
        </button>
      </div>

      {/* Map Overlay UI: Network Selector */}
      {/* <div className="absolute top-24 right-6 z-[1000] flex flex-col gap-3 items-end pointer-events-none">
        {networks && (
          <div className="bg-[var(--bg-card)] backdrop-blur-md border border-[var(--border-subtle)] rounded-xl p-2.5 flex flex-col gap-1.5 shadow-2xl pointer-events-auto min-w-[160px] animate-[fadeInUp_0.4s_ease_both]">
            <div className="flex items-center gap-2 px-2 pb-1.5 border-b border-[var(--border-subtle)] mb-1">
              <Layers size={14} className="text-[var(--accent-cyan)]" />
              <span className="text-[0.65rem] font-bold text-[var(--text-primary)] uppercase tracking-wider">Mesh Domains</span>
            </div>
            <div className="flex flex-col gap-1">
              {networks.map(net => (
                <button
                  key={net.id}
                  onClick={() => onSelectNetwork(net.id)}
                  className={`px-3 py-2 rounded-lg text-[0.7rem] font-bold transition-all flex items-center justify-between gap-4 group ${
                    activeNetwork === net.id 
                      ? 'bg-[var(--accent-cyan-dim)] text-[var(--accent-cyan)] shadow-[inset_0_0_0_1px_rgba(6,182,212,0.2)]' 
                      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <span>{net.name}</span>
                  <span className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${activeNetwork === net.id ? 'bg-[var(--accent-cyan)] scale-110 shadow-[0_0_8px_var(--accent-cyan)]' : 'bg-slate-600 group-hover:bg-slate-400'}`} />
                </button>
              ))}
            </div>
          </div>
        )}
      </div> */}

    </div>
  );
}
