import { useEffect, useState, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';
import type { JobTelemetry, JobStatus } from '../types';
import { useWorkspaceStore } from '../store/useWorkspaceStore';

interface UseWebSocketReturn {
  isConnected: boolean;
  progress: number;
  eta: number;
  speed: number;
  phase: string;
  logs: string[];
  jobStatus: JobStatus | 'IDLE';
  error: string | null;
  lastMessage: object | null;  // raw last parsed WS message for consumers
  connectToJob: (jobId: string) => void;
  resetSocketState: () => void;
}

export function useWebSocket(clientId: string): UseWebSocketReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [progress, setProgress] = useState(0);
  const [eta, setEta] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [phase, setPhase] = useState('Idle');
  const [logs, setLogs] = useState<string[]>([]);
  const [jobStatus, setJobStatus] = useState<JobStatus | 'IDLE'>('IDLE');
  const [error, setError] = useState<string | null>(null);
  const [lastMessage, setLastMessage] = useState<object | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const activeJobIdRef = useRef<string | null>(null);
  const reconnectTimeoutRef = useRef<any>(null);
  const reconnectAttemptsRef = useRef(0);
  const pollingIntervalRef = useRef<any>(null);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    setIsConnected(false);
  }, []);

  const handleJobMessage = useCallback((msg: any) => {
    setLastMessage(msg);  // expose raw message to consumers
    
    // Only filter by job_id for enrichment/segmentation messages
    // Upload/stage messages use workspace_id filter handled by consumer
    const isJobSpecific = msg.job_id && activeJobIdRef.current;
    if (isJobSpecific && msg.job_id !== activeJobIdRef.current) return;

    if ((msg.type === 'PROGRESS' || msg.type === 'PROGRESS_UPDATE') && msg.data) {
      const data: JobTelemetry = msg.data;
      const progressVal = typeof data.progress_pct === 'number'
        ? data.progress_pct
        : (typeof (data as any).progress === 'number' ? (data as any).progress : 0);
      
      setProgress(prev => Math.max(prev, progressVal));
      setEta(data.eta_seconds);
      setSpeed(data.compounds_per_sec || data.items_per_sec || 0);
      
      if (msg.data.active_node) {
        setPhase(msg.data.active_node);
      } else {
        setPhase(data.phase || data.stage_label || 'Processing...');
      }
      
      if (data.logs && data.logs.length > 0) {
        setLogs(prev => {
          // Merge logs unique by reference
          const newLogs = [...prev, ...data.logs];
          return Array.from(new Set(newLogs)).slice(-100); // Limit list buffer
        });
      }
    } else if (msg.type === 'JOB_COMPLETED') {
      setProgress(100);
      setJobStatus('COMPLETED');
      setPhase('Complete');
      toast.success('Computational toxicology job completed successfully!', {
        id: 'job-completed-' + (msg.job_id || activeJobIdRef.current || 'active'),
        icon: '🏁',
        duration: 5000,
        style: { background: '#0B132B', color: '#10B981', border: '1px solid rgba(16, 185, 129, 0.2)' }
      });
      
      // Store the new lineage (field: 'lineage')
      if (msg.data && msg.data.lineage) {
        useWorkspaceStore.getState().setActiveLineage(msg.data.lineage);
        useWorkspaceStore.getState().setSegregation(msg.data.lineage, true);
      }
      // Keep backward compat: also handle old 'graph' field
      if (msg.data && msg.data.graph) {
        useWorkspaceStore.getState().setActiveSegregationResult(msg.data);
        useWorkspaceStore.getState().setSegregation(msg.data.graph, true);
      }
      
      activeJobIdRef.current = null; // Prevent exponential reconnect loop
      disconnect();
    } else if (msg.type === 'JOB_FAILED') {
      setJobStatus('FAILED');
      setError(msg.error || 'Job execution failed');
      toast.error(`Job calculations failed: ${msg.error || 'Unknown Error'}`, {
        style: { background: '#0B132B', color: '#EF4444', border: '1px solid rgba(239, 68, 68, 0.2)' }
      });
      activeJobIdRef.current = null;
      disconnect();
    } else if (msg.type === 'JOB_CANCELLED') {
      setJobStatus('CANCELLED');
      toast('Job computations aborted by user.', {
        icon: '🛑',
        style: { background: '#0B132B', color: '#F59E0B', border: '1px solid rgba(245, 158, 11, 0.2)' }
      });
      activeJobIdRef.current = null;
      disconnect();
    }
  }, [disconnect]);

  const connect = useCallback((jobId: string) => {
    if (!clientId) return;
    disconnect();
    activeJobIdRef.current = jobId;
    setProgress(0);
    setEta(0);
    setSpeed(0);
    setPhase('Starting...');
    setError(null);
    
    // HTTP Fallback Polling — runs immediately and independently of WS connection
    if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
    pollingIntervalRef.current = setInterval(async () => {
      if (!activeJobIdRef.current) return;
      try {
        const res = await fetch(`/api/jobs/${activeJobIdRef.current}`);
        if (res.status === 404) {
          handleJobMessage({
            type: 'JOB_FAILED',
            job_id: activeJobIdRef.current,
            error: 'Job not found. The server may have restarted. Please re-run the operation.'
          });
          return;
        }
        if (res.ok) {
          const data = await res.json();
          const status = data.status;

          if (status === 'RUNNING' || status === 'QUEUED') {
            if (typeof data.progress === 'number') setProgress(prev => Math.max(prev, data.progress));
            if (typeof data.progress_pct === 'number') setProgress(prev => Math.max(prev, data.progress_pct));
            if (data.speed != null) setSpeed(data.speed);
            if (data.eta != null) setEta(data.eta);
            if (data.phase) setPhase(data.phase);
          } else if (status === 'COMPLETED' && data.result) {
            handleJobMessage({
              type: 'JOB_COMPLETED',
              job_id: activeJobIdRef.current,
              data: data.result
            });
          } else if (status === 'FAILED') {
            handleJobMessage({
              type: 'JOB_FAILED',
              job_id: activeJobIdRef.current,
              error: data.error || 'Job failed'
            });
          }
        }
      } catch (e) {
        // Ignore fetch errors during polling
      }
    }, 1000);

    // Dynamically calculate WebSocket URL based on location
    const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
      ? '127.0.0.1:8000' 
      : window.location.host;
      
    const wsUrl = `${wsProto}//${host}/ws/jobs/${clientId}`;
    
    try {
      const ws = new WebSocket(wsUrl);
      socketRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        reconnectAttemptsRef.current = 0;
        setError(null);
        setJobStatus('RUNNING');
        toast.success(`Connected to active calculation socket for Job ID: ${jobId.substring(0, 8)}...`, {
          icon: '🔌',
          style: { background: '#0B132B', color: '#06B6D4', border: '1px solid rgba(6, 182, 212, 0.2)' }
        });
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          
          if (msg.type === 'PING') {
            ws.send(JSON.stringify({ type: 'PONG' }));
            return;
          }
          
          handleJobMessage(msg);
        } catch (err) {
          console.error('Failed to parse socket message frame:', err);
        }
      };

      ws.onerror = () => {
        setIsConnected(false);
      };

      ws.onclose = () => {
        setIsConnected(false);
        // Exponential reconnect backoff if job is still running
        if (activeJobIdRef.current && reconnectAttemptsRef.current < 5) {
          const timeout = Math.pow(2, reconnectAttemptsRef.current) * 1000;
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttemptsRef.current += 1;
            connect(jobId);
          }, timeout);
        }
      };

    } catch (err: any) {
      setError(err.message || 'Failed to establish WebSocket connection');
    }
  }, [clientId, disconnect, handleJobMessage]);

  const connectToJob = useCallback((jobId: string) => {
    connect(jobId);
  }, [connect]);

  const resetSocketState = useCallback(() => {
    disconnect();
    activeJobIdRef.current = null;
    setProgress(0);
    setEta(0);
    setSpeed(0);
    setPhase('Idle');
    setLogs([]);
    setJobStatus('IDLE');
    setError(null);
  }, [disconnect]);

  // Auto-connect WebSocket on mount so we receive upload events immediately
  useEffect(() => {
    if (!clientId) return;
    const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
      ? '127.0.0.1:8000'
      : window.location.host;
    const wsUrl = `${wsProto}//${host}/ws/jobs/${clientId}`;
    try {
      const ws = new WebSocket(wsUrl);
      socketRef.current = ws;
      ws.onopen = () => { setIsConnected(true); setError(null); };
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          setLastMessage(msg);
          if (msg.type === 'PING') { ws.send(JSON.stringify({ type: 'PONG' })); }
        } catch { /* ignore */ }
      };
      ws.onerror = () => setIsConnected(false);
      ws.onclose = () => { setIsConnected(false); };
    } catch { /* no ws support */ }
    return () => {
      if (socketRef.current) socketRef.current.close();
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
    };
  }, [clientId]);

  return {
    isConnected, progress, eta, speed, phase, logs, jobStatus, error, lastMessage,
    connectToJob, resetSocketState
  };
}
