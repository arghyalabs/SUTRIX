import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, Server, Cpu, Database, Wifi, WifiOff, RefreshCw, Package } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

interface SystemMetrics {
  cpu_pct: number;
  ram_pct: number;
  available_ram_gb: number;
  process_ram_mb: number;
  active_jobs: number;
  total_jobs: number;
  ws_connections: number;
  worker_pool_size: number;
}

const MetricBar: React.FC<{ value: number; color: string }> = ({ value, color }) => (
  <div className="w-full h-1 bg-white/[0.06] rounded-full overflow-hidden mt-2">
    <motion.div
      className={`h-full rounded-full ${color}`}
      animate={{ width: `${Math.min(value, 100)}%` }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
    />
  </div>
);

const StatusBadge: React.FC<{ label: string; value: string | number; color: string }> = ({ label, value, color }) => (
  <div className="flex items-center justify-between p-4 rounded-xl bg-white/[0.02]">
    <span className="text-sm font-medium text-secondary">{label}</span>
    <span className={`px-3 py-1 rounded-md text-xs font-mono ${color}`}>{value}</span>
  </div>
);

export const BenchmarkPanel: React.FC = () => {
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [isLive, setIsLive] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [error, setError] = useState(false);

  const fetchMetrics = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/system/telemetry`);
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setMetrics(data);
      setLastUpdate(new Date());
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    fetchMetrics();
    if (!isLive) return;
    const interval = setInterval(fetchMetrics, 3000);
    return () => clearInterval(interval);
  }, [fetchMetrics, isLive]);

  return (
    <div className="max-w-5xl mx-auto py-8">
      <div className="text-center mb-10">
        <div className="flex items-center justify-center gap-3 mb-3">
          <h1 className="text-3xl font-bold text-white tracking-tight">System Benchmarks</h1>
          <motion.div
            animate={isLive && !error ? { opacity: [1, 0.3, 1] } : { opacity: 0.3 }}
            transition={{ repeat: Infinity, duration: 2 }}
            className={`w-2 h-2 rounded-full ${error ? 'bg-rose-400' : 'bg-emerald-400'}`}
          />
        </div>
        <p className="text-secondary text-sm max-w-lg mx-auto">
          Live telemetry of the SUTRIX engine workers and resource utilization.
        </p>
        <div className="flex items-center justify-center gap-3 mt-4">
          <button
            onClick={() => setIsLive(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono border transition-all
              ${isLive
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                : 'bg-white/[0.04] border-white/[0.08] text-secondary'}`}
          >
            {isLive ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            {isLive ? 'LIVE' : 'PAUSED'}
          </button>
          <button
            onClick={fetchMetrics}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono border border-white/[0.08] text-secondary hover:text-white transition-all"
          >
            <RefreshCw className="w-3 h-3" /> Refresh
          </button>
          {lastUpdate && (
            <span className="text-xs text-white/20 font-mono">
              Updated {lastUpdate.toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {!metrics ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="grid md:grid-cols-4 gap-4 mb-8"
          >
            {[...Array(4)].map((_, i) => (
              <div key={i} className="glass p-6 rounded-2xl h-32 animate-pulse" />
            ))}
          </motion.div>
        ) : (
          <motion.div
            key="loaded"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
          >
            {/* Metric cards */}
            <div className="grid md:grid-cols-4 gap-4 mb-8">
              {[
                {
                  icon: <Cpu className="w-5 h-5 text-cyan-400" />,
                  label: 'CPU Load',
                  value: `${metrics.cpu_pct.toFixed(1)}%`,
                  bar: metrics.cpu_pct,
                  barColor: metrics.cpu_pct > 80 ? 'bg-rose-400' : metrics.cpu_pct > 60 ? 'bg-amber-400' : 'bg-cyan-400',
                },
                {
                  icon: <Server className="w-5 h-5 text-violet-400" />,
                  label: 'System RAM',
                  value: `${metrics.ram_pct.toFixed(1)}%`,
                  bar: metrics.ram_pct,
                  barColor: metrics.ram_pct > 90 ? 'bg-rose-400' : metrics.ram_pct > 75 ? 'bg-amber-400' : 'bg-violet-400',
                },
                {
                  icon: <Activity className="w-5 h-5 text-emerald-400" />,
                  label: 'Active Jobs',
                  value: metrics.active_jobs.toString(),
                  bar: Math.min((metrics.active_jobs / 4) * 100, 100),
                  barColor: 'bg-emerald-400',
                },
                {
                  icon: <Database className="w-5 h-5 text-amber-400" />,
                  label: 'Process RAM',
                  value: `${metrics.process_ram_mb.toFixed(0)} MB`,
                  bar: Math.min((metrics.process_ram_mb / 2048) * 100, 100),
                  barColor: 'bg-amber-400',
                },
              ].map(card => (
                <motion.div
                  key={card.label}
                  className="glass p-6 rounded-2xl flex flex-col"
                  whileHover={{ scale: 1.02 }}
                  transition={{ duration: 0.15 }}
                >
                  {card.icon}
                  <span className="text-xs text-muted uppercase tracking-wider mt-4 mb-1">{card.label}</span>
                  <AnimatePresence mode="wait">
                    <motion.span
                      key={card.value}
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-2xl font-bold text-white"
                    >
                      {card.value}
                    </motion.span>
                  </AnimatePresence>
                  <MetricBar value={card.bar} color={card.barColor} />
                </motion.div>
              ))}
            </div>

            {/* Engine diagnostics */}
            <div className="glass p-8 rounded-3xl">
              <h3 className="text-white font-medium mb-6">Engine Diagnostics</h3>
              <div className="space-y-3">
                <StatusBadge
                  label="WebSocket Connectivity"
                  value={`${metrics.ws_connections} CLIENT${metrics.ws_connections !== 1 ? 'S' : ''}`}
                  color={metrics.ws_connections > 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-white/[0.04] text-secondary'}
                />
                <StatusBadge
                  label="Worker Pool"
                  value={`${metrics.worker_pool_size} CORES`}
                  color="bg-cyan-500/10 text-cyan-400"
                />
                <StatusBadge
                  label="Available RAM"
                  value={`${metrics.available_ram_gb.toFixed(2)} GB`}
                  color={metrics.available_ram_gb < 1 ? 'bg-rose-500/10 text-rose-400' : 'bg-violet-500/10 text-violet-400'}
                />
                <StatusBadge
                  label="Pipeline Jobs (Total)"
                  value={metrics.total_jobs.toString()}
                  color="bg-amber-500/10 text-amber-400"
                />
                <StatusBadge
                  label="Memory Guard"
                  value={metrics.ram_pct > 95 ? 'EMERGENCY' : metrics.ram_pct > 90 ? 'WARNING' : 'HEALTHY'}
                  color={metrics.ram_pct > 95 ? 'bg-rose-500/10 text-rose-400' : metrics.ram_pct > 90 ? 'bg-amber-500/10 text-amber-400' : 'bg-emerald-500/10 text-emerald-400'}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
