import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useState, useRef } from 'react';
import { Plus, Minus, RefreshCw, Bot, Thermometer, Droplets, Wind, CloudRain, Activity, Cloud, Layers, Zap, Waves, Satellite, Radio, X } from 'lucide-react';
import 'leaflet.heat';
import { getBatteryIcon } from './Sidebar';

import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;


// Custom icon with standard Cyan color
const createNodeIcon = (status = 'online') => {
  const isOnline = status === 'online';
  return new L.DivIcon({
    className: 'custom-div-icon',
    html: `<div style="
      background-color: #06b6d4; 
      width: 12px; 
      height: 12px; 
      border-radius: 50%; 
      border: 2px solid ${isOnline ? '#fff' : '#374151'}; 
      box-shadow: ${isOnline ? '0 0 10px rgba(6, 182, 212, 0.5)' : 'none'};
      opacity: ${isOnline ? '1' : '0.6'};
    "></div>`,
    iconSize: [12, 12],
    iconAnchor: [6, 6]
  });
};

// Helper to determine wind intensity level
const getWindInfo = (speed) => {
  const s = parseInt(speed) || 0;
  if (s > 15) return { bars: 3, color: 'var(--accent-rose)', emoji: '🌪️' };
  if (s > 8)  return { bars: 2, color: 'var(--accent-amber)', emoji: '🍃' };
  return { bars: 1, color: 'var(--accent-emerald)', emoji: '🎐' };
};

// Helper to determine rain intensity level
const getRainInfo = (intensity) => {
  if (intensity === undefined || intensity === null || intensity === '') {
    return { bars: 0, color: 'var(--text-muted)', emoji: '☀️' };
  }

  if (typeof intensity === 'number') {
    if (intensity <= 0) return { bars: 0, color: 'var(--text-muted)', emoji: '☀️' };
    if (intensity < 2.5) return { bars: 1, color: 'var(--accent-cyan)', emoji: '🌦️' };
    if (intensity < 10) return { bars: 2, color: 'var(--accent-amber)', emoji: '🌧️' };
    return { bars: 3, color: 'var(--accent-rose)', emoji: '⛈️' };
  }

  const str = String(intensity).toLowerCase();
  switch (str) {
    case 'heavy':    return { bars: 3, color: 'var(--accent-rose)',    emoji: '⛈️' };
    case 'mid':
    case 'moderate': return { bars: 2, color: 'var(--accent-amber)',   emoji: '🌧️' };
    case 'low':
    case 'light':    return { bars: 1, color: 'var(--accent-cyan)',    emoji: '🌦️' };
    default:         return { bars: 0, color: 'var(--text-muted)',     emoji: '☀️' };
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
    if (node) map.setView([node.lat, node.lon], 16, { animate: true });
  }, [node, map]);
  useEffect(() => {
    const timer = setTimeout(() => map.invalidateSize(), 300);
    return () => clearTimeout(timer);
  }, [map]);
  return null;
}

function ZoomControls() {
  const map = useMap();
  const handleZoomIn  = (e) => { e.stopPropagation(); e.preventDefault(); map.zoomIn(); };
  const handleZoomOut = (e) => { e.stopPropagation(); e.preventDefault(); map.zoomOut(); };
  return (
    <div className="flex flex-col gap-2" onDoubleClick={(e) => e.stopPropagation()}>
      <button onClick={handleZoomIn}  className="w-10 h-10 bg-[var(--bg-card)] backdrop-blur-md border border-[var(--border-subtle)] rounded-lg text-[var(--text-primary)] flex items-center justify-center hover:bg-[var(--accent-cyan)] hover:text-white transition-all shadow-lg cursor-pointer active:scale-95 z-[1001]" title="Zoom In"><Plus size={20} /></button>
      <button onClick={handleZoomOut} className="w-10 h-10 bg-[var(--bg-card)] backdrop-blur-md border border-[var(--border-subtle)] rounded-lg text-[var(--text-primary)] flex items-center justify-center hover:bg-[var(--accent-cyan)] hover:text-white transition-all shadow-lg cursor-pointer active:scale-95 z-[1001]" title="Zoom Out"><Minus size={20} /></button>
    </div>
  );
}

// ─── TEMPERATURE LAYER ───────────────────────────────────────
// Smooth isothermal heatmap: arctic blue → cyan → green → amber → red
function TemperatureLayer({ nodes, active }) {
  const map = useMap();
  useEffect(() => {
    if (!active || !nodes?.length) return;
    const points = nodes.map(n => {
      const t = n.telemetry?.temperature ?? 20;
      const intensity = Math.min(1, Math.max(0, (t - 5) / 40));
      return [n.lat, n.lon, intensity];
    });
    const layer = L.heatLayer(points, {
      radius: 45, blur: 35, maxZoom: 18,
      gradient: {
        0.00: '#1e40af',
        0.25: '#06b6d4',
        0.42: '#10b981',
        0.58: '#fbbf24',
        0.75: '#f97316',
        1.00: '#ef4444',
      },
    }).addTo(map);
    return () => map.removeLayer(layer);
  }, [nodes, active, map]);
  return null;
}

function RainLayer({ nodes, active }) {
  const map = useMap();
  const canvasRef = useRef(document.createElement('canvas'));
  const rafRef    = useRef(null);

  // Heatmap
  useEffect(() => {
    if (!active || !nodes?.length) return;
    const points = nodes.map(n => {
      const r = n.telemetry?.rain_intensity ?? 0;
      return [n.lat, n.lon, Math.min(1, r / 50)];
    });
    const layer = L.heatLayer(points, {
      radius: 45, blur: 35, maxZoom: 18,
      gradient: {
        0.00: '#bae6fd',
        0.25: '#38bdf8',
        0.50: '#0ea5e9',
        0.75: '#1d4ed8',
        1.00: '#1e3a8a',
      },
    }).addTo(map);
    return () => map.removeLayer(layer);
  }, [nodes, active, map]);

  // Animated falling drops canvas
  useEffect(() => {
    if (!active || !nodes?.length) return;
    const canvas = canvasRef.current;
    canvas.style.cssText = 'pointer-events:none;position:absolute;top:0;left:0;z-index:450;';
    map.getContainer().appendChild(canvas);

    const drops = [];
    nodes.forEach(n => {
      const intensity = n.telemetry?.rain_intensity ?? 0;
      if (intensity === 0) return;
      const count = Math.ceil((intensity / 50) * 30) + 5;
      for (let i = 0; i < count; i++) {
        drops.push({
          baseLat: n.lat + (Math.random() - 0.5) * 0.015,
          baseLon: n.lon + (Math.random() - 0.5) * 0.015,
          offsetY: Math.random() * 200,
          speed:   2 + Math.random() * 3,
          length:  8 + Math.random() * 12,
          opacity: 0.3 + (intensity / 50) * 0.5,
        });
      }
    });

    const render = () => {
      const container = map.getContainer();
      canvas.width  = container.clientWidth;
      canvas.height = container.clientHeight;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      drops.forEach(d => {
        const pt = map.latLngToContainerPoint([d.baseLat, d.baseLon]);
        d.offsetY = (d.offsetY + d.speed) % (canvas.height + 20);
        const x = pt.x;
        const y = (pt.y + d.offsetY) % canvas.height;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 1, y + d.length);
        ctx.strokeStyle = `rgba(147, 210, 255, ${d.opacity})`;
        ctx.lineWidth = 1;
        ctx.lineCap = 'round';
        ctx.stroke();
      });
      rafRef.current = requestAnimationFrame(render);
    };
    render();

    return () => {
      cancelAnimationFrame(rafRef.current);
      if (map.getContainer().contains(canvas)) map.getContainer().removeChild(canvas);
    };
  }, [nodes, active, map]);

  return null;
}

// ─── WIND LAYER ──────────────────────────────────────────────
// Heatmap (purple speed intensity) + animated directional streamlines with arrowheads
function WindLayer({ nodes, active }) {
  const map = useMap();
  const canvasRef = useRef(document.createElement('canvas'));
  const rafRef    = useRef(null);

  // Heatmap
  useEffect(() => {
    if (!active || !nodes?.length) return;
    const points = nodes.map(n => {
      const s = n.telemetry?.wind_speed ?? 0;
      return [n.lat, n.lon, Math.min(1, s / 80)];
    });
    const layer = L.heatLayer(points, {
      radius: 45, blur: 35, maxZoom: 18,
      gradient: {
        0.00: '#c4b5fd',
        0.25: '#a78bfa',
        0.50: '#8b5cf6',
        0.75: '#6d28d9',
        1.00: '#4c1d95',
      },
    }).addTo(map);
    return () => map.removeLayer(layer);
  }, [nodes, active, map]);

  // Animated streamlines canvas
  useEffect(() => {
    if (!active || !nodes?.length) return;
    const canvas = canvasRef.current;
    canvas.style.cssText = 'pointer-events:none;position:absolute;top:0;left:0;z-index:450;';
    map.getContainer().appendChild(canvas);

    const particles = nodes.map(n => {
      const speed = n.telemetry?.wind_speed ?? 5;
      const rawDir = n.telemetry?.wind_direction ?? n.wind_direction ?? 'N';
      let degrees = 90;
      if (typeof rawDir === 'number') {
        degrees = rawDir;
      } else {
        switch (String(rawDir).toUpperCase()) {
          case 'NE': degrees = 45; break;
          case 'E':  degrees = 90; break;
          case 'SE': degrees = 135; break;
          case 'S':  degrees = 180; break;
          case 'SW': degrees = 225; break;
          case 'W':  degrees = 270; break;
          case 'NW': degrees = 315; break;
          case 'N':  degrees = 0; break;
          default:   degrees = 90; break;
        }
      }
      // Convert bearing to standard math unit circle angle: -90 shifts North to point UP on screen.
      const dir = (degrees - 90) * (Math.PI / 180);

      return {
        lat: n.lat, lon: n.lon,
        angle: dir,
        speed: 0.5 + (speed / 80) * 3,
        progress: Math.random() * 200,
        maxProgress: 120 + Math.random() * 80,
        alpha: 0.5 + (speed / 80) * 0.5,
      };
    });

    const render = () => {
      const container = map.getContainer();
      canvas.width  = container.clientWidth;
      canvas.height = container.clientHeight;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particles.forEach(p => {
        const origin = map.latLngToContainerPoint([p.lat, p.lon]);
        p.progress = (p.progress + p.speed) % p.maxProgress;

        const tail  = 22;
        const head  = p.progress;
        const tailX = origin.x + Math.cos(p.angle) * Math.max(0, head - tail);
        const tailY = origin.y + Math.sin(p.angle) * Math.max(0, head - tail);
        const headX = origin.x + Math.cos(p.angle) * head;
        const headY = origin.y + Math.sin(p.angle) * head;

        const fade = Math.min(1, p.progress / 20) * Math.min(1, (p.maxProgress - p.progress) / 20);

        const grad = ctx.createLinearGradient(tailX, tailY, headX, headY);
        grad.addColorStop(0,   `rgba(216,180,254,0)`);
        grad.addColorStop(0.5, `rgba(216,180,254,${p.alpha * fade * 0.6})`);
        grad.addColorStop(1,   `rgba(255,255,255,${p.alpha * fade})`);

        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(headX, headY);
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.5;
        ctx.lineCap = 'round';
        ctx.stroke();

        // Arrowhead
        if (fade > 0.5) {
          const aw = 5;
          ctx.beginPath();
          ctx.moveTo(headX, headY);
          ctx.lineTo(headX - aw * Math.cos(p.angle - 0.4), headY - aw * Math.sin(p.angle - 0.4));
          ctx.lineTo(headX - aw * Math.cos(p.angle + 0.4), headY - aw * Math.sin(p.angle + 0.4));
          ctx.closePath();
          ctx.fillStyle = `rgba(255,255,255,${p.alpha * fade * 0.9})`;
          ctx.fill();
        }
      });

      rafRef.current = requestAnimationFrame(render);
    };
    render();

    return () => {
      cancelAnimationFrame(rafRef.current);
      if (map.getContainer().contains(canvas)) map.getContainer().removeChild(canvas);
    };
  }, [nodes, active, map]);

  return null;
}

// ─── CLOUDS LAYER ────────────────────────────────────────────
// Heatmap: transparent (clear) → white-grey (overcast)
function CloudsLayer({ nodes, active }) {
  const map = useMap();
  useEffect(() => {
    if (!active || !nodes?.length) return;
    const points = nodes.map(n => {
      const c = n.telemetry?.cloud_coverage ?? 0;
      return [n.lat, n.lon, Math.min(1, c / 100)];
    });
    const layer = L.heatLayer(points, {
      radius: 45, blur: 35, maxZoom: 18,
      gradient: {
        0.00: '#fefce8',
        0.25: '#e2e8f0',
        0.50: '#cbd5e1',
        0.75: '#94a3b8',
        1.00: '#f8fafc',
      },
    }).addTo(map);
    return () => map.removeLayer(layer);
  }, [nodes, active, map]);
  return null;
}

// ─── TEMPERATURE COLOR HELPER ────────────────────────────────
function getTemperatureColor(t) {
  if (t <= 5)  return '#1e40af';
  if (t <= 15) return '#06b6d4';
  if (t <= 22) return '#10b981';
  if (t <= 28) return '#fbbf24';
  if (t <= 35) return '#f97316';
  return '#ef4444';
}

// ─── WINDY-STYLE DATA LABEL ──────────────────────────────────
// Coloured value + emoji floating above each node
const createDataLabel = (name, value, unit, type) => {
  const colorMap = {
    temp:   getTemperatureColor(value),
    wind:   '#c4b5fd',
    rain:   '#7dd3fc',
    clouds: value > 70 ? '#94a3b8' : '#fde68a',
  };
  const textColor = colorMap[type] || '#ffffff';

  const getEmoji = () => {
    if (type === 'temp')   return value > 35 ? '🌡️' : value < 15 ? '❄️' : '';
    if (type === 'wind')   return value > 40 ? '🌪️' : value > 15 ? '💨' : '🍃';
    if (type === 'rain')   return value > 20 ? '⛈️' : value > 5 ? '🌧️' : value > 0 ? '🌦️' : '☀️';
    if (type === 'clouds') return value > 80 ? '☁️' : value > 40 ? '⛅' : '☀️';
    return '';
  };

  return new L.DivIcon({
    className: 'windy-data-label',
    html: `
      <div style="
        display: flex;
        flex-direction: column;
        align-items: center;
        pointer-events: none;
        text-align: center;
        filter: drop-shadow(0 2px 6px rgba(0,0,0,0.9));
      ">
        <span style="
          font-size: 10px;
          font-weight: 800;
          color: rgba(255,255,255,0.7);
          letter-spacing: 0.03em;
          line-height: 1;
          text-transform: uppercase;
        ">${name}</span>
        <span style="
          font-size: 15px;
          font-weight: 900;
          color: ${textColor};
          line-height: 1.1;
          margin-top: 1px;
          letter-spacing: -0.02em;
          text-shadow: 0 0 12px ${textColor}88;
        ">${Math.round(value)}${unit}</span>
        <span style="font-size: 11px; line-height: 1; margin-top: 1px;">${getEmoji()}</span>
      </div>
    `,
    iconSize: [80, 48],
    iconAnchor: [40, 24],
  });
};

// ─── WEATHER LEGEND HUD ──────────────────────────────────────
// Bottom-left colour ramp legend matching the active layer
function WeatherLegend({ layerType }) {
  if (layerType === 'none') return null;

  const legends = {
    temp: {
      label: 'Temperature (°C)',
      stops: [
        { color: '#1e40af', text: '≤5' },
        { color: '#06b6d4', text: '15' },
        { color: '#10b981', text: '22' },
        { color: '#fbbf24', text: '28' },
        { color: '#f97316', text: '35' },
        { color: '#ef4444', text: '≥45' },
      ],
    },
    rain: {
      label: 'Rain Intensity (mm/h)',
      stops: [
        { color: '#bae6fd', text: 'Dry' },
        { color: '#38bdf8', text: 'Light' },
        { color: '#0ea5e9', text: 'Mod' },
        { color: '#1d4ed8', text: 'Heavy' },
        { color: '#1e3a8a', text: 'Storm' },
      ],
    },
    wind: {
      label: 'Wind Speed (km/h)',
      stops: [
        { color: '#c4b5fd', text: 'Calm' },
        { color: '#a78bfa', text: 'Breezy' },
        { color: '#8b5cf6', text: 'Strong' },
        { color: '#6d28d9', text: 'Gale' },
        { color: '#4c1d95', text: 'Storm' },
      ],
    },
    clouds: {
      label: 'Cloud Cover (%)',
      stops: [
        { color: '#fefce8', text: 'Clear' },
        { color: '#e2e8f0', text: '25%' },
        { color: '#cbd5e1', text: '50%' },
        { color: '#94a3b8', text: '75%' },
        { color: '#f8fafc', text: 'Overcast' },
      ],
    },
  };

  const legend = legends[layerType];
  if (!legend) return null;

  return (
    <div
      className="absolute bottom-8 left-4 z-[1000] pointer-events-none"
      style={{
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '12px',
        padding: '10px 14px',
        minWidth: 160,
      }}
    >
      <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>
        {legend.label}
      </p>
      <div style={{
        height: 6, borderRadius: 3, marginBottom: 4,
        background: `linear-gradient(to right, ${legend.stops.map(s => s.color).join(', ')})`,
      }} />
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        {legend.stops.map((s, i) => (
          <span key={i} style={{ color: 'rgba(255,255,255,0.55)', fontSize: 8, fontWeight: 700 }}>{s.text}</span>
        ))}
      </div>
    </div>
  );
}

// ─── MAIN COMPONENT ──────────────────────────────────────────
export default function MapView({ nodes, selectedNode, onSelectNode, networks, activeNetwork, onSelectNetwork, aiChatOpen, onToggleAIChat, theme }) {
  const [layerType, setLayerType] = useState('none');

  const center = [12.9716, 77.5946];


  return (
    <div className="relative w-full h-full bg-[var(--bg-primary)] overflow-hidden" id="map-container">
      <MapContainer
        center={center}
        zoom={13}
        scrollWheelZoom={true}
        className={`w-full h-full !bg-[var(--bg-primary)] transition-all duration-700 ${theme === 'dark' ? 'grayscale-[0.4] contrast-[1.1] brightness-110' : ''}`}
        zoomControl={false}
        attributionControl={false}
      >
        {theme === 'dark' ? (
          <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" opacity={1} />
        ) : (
          <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" />
        )}

        {layerType === 'satellite' && (
          <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            opacity={0.6}
          />
        )}

        {/* ── Windy-style Weather Layers ── */}
        <TemperatureLayer nodes={nodes} active={layerType === 'temp'} />
        <RainLayer        nodes={nodes} active={layerType === 'rain'} />
        <WindLayer        nodes={nodes} active={layerType === 'wind'} />
        <CloudsLayer      nodes={nodes} active={layerType === 'clouds'} />

        {nodes.map((node) => {
          const wind = getWindInfo(node.telemetry?.wind_speed);
          const rain = getRainInfo(node.telemetry?.rain_intensity);

          const unitMap  = { temp: '°', wind: ' km/h', rain: ' mm', clouds: '%' };
          const fieldMap = { temp: 'temperature', wind: 'wind_speed', rain: 'rain_intensity', clouds: 'cloud_coverage' };
          const val = node.telemetry ? node.telemetry[fieldMap[layerType]] : null;

          return (
            <div key={node.node_id}>
              {/* Data labels on nodes during overlays are disabled per user request to reduce UI clutter */}

              <Marker
                position={[node.lat, node.lon]}
                icon={createNodeIcon(node.status)}
                eventHandlers={{
                  click: () => onSelectNode(node),
                  mouseover: (e) => e.target.openPopup(),
                }}
              >
                <Popup className="custom-popup" offset={[0, -10]}>
                  <div className="min-w-[220px] bg-[#111827] rounded-2xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.6)] border border-[#374151] p-0">
                    {/* HUD Header */}
                    <div className="bg-gradient-to-r from-[#1f2937] via-[#1f2937]/50 to-transparent p-3.5 pb-2.5 border-b border-[#374151]">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-sm font-bold text-white leading-tight">{node.node_id}</h3>
                        <div className={`p-1.5 rounded-full border flex items-center justify-center ${node.status === 'online' ? 'bg-emerald-500/10 border-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.3)]' : 'bg-rose-500/10 border-rose-500/30 shadow-[0_0_10px_rgba(244,63,94,0.3)]'}`}>
                          <span className={`w-2 h-2 rounded-full animate-blink ${node.status === 'online' ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]' : 'bg-rose-500 shadow-[0_0_8px_#f43f5e]'}`} />
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
            </div>
          );
        })}

        <MapController node={selectedNode} />

        <div className={`leaflet-bottom leaflet-right !mb-8 transition-all duration-500 pointer-events-auto flex flex-col gap-2 ${aiChatOpen ? '!mr-[360px]' : '!mr-6'}`}>
          <ZoomControls />
        </div>
      </MapContainer>

      {/* ── Windy Legend (bottom-left, outside MapContainer) ── */}
      <WeatherLegend layerType={layerType} />

      {/* Map Overlay UI – AI Chat button */}
      <div className={`absolute top-3 transition-all duration-500 z-[1000] flex flex-col gap-4 items-end pointer-events-none ${aiChatOpen ? 'right-[360px]' : 'right-6'}`}>
        <button
          onClick={onToggleAIChat}
          className={`group relative w-16 h-16 rounded-full flex items-center justify-center transition-all duration-500 shadow-[0_0_40px_rgba(0,0,0,0.5)] overflow-hidden pointer-events-auto cursor-pointer ${aiChatOpen ? 'bg-[var(--accent-cyan)] text-white scale-110 shadow-[var(--shadow-glow-cyan)]' : 'bg-[var(--bg-card)] text-[var(--accent-cyan)] border-2 border-[var(--border-subtle)] hover:border-[var(--accent-cyan)] hover:scale-105 active:scale-95'}`}
          title="AI Assistant"
        >
          <div className={`absolute inset-0 bg-gradient-to-tr from-transparent via-white/20 to-transparent transition-opacity duration-300 ${aiChatOpen ? 'opacity-100' : 'opacity-0'}`} />
          <div className={`relative z-10 ${!aiChatOpen && 'animate-[breathe_3s_ease-in-out_infinite]'}`}>
            <Bot size={36} strokeWidth={1.5} />
          </div>
          <div className="absolute right-20 px-3 py-1.5 bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-xl text-[0.7rem] font-bold text-[var(--accent-cyan)] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none uppercase tracking-widest shadow-2xl">
            Assistant
          </div>
        </button>
      </div>

      {/* Weather Layer Switcher HUD – Compact Windy Style */}
      <div className={`absolute top-1/2 -translate-y-1/2 transition-all duration-500 z-[1000] flex flex-col gap-2.5 pointer-events-none ${aiChatOpen ? 'right-[360px]' : 'right-6'}`}>
        {[
          { id: 'wind',   icon: <Wind size={16} />,        label: 'Wind',   color: '#8b5cf6' },
          { id: 'rain',   icon: <CloudRain size={16} />,   label: 'Rain',   color: '#0ea5e9' },
          { id: 'temp',   icon: <Thermometer size={16} />, label: 'Temp',   color: '#f59e0b' },
          { id: 'clouds', icon: <Cloud size={16} />,       label: 'Clouds', color: '#94a3b8' },
        ].map(item => (
          <button
            key={item.id}
            onClick={() => setLayerType(item.id)}
            className={`group relative flex items-center justify-end gap-2.5 pointer-events-auto cursor-pointer transition-all duration-300 ${layerType === item.id ? 'scale-110' : 'hover:translate-x-[-5px]'}`}
          >
            <span className={`px-2.5 py-1 rounded-full text-[0.6rem] font-black uppercase tracking-[0.15em] backdrop-blur-2xl border transition-all duration-300 shadow-2xl ${layerType === item.id ? 'bg-white text-black border-white' : 'bg-black/40 text-white/60 border-white/5 group-hover:bg-black/60 group-hover:text-white group-hover:border-white/20'}`}>
              {item.label}
            </span>
            <div
              className={`w-9 h-9 rounded-full flex items-center justify-center border transition-all duration-500 relative ${layerType === item.id ? 'bg-white text-black border-white' : 'bg-black/60 text-white border-white/10 group-hover:border-white/40'}`}
              style={{ boxShadow: layerType === item.id ? `0 0 15px ${item.color}88, 0 0 30px ${item.color}44` : '0 4px 12px rgba(0,0,0,0.4)' }}
            >
              <div className="relative z-10">{item.icon}</div>
              {layerType === item.id && (
                <div className="absolute inset-0 rounded-full animate-ping opacity-20" style={{ backgroundColor: item.color }} />
              )}
            </div>
          </button>
        ))}

        {/* Clear/Close Overlays Button */}
        {layerType !== 'none' && (
          <button
            onClick={() => setLayerType('none')}
            className="group relative flex items-center justify-end gap-2.5 pointer-events-auto cursor-pointer transition-all duration-300 animate-[fadeInUp_0.3s_ease_both]"
          >
            <span className="px-2.5 py-1 rounded-full text-[0.6rem] font-black uppercase tracking-[0.15em] backdrop-blur-2xl border border-rose-500/20 bg-black/40 text-rose-400 group-hover:bg-rose-500 group-hover:text-white transition-all">
              Clear
            </span>
            <div className="w-9 h-9 rounded-full flex items-center justify-center border border-rose-500/30 bg-black/60 text-rose-400 group-hover:bg-rose-500 group-hover:text-white group-hover:border-rose-500 transition-all shadow-[0_0_15px_rgba(244,63,94,0.2)]">
              <X size={16} />
            </div>
          </button>
        )}
      </div>
    </div>
  );
}