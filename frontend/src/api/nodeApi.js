import axios from "axios";


const BASE_URL = import.meta.env.VITE_BACKEND_URL || "http://127.0.0.1:5000";

export const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: {
    "Content-Type": "application/json",
  }
});

export const fetchNodes = async () => {
    const { data } = await apiClient.get('/api/nodes');
    if (!data) return [];
    
    return data.map(node => {
        const t = node.telemetry || {};
        return {
            ...node,
            temperature: t.temperature ?? 0,
            humidity: t.humidity ?? 0,
            pressure: t.pressure ?? 0,
            aqi: t.aqi ?? 0,
            rain_intensity: t.rain_intensity ?? 'none',
            wind_speed: t.wind_speed ?? 0,
            wind_direction: t.wind_direction ?? 'N',
            wind_intensity: `${t.wind_speed ?? 0} km/h`,
            battery: t.battery ?? 100,
            condition: t.cloud_coverage > 50 ? 'Cloudy' : 'Clear', // simple derivation
            last_updated: new Date(t.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) 
        };
    });
};

export const deployNode = async (payload) => {
    const { data } = await apiClient.post('/api/nodes', payload);
    return data;
};

export const updateNode = async (nodeId, payload) => {
    const { data } = await apiClient.put(`/api/nodes/${nodeId}`, payload);
    return data;
};

export const decommissionNode = async (nodeId) => {
    const { data } = await apiClient.delete(`/api/nodes/${nodeId}`);
    return data;
};
