import React, { useState } from 'react';
import { AlertCircle, Loader2, Plus, Trash2, ArrowRightLeft, Info, CheckCircle2 } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface PanelProps { clientId: string; apiBase: string; }

interface ConversionRow {
  id: string;
  col: string;
  fromUnit: string;
  toUnit: string;
  newColName: string;
  useMw: boolean;
  mwScalar: string;
  preview: number[] | null;
  status: 'idle' | 'loading' | 'ok' | 'error';
  errorMsg: string;
  warnings: string[];
}

const UNITS = [
  'mg/L', 'µg/L', 'ng/L', 'µmol/L', 'mmol/L', 'mol/L', 'nmol/L',
  'mg/kg', 'µg/kg', 'ng/kg', '%', 'hours', 'days', 'weeks', '°C', 'K', 'pH', 'g/mol'
];

const MW_REQUIRED = new Set([
  'mg/L→µmol/L', 'µg/L→µmol/L', 'µmol/L→mg/L',
  'mg/L→mmol/L', 'mg/L→mol/L',
]);

const needsMW = (from: string, to: string) => MW_REQUIRED.has(`${from}→${to}`);

const genId = () => Math.random().toString(36).substring(2, 9);

export const UnitConversionPanel: React.FC<PanelProps> = ({ clientId, apiBase }) => {
  const [rows, setRows] = useState<ConversionRow[]>([
    { id: genId(), col: '', fromUnit: 'mg/L', toUnit: 'µmol/L', newColName: '', useMw: false, mwScalar: '', preview: null, status: 'idle', errorMsg: '', warnings: [] }
  ]);

  const updateRow = (id: string, patch: Partial<ConversionRow>) =>
    setRows(rs => rs.map(r => r.id === id ? { ...r, ...patch } : r));

  const addRow = () => setRows(rs => [...rs, { id: genId(), col: '', fromUnit: 'mg/L', toUnit: 'µmol/L', newColName: '', useMw: false, mwScalar: '', preview: null, status: 'idle', errorMsg: '', warnings: [] }]);
  const removeRow = (id: string) => setRows(rs => rs.filter(r => r.id !== id));

  const previewRow = async (row: ConversionRow) => {
    if (!row.col) { toast.error('Enter a column name'); return; }
    updateRow(row.id, { status: 'loading', preview: null, errorMsg: '', warnings: [] });
    try {
      const body = {
        conversions: [{
          col: row.col,
          from_unit: row.fromUnit,
          to_unit: row.toUnit,
          use_mw: row.useMw,
          mw_scalar: row.mwScalar ? parseFloat(row.mwScalar) : null,
          new_col_name: row.newColName || undefined,
        }]
      };
      const r = await fetch(`${apiBase}/api/normalization/${clientId}/convert-units`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const data = await r.json();
      const res = data.results?.[0];
      if (res?.status === 'ok') {
        updateRow(row.id, { status: 'ok', preview: res.preview, warnings: res.warnings || [] });
      } else {
        updateRow(row.id, { status: 'error', errorMsg: res?.message || 'Conversion failed' });
      }
    } catch (e: any) {
      updateRow(row.id, { status: 'error', errorMsg: e.message });
    }
  };

  return (
    <div className="space-y-4">
      {/* Info banner */}
      <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/5 border border-amber-500/10 text-xs text-amber-300/80">
        <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <div>
          Conversions between <strong>mass</strong> and <strong>molar</strong> units (e.g., mg/L → µmol/L) require molecular weight.
          Provide a single MW value for the column, or ensure a MW column is present in your dataset.
        </div>
      </div>

      {/* Conversion rows */}
      <div className="space-y-3">
        {rows.map(row => (
          <div key={row.id} className="p-4 rounded-xl border border-white/[0.06] bg-white/[0.02] space-y-3">
            {/* Row 1: Column + units */}
            <div className="flex items-center gap-2 flex-wrap">
              <input
                value={row.col}
                onChange={e => updateRow(row.id, { col: e.target.value })}
                placeholder="Column name"
                className="px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white text-xs font-mono w-40 focus:outline-none focus:border-amber-500/40"
              />
              <select
                value={row.fromUnit}
                onChange={e => updateRow(row.id, { fromUnit: e.target.value })}
                className="px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white text-xs w-32 focus:outline-none focus:border-amber-500/40"
              >
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
              <ArrowRightLeft className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
              <select
                value={row.toUnit}
                onChange={e => updateRow(row.id, { toUnit: e.target.value })}
                className="px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white text-xs w-32 focus:outline-none focus:border-amber-500/40"
              >
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
              <input
                value={row.newColName}
                onChange={e => updateRow(row.id, { newColName: e.target.value })}
                placeholder="New column name (optional)"
                className="px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white text-xs font-mono flex-1 min-w-[140px] focus:outline-none focus:border-amber-500/40"
              />
            </div>

            {/* MW row (conditional) */}
            {needsMW(row.fromUnit, row.toUnit) && (
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-500/5 border border-amber-500/10">
                <Info className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                <span className="text-xs text-amber-300/80">MW-assisted conversion:</span>
                <input
                  value={row.mwScalar}
                  onChange={e => updateRow(row.id, { mwScalar: e.target.value })}
                  placeholder="Molecular weight (g/mol)"
                  type="number"
                  className="px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white text-xs w-48 focus:outline-none focus:border-amber-500/40"
                />
                <span className="text-[10px] text-amber-400/60">Formula: µmol/L = mg/L × 1000 / MW</span>
              </div>
            )}

            {/* Actions + status */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => previewRow(row)}
                disabled={row.status === 'loading'}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-semibold hover:bg-amber-500/20 transition-all disabled:opacity-50"
              >
                {row.status === 'loading' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRightLeft className="w-3.5 h-3.5" />}
                Preview
              </button>
              <button
                onClick={() => removeRow(row.id)}
                className="p-1.5 rounded-lg text-rose-500/50 hover:text-rose-400 hover:bg-rose-500/10 transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>

              {row.status === 'ok' && row.preview && (
                <div className="flex items-center gap-2 ml-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-[10px] text-slate-500">Preview:</span>
                  <span className="font-mono text-[10px] text-emerald-300">
                    [{row.preview.map(v => v?.toFixed(4)).join(', ')}]
                  </span>
                </div>
              )}
              {row.status === 'error' && (
                <span className="text-xs text-rose-400 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />{row.errorMsg}
                </span>
              )}
            </div>

            {/* Warnings */}
            {row.warnings.length > 0 && (
              <div className="space-y-1">
                {row.warnings.map((w, i) => (
                  <div key={i} className="text-[10px] text-amber-400/70 flex items-center gap-1">
                    <span>⚠</span> {w}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <button
        onClick={addRow}
        className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-dashed border-white/[0.10] text-slate-500 text-xs hover:border-amber-500/30 hover:text-amber-400 transition-all w-full justify-center"
      >
        <Plus className="w-3.5 h-3.5" /> Add Conversion
      </button>
    </div>
  );
};
