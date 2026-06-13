import React from 'react';
import { useWorkspaceStore } from '../../../store/useWorkspaceStore';
import { useStudioInit } from '../../../hooks/useStudioInit';

// Lazy load LegacyWorkspaceApp from App.tsx to avoid circular dependency
const LegacyWorkspaceApp = React.lazy(() =>
  import('../../../App').then((m) => ({ default: m.LegacyWorkspaceApp }))
);

interface QSARStudioProps {
  onGoHub: () => void;
}

export const QSARStudio: React.FC<QSARStudioProps> = ({ onGoHub }) => {
  useStudioInit('qsar');
  const { currentStudioId } = useWorkspaceStore();

  if (currentStudioId !== 'qsar') {
    return null;
  }

  return (
    <React.Suspense fallback={null}>
      <LegacyWorkspaceApp studioId="qsar" onGoHub={onGoHub} />
    </React.Suspense>
  );
};
