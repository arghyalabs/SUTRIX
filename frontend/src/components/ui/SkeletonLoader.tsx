import React from 'react';

interface SkeletonProps {
  className?: string;
}

const shimmer = "animate-pulse bg-white/[0.06] rounded-xl";

export const SkeletonCard: React.FC<SkeletonProps> = ({ className = "" }) => (
  <div className={`${shimmer} h-24 ${className}`} />
);

export const SkeletonText: React.FC<{ lines?: number; className?: string }> = ({ lines = 3, className = "" }) => (
  <div className={`space-y-2 ${className}`}>
    {Array.from({ length: lines }).map((_, i) => (
      <div
        key={i}
        className={`h-3 rounded-md bg-white/[0.06] animate-pulse`}
        style={{ width: `${100 - i * 15}%`, animationDelay: `${i * 80}ms` }}
      />
    ))}
  </div>
);

export const SkeletonChart: React.FC<SkeletonProps> = ({ className = "" }) => (
  <div className={`${shimmer} flex items-end gap-1.5 p-4 h-48 ${className}`}>
    {[40, 70, 55, 85, 60, 75, 45, 90, 65, 50].map((h, i) => (
      <div
        key={i}
        className="flex-1 rounded-t-sm bg-white/[0.08] animate-pulse"
        style={{ height: `${h}%`, animationDelay: `${i * 60}ms` }}
      />
    ))}
  </div>
);

export const SkeletonTable: React.FC<{ rows?: number; cols?: number; className?: string }> = ({
  rows = 5,
  cols = 4,
  className = "",
}) => (
  <div className={`overflow-hidden rounded-xl border border-white/[0.06] ${className}`}>
    {/* Header */}
    <div className="flex gap-4 px-4 py-3 bg-white/[0.03] border-b border-white/[0.06]">
      {Array.from({ length: cols }).map((_, i) => (
        <div key={i} className="flex-1 h-3 rounded-md bg-white/[0.1] animate-pulse" />
      ))}
    </div>
    {/* Rows */}
    {Array.from({ length: rows }).map((_, r) => (
      <div key={r} className="flex gap-4 px-4 py-3 border-b border-white/[0.03]">
        {Array.from({ length: cols }).map((_, c) => (
          <div
            key={c}
            className="flex-1 h-3 rounded-md bg-white/[0.04] animate-pulse"
            style={{ animationDelay: `${(r * cols + c) * 40}ms` }}
          />
        ))}
      </div>
    ))}
  </div>
);

export const SkeletonWorkspace: React.FC = () => (
  <div className="max-w-5xl mx-auto py-8 space-y-6">
    <div className="text-center space-y-3 mb-10">
      <div className="h-8 w-48 mx-auto rounded-xl bg-white/[0.06] animate-pulse" />
      <div className="h-4 w-72 mx-auto rounded-lg bg-white/[0.04] animate-pulse" />
    </div>
    <div className="grid md:grid-cols-3 gap-4">
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonCard />
    </div>
    <SkeletonTable />
    <SkeletonChart />
  </div>
);
