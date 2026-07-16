import React, { useEffect, useMemo, useState } from 'react';
import { Employee, MachineData, MachineStatus, Priority } from '../types';

type Props = {
  machine: MachineData;
  employees: Employee[];
  onClose: () => void;
  onSave: (updated: MachineData) => void;
};

const priorities: Priority[] = [Priority.LOW, Priority.MEDIUM, Priority.HIGH, Priority.URGENT];
const statuses: MachineStatus[] = [MachineStatus.FERMA, MachineStatus.ATTREZZAGGIO, MachineStatus.LAVORAZIONE];

export default function MachineDetailModal({ machine, employees, onClose, onSave }: Props) {
  const [draft, setDraft] = useState<MachineData>(machine);

  useEffect(() => {
    setDraft(machine);
  }, [machine]);

  const allEmployeeNames = useMemo(() => employees.map((e) => e.name), [employees]);

  const toggleEmployee = (name: string) => {
    setDraft((prev) => {
      const exists = prev.assignedEmployees.includes(name);
      return {
        ...prev,
        assignedEmployees: exists
          ? prev.assignedEmployees.filter((n) => n !== name)
          : [...prev.assignedEmployees, name],
      };
    });
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-100 my-8">
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white px-6 py-5 flex items-center justify-between">
          <div className="min-w-0">
            <div className="text-xs font-black uppercase tracking-wider text-white/80">Dettagli macchina</div>
            <div className="text-base font-black truncate">
              {draft.name} <span className="text-white/60 text-sm">({draft.id.toUpperCase()})</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white/80 hover:text-white hover:bg-white/10 p-1.5 rounded-lg transition-all"
            title="Chiudi"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="space-y-1">
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Lavoro / commessa</div>
              <input
                value={draft.currentJob}
                onChange={(e) => setDraft((p) => ({ ...p, currentJob: e.target.value }))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-800"
                placeholder="Es: Art. 12345 / Staffa / Tornitura..."
              />
            </label>

            <label className="space-y-1">
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tempo</div>
              <input
                value={draft.processTime}
                onChange={(e) => setDraft((p) => ({ ...p, processTime: e.target.value }))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-800"
                placeholder="Es: 2h 15m / 45 min"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="space-y-1">
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Stato</div>
              <select
                value={draft.status}
                onChange={(e) => setDraft((p) => ({ ...p, status: e.target.value as MachineStatus }))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-800"
              >
                {statuses.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Priorità</div>
              <select
                value={draft.priority}
                onChange={(e) => setDraft((p) => ({ ...p, priority: e.target.value as Priority }))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-800"
              >
                {priorities.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="space-y-1 block">
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Note</div>
            <textarea
              value={draft.notes}
              onChange={(e) => setDraft((p) => ({ ...p, notes: e.target.value }))}
              rows={4}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800"
              placeholder="Diametri, note di fermo, attrezzaggio, info utili..."
            />
          </label>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Operatori assegnati</div>
              <div className="text-[10px] font-black text-slate-400">
                {draft.assignedEmployees.length} selezionati
              </div>
            </div>

            <div className="flex flex-wrap gap-2 bg-slate-50 border border-slate-200/70 rounded-xl p-3">
              {allEmployeeNames.length === 0 ? (
                <div className="text-xs text-slate-500">Nessun operatore disponibile.</div>
              ) : (
                allEmployeeNames.map((name) => {
                  const active = draft.assignedEmployees.includes(name);
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => toggleEmployee(name)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all border ${
                        active
                          ? 'bg-blue-600 text-white border-blue-700'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {name}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 font-black text-xs uppercase tracking-wider hover:bg-slate-50"
            >
              Annulla
            </button>
            <button
              type="button"
              onClick={() => onSave(draft)}
              className="px-4 py-2 rounded-xl bg-slate-900 text-white font-black text-xs uppercase tracking-wider hover:bg-slate-800 shadow-sm"
            >
              Salva
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

