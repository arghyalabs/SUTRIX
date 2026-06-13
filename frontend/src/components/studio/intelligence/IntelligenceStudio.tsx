import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, Hexagon, Activity, Leaf, Users, Download } from 'lucide-react';
import { StudioShell, SidebarNavItem, SidebarSection } from '../StudioShell';
import { IntelligenceUploadPanel } from './IntelligenceUploadPanel';
import { ScaffoldPanel } from './ScaffoldPanel';
import { ActivityCliffPanel } from './ActivityCliffPanel';
import { DiversityPanel } from './DiversityPanel';
import { ReadAcrossPanel } from './ReadAcrossPanel';
import { useStudioInit } from '../../../hooks/useStudioInit';
import { useWorkspaceStore } from '../../../store/useWorkspaceStore';
import { workspaceApi } from '../../../services/workspaceApi';
import { toast } from 'react-hot-toast';

const API = 'http://127.0.0.1:8000';

const TABS = [
  { id: 'upload',    label: 'Upload Dataset',    icon: <Upload className="w-4 h-4" />,    desc: 'Load CSV dataset for analysis' },
  { id: 'scaffold',  label: 'Scaffold Analysis', icon: <Hexagon className="w-4 h-4" />,   desc: 'Murcko scaffold frequency & clustering' },
  { id: 'cliffs',    label: 'Activity Cliffs',   icon: <Activity className="w-4 h-4" />,  desc: 'High-ΔSAR cliff pair detection' },
  { id: 'diversity', label: 'Chemical Diversity', icon: <Leaf className="w-4 h-4" />,     desc: 'MW, logP, Lipinski Ro5 statistics' },
  { id: 'readacross',label: 'Read-Across',        icon: <Users className="w-4 h-4" />,    desc: 'k-NN similarity & activity prediction' },
];

interface Props { onGoHub: () => void; }

export const IntelligenceStudio: React.FC<Props> = ({ onGoHub }) => {
  const [tab, setTab] = useState('upload');
  useStudioInit('intelligence');
  const [session, setSession] = useState<any>(null);
  const { workspaceId, setWorkspaceId, currentStudioId } = useWorkspaceStore();
  const [clientId] = useState(() => workspaceId || `INT_${Math.random().toString(36).slice(2, 7)}`);

  if (currentStudioId !== 'intelligence') {
    return null;
  }

  React.useEffect(() => {
    if (clientId) setWorkspaceId(clientId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const handleReset = async () => {
    try {
      await workspaceApi.resetWorkspace(clientId);
      toast.success('Workspace reset successful.');
    } catch (e: any) {
      console.error('Failed to reset backend workspace:', e);
      toast.error('Failed to clear backend workspace state.');
    }
    useWorkspaceStore.getState().resetWorkspace();
    setSession(null);
    setTab('upload');
  };

  const sidebar = (
    <div className="flex flex-col h-full space-y-2">
      <SidebarSection label="Analysis Modules" />
      {TABS.map(t => {
        const disabled = t.id !== 'upload' && !session;
        return (
          <SidebarNavItem
            key={t.id}
            icon={t.icon}
            label={t.label}
            description={t.desc}
            isActive={tab === t.id}
            isDisabled={disabled}
            onClick={() => setTab(t.id)}
            accentClass="text-rose-400"
            activeBgClass="bg-rose-500/10"
            activeBorderClass="border-rose-400"
          />
        );
      })}

      {session && (
        <div className="mx-4 mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 space-y-1">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Active Dataset</div>
          <div className="text-sm text-slate-300 font-medium truncate">{session.filename}</div>
          <div className="text-xs text-slate-500">
            {session.rows?.toLocaleString()} rows · {session.cols} cols
          </div>
        </div>
      )}
    </div>
  );

  const p = { clientId, apiBase: API, session };

  return (
    <StudioShell
      studioId="intelligence"
      onPauseAndGoHub={onGoHub}
      sidebar={sidebar}
      onExport={session ? () => window.open(`${API}/api/intelligence/${clientId}/export?format=csv`, '_blank') : undefined}
      onReset={handleReset}
      datasetFilename={session?.filename}
      rowCount={session?.rows ?? 0}
      activeStep={TABS.find(t => t.id === tab)?.label}
    >
      <div className="h-full overflow-y-auto bg-[#030b18]">
        <AnimatePresence mode="wait">
          <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="p-6">
            {tab === 'upload'     && <IntelligenceUploadPanel {...p} onLoaded={info => { setSession(info); setTab('scaffold'); }} />}
            {tab === 'scaffold'   && session && <ScaffoldPanel {...p} />}
            {tab === 'cliffs'     && session && <ActivityCliffPanel {...p} />}
            {tab === 'diversity'  && session && <DiversityPanel {...p} />}
            {tab === 'readacross' && session && <ReadAcrossPanel {...p} />}
            {tab !== 'upload' && !session && (
              <div className="flex flex-col items-center justify-center h-64 text-center gap-4">
                <div className="p-4 rounded-2xl bg-rose-500/10 text-rose-400">
                  <Upload className="w-8 h-8" />
                </div>
                <div>
                  <div className="text-white font-bold text-base mb-1">Upload a Dataset First</div>
                  <div className="text-slate-500 text-sm">Go to "Upload Dataset" to load your chemical data.</div>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </StudioShell>
  );
};
