import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect } from 'react';
import { Plus, Minus, RefreshCw, Layers, Bot } from 'lucide-react';

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

const gatewayIcon = createNodeIcon('#8b5cf6'); // violet
const relayIcon = createNodeIcon('#f59e0b'); // amber
const primaryIcon = createNodeIcon('#06b6d4'); // cyan

const getIcon = (type) => {
  if (type === 'gateway') return gatewayIcon;
  if (type === 'relay') return relayIcon;
  return primaryIcon;
};

// Component to handle map centering and resizing
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
  return (
    <div className="flex flex-col gap-2">
      <button 
        onClick={(e) => { e.stopPropagation(); map.zoomIn(); }}
        className="w-10 h-10 bg-[var(--bg-card)] backdrop-blur-md border border-[var(--border-subtle)] rounded-lg text-[var(--text-primary)] flex items-center justify-center hover:bg-[var(--accent-cyan)] hover:text-white transition-all shadow-lg cursor-pointer active:scale-95"
        title="Zoom In"
      >
        <Plus size={20} />
      </button>
      <button 
        onClick={(e) => { e.stopPropagation(); map.zoomOut(); }}
        className="w-10 h-10 bg-[var(--bg-card)] backdrop-blur-md border border-[var(--border-subtle)] rounded-lg text-[var(--text-primary)] flex items-center justify-center hover:bg-[var(--accent-cyan)] hover:text-white transition-all shadow-lg cursor-pointer active:scale-95"
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
        className={`w-full h-full !bg-[var(--bg-primary)] transition-all duration-700 ${
          theme === 'dark' ? 'grayscale-[0.4] contrast-[1.1] brightness-110' : ''
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
        {nodes.map((node) => (
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
            <Popup className="custom-popup">
              <div className="min-w-[200px] p-2 bg-[var(--bg-card)] rounded-xl overflow-hidden shadow-2xl">
                <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2.5 mb-2.5">
                  <span className="font-mono text-[0.65rem] font-bold text-[var(--text-muted)] uppercase">{node.node_id}</span>
                  <span className="text-[0.75rem] font-bold text-[var(--accent-cyan)]">{node.name}</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col">
                    <span className="text-[0.6rem] text-[var(--text-muted)] uppercase tracking-wider font-semibold">Temperature</span>
                    <span className="text-sm font-mono text-[var(--text-primary)] font-bold">{node.temperature.toFixed(1)}°C</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[0.6rem] text-[var(--text-muted)] uppercase tracking-wider font-semibold">Humidity</span>
                    <span className="text-sm font-mono text-[var(--text-primary)] font-bold">{node.humidity}%</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[0.6rem] text-[var(--text-muted)] uppercase tracking-wider font-semibold">Pressure</span>
                    <span className="text-sm font-mono text-[var(--text-primary)] font-bold">{node.pressure.toFixed(1)}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[0.6rem] text-[var(--text-muted)] uppercase tracking-wider font-semibold">AQI Index</span>
                    <span className={`text-sm font-mono font-bold ${node.aqi > 100 ? 'text-rose-500' : 'text-emerald-500'}`}>
                      {node.aqi}
                    </span>
                  </div>
                </div>
                <div className="mt-3 pt-2.5 border-t border-[var(--border-subtle)] flex items-center justify-between text-[0.65rem] text-[var(--text-muted)]">
                  <div className="flex items-center gap-1">
                    <span className="opacity-70">💨</span> {node.wind_intensity}
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="opacity-70">🌧️</span> {node.rain_intensity}
                  </div>
                </div>
              </div>
            </Popup>
          </Marker>
        ))}

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
          className={`group relative w-16 h-16 rounded-full flex items-center justify-center transition-all duration-500 shadow-[0_0_40px_rgba(0,0,0,0.5)] overflow-hidden pointer-events-auto cursor-pointer ${
            aiChatOpen 
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
