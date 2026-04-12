import { useState, useMemo, useEffect } from 'react';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import MapView from './components/MapView';
import AIChatPanel from './components/AIChatPanel';
import NodeModal from './components/NodeModal';
import { fetchNodes, deployNode, updateNode, decommissionNode } from './api/nodeApi';
import './App.css';

// Mock data for multiple networks
const MOCK_NETWORKS = [
  { id: 'net-1' },
];

const INITIAL_NODES = {
  'net-1': []
};



export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [aiChatOpen, setAiChatOpen] = useState(false);
  const [selectedNode, setSelectedNode] = useState(null);
  const [activeNetworkId, setActiveNetworkId] = useState('net-1');
  const [nodesByNetwork, setNodesByNetwork] = useState(INITIAL_NODES);
  const [theme, setTheme] = useState('dark');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingNode, setEditingNode] = useState(null);

  // Sync theme with body class
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  const activeNodes = useMemo(() => nodesByNetwork[activeNetworkId] || [], [nodesByNetwork, activeNetworkId]);


  const stats = useMemo(() => ({
    total_nodes: activeNodes.length,
    online_nodes: activeNodes.filter(n => n.status !== 'offline').length,
    network_health: activeNodes.length > 2 ? 'excellent' : 'stable'
  }), [activeNodes]);

  const loadNodes = async () => {
    try {
      const data = await fetchNodes();
      // data is an array of nodes, we normalize it to activeNetworkId
      setNodesByNetwork(prev => ({
        ...prev,
        [activeNetworkId]: data
      }));
    } catch (err) {
      console.error("Failed to load nodes", err);
    }
  };

  useEffect(() => {
    loadNodes();
    // Poll every 10 seconds for real-time map updates
    const interval = setInterval(loadNodes, 10000);
    return () => clearInterval(interval);
  }, [activeNetworkId]);

  const handleAddNode = async (manualNode) => {
    try {
      await deployNode(manualNode);
      await loadNodes();
      setIsAddModalOpen(false);
    } catch (err) {
      console.error("Failed to deploy node", err);
    }
  };

  const handleUpdateNode = async (updatedNode) => {
    try {
      await updateNode(updatedNode.node_id, updatedNode);
      await loadNodes();
      setEditingNode(null);
    } catch (err) {
      console.error("Failed to update node", err);
    }
  };

  const handleDeleteNode = async (nodeId) => {
    try {
      await decommissionNode(nodeId);
      await loadNodes();
      if (selectedNode?.node_id === nodeId) {
        setSelectedNode(null);
      }
    } catch (err) {
      console.error("Failed to delete node", err);
    }
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

        {/*Sidebar Overlay (Left) */}
         <div 
          className={`absolute top-0 left-0 bottom-0 z-10 transition-transform duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <Sidebar 
            nodes={activeNodes} 
            selectedNode={selectedNode} 
            onSelectNode={setSelectedNode} 
            isOpen={sidebarOpen}
            onToggle={() => setSidebarOpen(!sidebarOpen)}
            onAddNode={() => setIsAddModalOpen(true)}
            onEditNode={setEditingNode}
          />
        </div>

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

        <NodeModal 
          isOpen={isAddModalOpen} 
          onClose={() => setIsAddModalOpen(false)} 
          onAdd={handleAddNode} 
        />

        {editingNode && (
          <NodeModal 
            isOpen={!!editingNode} 
            onClose={() => setEditingNode(null)} 
            onAdd={handleUpdateNode}
            onDelete={handleDeleteNode}
            initialData={editingNode}
            isEdit={true}
          />
        )}
      </main>
    </div>
  );
}