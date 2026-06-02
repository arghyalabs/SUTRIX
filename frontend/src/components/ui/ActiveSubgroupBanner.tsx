import React from 'react';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';

interface ActiveSubgroupBannerProps {
  onChangeSubgroup?: () => void;
}

const STATE_COLORS: Record<string, { bg: string; color: string; label: string }> = {
  MOLECULAR: { bg: '#0d3d2e', color: '#00d4aa', label: 'MOLECULAR' },
  HYBRID: { bg: '#3d2d0a', color: '#f59e0b', label: 'HYBRID' },
  NAME_ONLY: { bg: '#3d0d0d', color: '#f87171', label: 'NAME ONLY' },
  UNKNOWN: { bg: '#1a1a2e', color: '#6b7280', label: 'UNKNOWN' },
};

const ActiveSubgroupBanner: React.FC<ActiveSubgroupBannerProps> = ({ onChangeSubgroup }) => {
  const {
    subgroupSelected,
    activeSubgroupName,
    activeSubgroupRows,
    activeSubgroupCompounds,
    structureState,
    smilesCoveragePct,
    clearActiveSubgroup,
  } = useWorkspaceStore();

  const [showConfirm, setShowConfirm] = React.useState(false);

  if (!subgroupSelected) return null;

  const stateStyle = STATE_COLORS[structureState] || STATE_COLORS.UNKNOWN;

  const handleChangeClick = () => setShowConfirm(true);
  const handleConfirm = () => {
    clearActiveSubgroup();
    setShowConfirm(false);
    onChangeSubgroup?.();
  };

  return (
    <>
      <div style={{
        background: 'linear-gradient(90deg, rgba(0,212,170,0.08) 0%, rgba(0,166,255,0.05) 100%)',
        border: '1px solid rgba(0,212,170,0.25)',
        borderRadius: '10px',
        padding: '10px 18px',
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        margin: '0 0 16px 0',
        flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: '18px' }}>⚗️</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
          <span style={{ fontSize: '11px', color: '#6b7280', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600 }}>Active Dataset</span>
          <span style={{ fontSize: '14px', color: '#e5e7eb', fontWeight: 700 }}>{activeSubgroupName || 'Active Subgroup'}</span>
        </div>
        <div style={{ width: '1px', height: '32px', background: 'rgba(255,255,255,0.1)', margin: '0 4px' }} />
        <StatPill label="Rows" value={activeSubgroupRows.toLocaleString()} />
        <StatPill label="Compounds" value={activeSubgroupCompounds.toLocaleString()} />
        {structureState !== 'UNKNOWN' && (
          <StatPill label="SMILES" value={`${smilesCoveragePct.toFixed(1)}%`} />
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{
            background: stateStyle.bg,
            color: stateStyle.color,
            border: `1px solid ${stateStyle.color}40`,
            borderRadius: '6px',
            padding: '3px 10px',
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '0.08em',
          }}>{stateStyle.label}</span>
          <button
            onClick={handleChangeClick}
            style={{
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: '6px',
              color: '#9ca3af',
              padding: '4px 12px',
              fontSize: '12px',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = '#f87171';
              e.currentTarget.style.color = '#f87171';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)';
              e.currentTarget.style.color = '#9ca3af';
            }}
          >Change</button>
        </div>
      </div>

      {showConfirm && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
        }}>
          <div style={{
            background: '#1a1b2e', border: '1px solid rgba(248,113,113,0.4)',
            borderRadius: '16px', padding: '32px', maxWidth: '440px', width: '90%'
          }}>
            <div style={{ fontSize: '24px', marginBottom: '12px' }}>⚠️</div>
            <h3 style={{ color: '#f1f5f9', marginBottom: '12px', fontSize: '18px', fontWeight: 700 }}>Change Active Subgroup?</h3>
            <p style={{ color: '#9ca3af', fontSize: '14px', lineHeight: '1.6', marginBottom: '24px' }}>
              This will clear all downstream data including descriptor generation, recovery results,
              and readiness assessments. You will need to re-run Steps 6–13 for the new subgroup.
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowConfirm(false)}
                style={{ background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: '8px', color: '#e5e7eb', padding: '10px 20px', cursor: 'pointer', fontSize: '14px' }}
              >Cancel</button>
              <button
                onClick={handleConfirm}
                style={{ background: 'linear-gradient(135deg, #dc2626, #b91c1c)', border: 'none', borderRadius: '8px', color: 'white', padding: '10px 20px', cursor: 'pointer', fontSize: '14px', fontWeight: 600 }}
              >Yes, Change Subgroup</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

const StatPill: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div style={{ textAlign: 'center' }}>
    <div style={{ fontSize: '10px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>{label}</div>
    <div style={{ fontSize: '13px', color: '#00d4aa', fontWeight: 700, marginTop: '1px' }}>{value}</div>
  </div>
);

export default ActiveSubgroupBanner;
