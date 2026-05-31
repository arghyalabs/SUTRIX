import React from 'react';
import { motion } from 'framer-motion';

interface SUTRIXLogoProps {
  className?: string;
  glowIntensity?: number;
}

/**
 * Static SUTRIX brand logo — molecular node graph.
 * Kept for non-animated usages.
 */
export const SUTRIXLogo: React.FC<SUTRIXLogoProps> = ({
  className = 'w-8 h-8',
  glowIntensity = 0.5,
}) => (
  <div className={`relative flex items-center justify-center ${className}`}>
    <svg
      viewBox="0 0 100 100"
      className="w-full h-full"
      style={{ filter: `drop-shadow(0 0 ${Math.round(glowIntensity * 18)}px rgba(34,211,238,${glowIntensity * 0.7}))` }}
    >
      <defs>
        <linearGradient id="logo-grad-static" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#22d3ee" />
          <stop offset="100%" stopColor="#8b5cf6" />
        </linearGradient>
        <linearGradient id="line-grad-static" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="rgba(34,211,238,0.7)" />
          <stop offset="100%" stopColor="rgba(139,92,246,0.7)" />
        </linearGradient>
      </defs>

      <path d="M 25 45 L 75 25 L 60 75 L 25 45 Z" fill="none" stroke="url(#line-grad-static)" strokeWidth="2.5" strokeLinejoin="round" />
      <line x1="25" y1="45" x2="60" y2="75" stroke="url(#line-grad-static)" strokeWidth="2.5" />
      <line x1="50" y1="50" x2="75" y2="25" stroke="url(#line-grad-static)" strokeWidth="2.5" />

      <circle cx="25" cy="45" r="7.5" fill="url(#logo-grad-static)" />
      <circle cx="75" cy="25" r="9.5" fill="url(#logo-grad-static)" />
      <circle cx="60" cy="75" r="8.5" fill="url(#logo-grad-static)" />
      <circle cx="50" cy="50" r="11" fill="url(#logo-grad-static)" />
    </svg>
  </div>
);

/**
 * Advanced Animated Logo Loader.
 * Features microscopic atom drift, bond flexing, and pseudo-3D container tumble.
 * Premium silver/white aesthetic per the new design system.
 */
export const LogoLoader: React.FC<{
  size?: string;
  label?: string;
  compact?: boolean;
  className?: string;
}> = ({ size = 'w-10 h-10', label, compact = false, className = '' }) => {
  
  const spinner = (
    <motion.div 
      className={`relative flex items-center justify-center cursor-pointer ${className}`} 
      style={{ perspective: 800 }}
      whileHover={{ scale: 1.05 }}
    >
      {/* 3D tumbling container */}
      <motion.div
        animate={{
          rotateY: [0, 20, 0, -20, 0],
          rotateX: [0, -10, 0, 10, 0],
          rotateZ: [0, 5, 0, -5, 0],
          y: [-2, 2, -2]
        }}
        transition={{
          rotateY: { duration: 15, repeat: Infinity, ease: 'easeInOut' },
          rotateX: { duration: 12, repeat: Infinity, ease: 'easeInOut' },
          rotateZ: { duration: 18, repeat: Infinity, ease: 'easeInOut' },
          y: { duration: 6, repeat: Infinity, ease: 'easeInOut' }
        }}
        style={{ transformStyle: 'preserve-3d' }}
        className={size}
      >
        <svg
          viewBox="0 0 100 100"
          className="w-full h-full drop-shadow-[0_0_12px_rgba(34,211,238,0.4)]"
        >
          <defs>
            <linearGradient id="logo-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#22d3ee" />
              <stop offset="100%" stopColor="#8b5cf6" />
            </linearGradient>
            <linearGradient id="line-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="rgba(34,211,238,0.6)" />
              <stop offset="100%" stopColor="rgba(139,92,246,0.6)" />
            </linearGradient>
          </defs>

          {/* Flexible bonds using motion.path to morph 'd' slightly */}
          <motion.path
            fill="none" 
            stroke="url(#line-grad)" 
            strokeWidth="2.5" 
            strokeLinejoin="round"
            d="M 25 45 L 75 25 L 60 75 L 25 45 Z"
            animate={{
              d: [
                "M 25 45 L 75 25 L 60 75 L 25 45 Z",
                "M 23 46 L 73 24 L 62 76 L 23 46 Z",
                "M 27 44 L 77 26 L 58 74 L 27 44 Z",
                "M 25 45 L 75 25 L 60 75 L 25 45 Z"
              ]
            }}
            transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.line
            stroke="url(#line-grad)" strokeWidth="2.5"
            x1="25" y1="45" x2="60" y2="75"
            animate={{ x1: [25, 23, 27, 25], y1: [45, 46, 44, 45], x2: [60, 62, 58, 60], y2: [75, 76, 74, 75] }}
            transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.line
            stroke="url(#line-grad)" strokeWidth="2.5"
            x1="50" y1="50" x2="75" y2="25"
            animate={{ x1: [50, 49, 51, 50], y1: [50, 51, 49, 50], x2: [75, 73, 77, 75], y2: [25, 24, 26, 25] }}
            transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
          />

          {/* Drifting atoms */}
          <motion.circle 
            r="7.5" fill="url(#logo-grad)" 
            cx="25" cy="45"
            animate={{ cx: [25, 23, 27, 25], cy: [45, 46, 44, 45] }}
            transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.circle 
            r="9.5" fill="url(#logo-grad)" 
            cx="75" cy="25"
            animate={{ cx: [75, 73, 77, 75], cy: [25, 24, 26, 25] }}
            transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.circle 
            r="8.5" fill="url(#logo-grad)" 
            cx="60" cy="75"
            animate={{ cx: [60, 62, 58, 60], cy: [75, 76, 74, 75] }}
            transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.circle 
            r="11" fill="url(#logo-grad)" 
            cx="50" cy="50"
            animate={{ cx: [50, 49, 51, 50], cy: [50, 51, 49, 50] }}
            transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
          />
        </svg>
      </motion.div>
    </motion.div>
  );

  if (compact) return spinner;

  return (
    <div className="flex flex-col items-center justify-center gap-4">
      {spinner}
      {label && (
        <motion.p
          animate={{ opacity: [0.4, 0.8, 0.4] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          className="text-xs font-semibold uppercase tracking-[0.2em] text-white/50 font-sans"
        >
          {label}
        </motion.p>
      )}
    </div>
  );
};
