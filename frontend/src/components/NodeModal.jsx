import { useState, useEffect } from 'react';
import { X, MapPin, Cpu, Save, Trash2 } from 'lucide-react';

export default function NodeModal({ isOpen, onClose, onAdd, onDelete, initialData = null, isEdit = false }) {
  const [formData, setFormData] = useState({
    node_id: '',
    name: '',
    type: 'primary',
    lat: '',
    lon: ''
  });

  // Sync form with initialData for editing
  useEffect(() => {
    if (initialData && isEdit) {
      setFormData({
        node_id: initialData.node_id,
        name: initialData.name,
        lat: initialData.lat,
        lon: initialData.lon
      });
    } else {
      setFormData({ node_id: '', name: '', lat: '', lon: '' });
    }
  }, [initialData, isEdit, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();

    // Combine manual input with baseline telemetry
    const nodePayload = isEdit ? { ...initialData, ...formData, lat: parseFloat(formData.lat), lon: parseFloat(formData.lon) } : {
      ...formData,
      lat: parseFloat(formData.lat),
      lon: parseFloat(formData.lon),
      temperature: 25.0,
      humidity: 50,
      pressure: 924.1,
      aqi: 45,
      battery: 100,
      status: 'online',
      wind_intensity: '0 km/h',
      wind_direction: 'N',
      rain_intensity: 'none',
      condition: 'Sunny',
      last_updated: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    onAdd(nodePayload);
    if (!isEdit) setFormData({ node_id: '', name: '', lat: '', lon: '' });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 animate-in fade-in duration-300">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-md bg-[var(--bg-card)] backdrop-blur-2xl border border-[var(--border-subtle)] rounded-3xl shadow-[0_32px_64px_-16px_rgba(0,0,0,0.6)] overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-10 duration-500">
        {/* Header */}
        <div className="p-6 border-b border-[var(--border-subtle)] bg-gradient-to-r from-[var(--bg-secondary)]/50 to-transparent flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-[var(--text-primary)] tracking-tight">
              {isEdit ? 'Update Configuration' : 'Deploy New Node'}
            </h2>
            <p className="text-xs text-[var(--text-muted)] mt-1 uppercase tracking-widest font-bold opacity-60">
              {isEdit ? 'Modifying Active Hardware' : 'Network Expansion Protocol'}
            </p>
          </div>

          {isEdit && (
            <button
              type="button"
              onClick={() => {
                onDelete(initialData.node_id);
                onClose();
              }
              }
              className="p-2.5 rounded-xl bg-[var(--bg-secondary)] hover:bg-rose-500/10 text-[var(--text-muted)] hover:text-rose-500 border border-[var(--border-subtle)] hover:border-rose-500/30 transition-all group"
              title="Decommission Node"
            >
              <Trash2 size={18} className="transition-transform group-hover:scale-110" />
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-6">
          {/* Identity Section */}
          <div className="space-y-3">
            <label className="text-[0.65rem] font-bold text-[var(--text-muted)] uppercase tracking-[0.1em] px-1 block text-center">Hardware Identity *</label>
            <input
              type="text"
              placeholder="Enter Node ID"
              value={formData.node_id}
              onChange={e => setFormData({ ...formData, node_id: e.target.value })}
              className={`w-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl px-4 py-3.5 text-base font-bold text-center text-[var(--text-primary)] focus:border-[var(--accent-cyan)] outline-none transition-all placeholder:text-[var(--text-muted)]/40 focus:bg-[var(--bg-card)] tracking-widest ${isEdit ? 'opacity-50 cursor-not-allowed' : ''}`}
              required
              disabled={isEdit}
            />
          </div>

          {/* Alias Section - Optional */}
          <div className="space-y-3">
            <label className="text-[0.65rem] font-bold text-[var(--text-muted)] uppercase tracking-[0.1em] px-1 block text-center">Software Alias</label>
            <input
              type="text"
              placeholder="e.g. MG Road Meter"
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              className="w-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl px-4 py-3 text-sm text-[var(--text-primary)] focus:border-[var(--accent-cyan)] outline-none transition-all placeholder:text-[var(--text-muted)]/40 focus:bg-[var(--bg-card)]"
            />
          </div>

          {/* Mapping Section */}
          <div className="space-y-3">
            <label className="text-[0.65rem] font-bold text-[var(--text-muted)] uppercase tracking-[0.1em] px-1 block text-center">Geographical Coordinates *</label>
            <div className="grid grid-cols-2 gap-4">
              <div className="relative group">
                <MapPin size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)] transition-colors group-focus-within:text-[var(--accent-cyan)]" />
                <input
                  type="number"
                  step="any"
                  placeholder="Latitude"
                  value={formData.lat}
                  onChange={e => setFormData({ ...formData, lat: e.target.value })}
                  className="w-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl pl-10 pr-4 py-3 text-sm text-[var(--text-primary)] focus:border-[var(--accent-cyan)] outline-none transition-all placeholder:text-[var(--text-muted)]/40 focus:bg-[var(--bg-card)]"
                  required
                />
              </div>
              <div className="relative group">
                <MapPin size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)] transition-colors group-focus-within:text-[var(--accent-cyan)]" />
                <input
                  type="number"
                  step="any"
                  placeholder="Longitude"
                  value={formData.lon}
                  onChange={e => setFormData({ ...formData, lon: e.target.value })}
                  className="w-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl pl-10 pr-4 py-3 text-sm text-[var(--text-primary)] focus:border-[var(--accent-cyan)] outline-none transition-all placeholder:text-[var(--text-muted)]/40 focus:bg-[var(--bg-card)]"
                  required
                />
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-4 bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)] text-[var(--text-primary)] text-xs font-bold uppercase tracking-widest rounded-xl transition-all border border-[var(--border-subtle)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-[2] py-4 rounded-xl bg-gradient-to-r from-[var(--accent-cyan)] to-[var(--accent-emerald)] text-white font-bold text-xs uppercase tracking-[0.2em] shadow-[0_10px_30px_rgba(6,182,212,0.25)] hover:scale-[1.02] hover:shadow-[0_15px_35px_rgba(6,182,212,0.35)] active:scale-95 transition-all flex items-center justify-center gap-3 group cursor-pointer"
            >
              <Save size={18} className="transition-transform group-hover:rotate-12" />
              {isEdit ? 'Save Changes' : 'Launch Node'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
