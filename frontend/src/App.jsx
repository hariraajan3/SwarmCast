import { useState, useMemo, useEffect } from 'react';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import MapView from './components/MapView';
import AIChatPanel from './components/AIChatPanel';
import './App.css';

// Mock data for multiple networks
const MOCK_NETWORKS = [
  { id: 'net-1', name: 'Downtown Bengaluru' },
  { id: 'net-2', name: 'Koramangala Mesh' },
  { id: 'net-3', name: 'Whitefield Grid' }
];

const INITIAL_NODES = {
  'net-1': [
    { node_id: 'SW-001-GW', name: 'Main Gateway - Brigade Road', type: 'gateway', lat: 12.9716, lon: 77.5946, temperature: 28.5, humidity: 62, pressure: 924.5, aqi: 42, battery: 98, status: 'online', wind_intensity: 'moderate', rain_intensity: 'none' },
    { node_id: 'SW-102-RY', name: 'Relay Node - MG Road Met', type: 'relay', lat: 12.9750, lon: 77.6010, temperature: 29.2, humidity: 58, pressure: 923.8, aqi: 85, battery: 45, status: 'online', wind_intensity: 'strong', rain_intensity: 'none' }
  ],
  'net-2': [
    { node_id: 'KM-501-GW', name: 'Kora Gateway', type: 'gateway', lat: 12.9352, lon: 77.6245, temperature: 27.2, humidity: 55, pressure: 925.2, aqi: 35, battery: 100, status: 'online', wind_intensity: 'calm', rain_intensity: 'none' }
  ],
  'net-3': [
    { node_id: 'WF-901-RY', name: 'WF Relay', type: 'relay', lat: 12.9698, lon: 77.7500, temperature: 30.1, humidity: 50, pressure: 921.5, aqi: 125, battery: 62, status: 'online', wind_intensity: 'moderate', rain_intensity: 'none' }
  ]
};

const INITIAL_EDGES = {
  'net-1': [{ from_lat: 12.9716, from_lon: 77.5946, to_lat: 12.9750, to_lon: 77.6010 }],
  'net-2': [],
  'net-3': []
};

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [aiChatOpen, setAiChatOpen] = useState(false);
  const [selectedNode, setSelectedNode] = useState(null);
  const [activeNetworkId, setActiveNetworkId] = useState('net-1');
  const [nodesByNetwork, setNodesByNetwork] = useState(INITIAL_NODES);
  const [theme, setTheme] = useState('dark');

  // Sync theme with body class
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  const activeNodes = useMemo(() => nodesByNetwork[activeNetworkId] || [], [nodesByNetwork, activeNetworkId]);
  const activeEdges = useMemo(() => INITIAL_EDGES[activeNetworkId] || [], [activeNetworkId]);

  const stats = useMemo(() => ({
    total_nodes: activeNodes.length,
    online_nodes: activeNodes.filter(n => n.status !== 'offline').length,
    network_health: activeNodes.length > 2 ? 'excellent' : 'stable'
  }), [activeNodes]);

  const handleAddNode = () => {
    const id = `NODE-${Math.floor(Math.random() * 900) + 100}`;
    const newNode = {
      node_id: id,
      name: `Manual Node ${id}`,
      type: 'primary',
      lat: (activeNodes[0]?.lat || 12.97) + (Math.random() - 0.5) * 0.02,
      lon: (activeNodes[0]?.lon || 77.59) + (Math.random() - 0.5) * 0.02,
      temperature: 25 + Math.random() * 5,
      humidity: 50 + Math.random() * 20,
      pressure: 920 + Math.random() * 10,
      aqi: 20 + Math.random() * 50,
      battery: 100,
      status: 'online',
      wind_intensity: 'calm',
      rain_intensity: 'none'
    };
    
    setNodesByNetwork(prev => ({
      ...prev,
      [activeNetworkId]: [...(prev[activeNetworkId] || []), newNode]
    }));
  };

  return (
    <div className={`flex flex-col h-screen w-screen bg-[var(--bg-primary)] text-[var(--text-primary)] font-sans ${theme}`}>
      <Header
        stats={stats}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        aiChatOpen={aiChatOpen}
        onToggleAIChat={() => setAiChatOpen(!aiChatOpen)}
        theme={theme}
        onToggleTheme={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')}
      />

      <main className="flex-1 relative overflow-hidden">
        <div className="absolute inset-0 z-0">
          <MapView
            nodes={activeNodes}
            meshEdges={activeEdges}
            selectedNode={selectedNode}
            onSelectNode={setSelectedNode}
            networks={MOCK_NETWORKS}
            activeNetwork={activeNetworkId}
            onSelectNetwork={setActiveNetworkId}
            aiChatOpen={aiChatOpen}
            onToggleAIChat={() => setAiChatOpen(!aiChatOpen)}
            theme={theme}
          />
        </div>

        {/* Sidebar Overlay (Left) */}
        {/* <div 
          className={`absolute top-0 left-0 bottom-0 z-10 transition-transform duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <Sidebar 
            nodes={activeNodes} 
            selectedNode={selectedNode} 
            onSelectNode={setSelectedNode} 
            isOpen={sidebarOpen}
            onAddNode={handleAddNode}
          />
        </div> */}

        {/* AI Assistant Overlay (Right) */}
        <div 
          className={`absolute top-0 right-0 bottom-0 z-10 transition-transform duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] ${
            aiChatOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          <AIChatPanel
            isOpen={aiChatOpen}
            onClose={() => setAiChatOpen(false)}
          />
        </div>
      </main>
    </div>
  );
}