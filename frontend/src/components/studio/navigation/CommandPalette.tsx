import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkspaceStore } from '../../../store/useWorkspaceStore';
import { useStudioNavigation } from './StudioNavigationProvider';
import { Search, Compass, Settings, AlertTriangle, RefreshCw, LogOut, ArrowRight, Zap, History } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export const CommandPalette: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  
  const navigate = useNavigate();
  const store = useWorkspaceStore();
  const nav = useStudioNavigation();
  
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Toggle open/close on Ctrl+K or Cmd+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isK = e.key.toLowerCase() === 'k';
      const isCmdOrCtrl = e.metaKey || e.ctrlKey;
      
      if (isCmdOrCtrl && isK) {
        e.preventDefault();
        setIsOpen(prev => !prev);
      } else if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Reset indices and focus when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Build command list based on state
  const getCommands = () => {
    const list: {
      category: string;
      label: string;
      icon: React.ReactNode;
      shortcut?: string;
      action: () => void;
    }[] = [];

    // 1. Current Studio Steps
    if (nav && nav.steps && nav.steps.length > 0) {
      nav.steps.forEach((step) => {
        const isCurrent = step.id === nav.activeTab;
        const status = nav.getStepStatus(step.id);
        const isBlocked = status === 'blocked';
        
        list.push({
          category: 'Active Workflow Steps',
          label: `Jump to Step: ${step.label} ${isCurrent ? '(Current)' : ''}`,
          icon: step.icon || <Compass className="w-4 h-4" />,
          shortcut: isBlocked ? 'Locked' : 'Jump',
          action: () => {
            if (!isBlocked) {
              nav.handleJump(step.id);
              store.addRecentCommand(`Jump to: ${step.label}`);
              setIsOpen(false);
            }
          }
        });
      });
    }

    // 2. Switch Studios
    const studios: { id: string; name: string }[] = [
      { id: 'hierarchy', name: 'Hierarchy Builder & Segregation' },
      { id: 'analytics', name: 'Scientific Data Analysis' },
      { id: 'compound', name: 'Compound Explorer' },
      { id: 'normalization', name: 'Unit Harmonization & Normalization' },
      { id: 'qsar', name: 'QSAR & AI Engineering' },
      { id: 'intelligence', name: 'Scientific Intelligence' },
      { id: 'oecd', name: 'OECD Validation' }
    ];

    studios.forEach((studio) => {
      const isActive = store.currentStudioId === studio.id;
      list.push({
        category: 'Switch Studio',
        label: `Go to Studio: ${studio.name} ${isActive ? '(Active)' : ''}`,
        icon: <Zap className="w-4 h-4 text-cyan-400" />,
        action: () => {
          if (!isActive) {
            navigate(`/${studio.id}`);
            store.addRecentCommand(`Switch Studio: ${studio.name}`);
            setIsOpen(false);
          }
        }
      });
    });

    // 3. Platform Quick Actions
    list.push({
      category: 'Actions & Settings',
      label: 'Reset Current Step Inputs',
      icon: <RefreshCw className="w-4 h-4 text-amber-400" />,
      action: () => {
        nav.resetCurrentStep();
        setIsOpen(false);
      }
    });

    list.push({
      category: 'Actions & Settings',
      label: 'Reset Workspace (Clear State)',
      icon: <RefreshCw className="w-4 h-4 text-rose-400" />,
      action: () => {
        nav.resetStudioWorkspace();
        setIsOpen(false);
      }
    });

    list.push({
      category: 'Actions & Settings',
      label: 'Return to Hub Workspace Selection',
      icon: <LogOut className="w-4 h-4 text-slate-400" />,
      action: () => {
        navigate('/hub');
        setIsOpen(false);
      }
    });

    // 4. Dataset Searches
    if (store.filename) {
      list.push({
        category: 'Scientific Search',
        label: `Search Compounds in ${store.filename}`,
        icon: <Search className="w-4 h-4 text-emerald-400" />,
        action: () => {
          if (store.currentStudioId === 'compound') {
            store.setActiveTab('compound-explorer');
          } else {
            navigate('/compound');
          }
          setIsOpen(false);
        }
      });
    }

    return list;
  };

  const allCommands = getCommands();

  // Filter commands by query
  const filteredCommands = allCommands.filter(cmd =>
    cmd.label.toLowerCase().includes(query.toLowerCase()) ||
    cmd.category.toLowerCase().includes(query.toLowerCase())
  );

  // Keyboard navigation inside list
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % Math.max(1, filteredCommands.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + filteredCommands.length) % Math.max(1, filteredCommands.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const cmd = filteredCommands[selectedIndex];
      if (cmd) {
        cmd.action();
      }
    }
  };

  // Render recent commands when query is empty
  const renderedCommands = query === '' && store.recentCommands?.length > 0
    ? [
        ...store.recentCommands.map((label: string) => {
          // Find matching original command to execute its action
          const match = allCommands.find(c => c.label.includes(label) || label.includes(c.label));
          return {
            category: 'Recent Commands',
            label,
            icon: <History className="w-4 h-4 text-slate-500" />,
            shortcut: undefined,
            action: match ? match.action : () => {}
          };
        }),
        ...filteredCommands
      ]
    : filteredCommands;

  if (!isOpen) return null;

  let lastCat = '';

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4 bg-slate-950/70 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: -10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: -10 }}
        transition={{ duration: 0.15, ease: 'easeOut' }}
        className="w-full max-w-lg bg-[#070f1e]/90 border border-white/[0.08] shadow-[0_25px_60px_rgba(0,0,0,0.8)] rounded-2xl overflow-hidden flex flex-col"
        ref={containerRef}
      >
        {/* Search Input */}
        <div className="flex items-center px-4 py-3.5 border-b border-white/[0.06] gap-3">
          <Search className="w-5 h-5 text-cyan-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Type a command or search actions... (e.g., normal, reset, mapping)"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            className="outline-none bg-transparent placeholder-slate-500 text-sm text-white w-full border-none focus:ring-0 p-0"
          />
          <span className="text-[10px] font-mono font-bold bg-white/[0.04] border border-white/[0.08] text-slate-400 px-2 py-0.5 rounded shadow">
            ESC
          </span>
        </div>

        {/* Results List */}
        <div className="max-h-80 overflow-y-auto py-2 divide-y divide-white/[0.02] scrollbar-none">
          {renderedCommands.length > 0 ? (
            renderedCommands.map((cmd, idx) => {
              const isSelected = idx === selectedIndex;
              const showCat = cmd.category !== lastCat;
              lastCat = cmd.category;

              return (
                <div key={`${cmd.label}-${idx}`} className="flex flex-col">
                  {showCat && (
                    <div className="px-4 py-1.5 text-[9px] font-black uppercase text-slate-500 tracking-wider">
                      {cmd.category}
                    </div>
                  )}
                  <button
                    onClick={() => cmd.action()}
                    className={`w-full px-4 py-3 flex items-center justify-between text-left transition-all text-xs font-semibold
                      ${isSelected 
                        ? 'bg-cyan-500/10 border-l-2 border-cyan-400 text-white' 
                        : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.02]'
                      }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={isSelected ? 'text-cyan-400' : 'text-slate-500'}>
                        {cmd.icon}
                      </span>
                      <span className="truncate">{cmd.label}</span>
                    </div>
                    {cmd.shortcut && (
                      <span className="text-[9px] font-mono text-slate-600 bg-white/[0.02] px-1.5 py-0.5 rounded border border-white/[0.04]">
                        {cmd.shortcut}
                      </span>
                    )}
                  </button>
                </div>
              );
            })
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center text-slate-500 gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500/50" />
              <div className="text-xs">No matching commands found.</div>
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="px-4 py-2 border-t border-white/[0.06] bg-slate-950/40 flex items-center justify-between text-[9px] text-slate-500 select-none">
          <div className="flex items-center gap-3">
            <span>↑↓ Navigate</span>
            <span>Enter Select</span>
          </div>
          <span>Ctrl+K to toggle</span>
        </div>
      </motion.div>
    </div>
  );
};
