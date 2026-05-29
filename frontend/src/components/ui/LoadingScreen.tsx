import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LogoLoader } from './SUTRIXLogo';

const loadingMessages = [
  'Initializing Scientific Workspace...',
  'Parsing Dataset Structure...',
  'Detecting Toxicological Variables...',
  'Building Hierarchical Lineage...',
  'Canonicalizing SMILES...',
  'Generating Descriptor Matrix...',
  'Computing Readiness Metrics...',
];

interface LoadingScreenProps {
  isLoading: boolean;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({ isLoading }) => {
  const [msgIndex, setMsgIndex] = useState(0);

  useEffect(() => {
    if (!isLoading) return;
    const interval = setInterval(() => {
      setMsgIndex((prev) => (prev + 1) % loadingMessages.length);
    }, 1800);
    return () => clearInterval(interval);
  }, [isLoading]);

  return (
    <AnimatePresence>
      {isLoading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.8, ease: 'easeInOut' } }}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#050816] overflow-hidden"
        >
          {/* Subtle Background Glow */}
          <div className="absolute inset-0 pointer-events-none">
            <motion.div
              animate={{ opacity: [0.3, 0.5, 0.3] }}
              transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-cyan-500/[0.02] rounded-full blur-[100px]"
            />
            <motion.div
              animate={{ opacity: [0.2, 0.4, 0.2] }}
              transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-violet-500/[0.03] rounded-full blur-[80px]"
            />
          </div>

          {/* Animated Navbar Logo used as central loader */}
          <div className="relative z-10 mb-8">
            <LogoLoader size="w-24 h-24" compact />
          </div>

          {/* Loading Text and Progress */}
          <div className="flex flex-col items-center z-10 space-y-5">
            <div className="h-5 flex items-center justify-center overflow-hidden">
              <AnimatePresence mode="wait">
                <motion.p
                  key={msgIndex}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.4 }}
                  className="text-[10px] sm:text-xs font-semibold tracking-[0.2em] text-white/50 uppercase font-sans"
                >
                  {loadingMessages[msgIndex]}
                </motion.p>
              </AnimatePresence>
            </div>

            {/* Thin animated gradient line */}
            <div className="w-64 h-[1px] bg-white/[0.05] rounded-full overflow-hidden relative">
              <motion.div
                className="absolute top-0 left-0 bottom-0 w-1/3 rounded-full"
                style={{
                  background: 'linear-gradient(90deg, transparent, rgba(34,211,238,0.8), rgba(139,92,246,0.8), transparent)',
                }}
                animate={{
                  x: ['-100%', '300%'],
                }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                  ease: 'linear',
                }}
              />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
