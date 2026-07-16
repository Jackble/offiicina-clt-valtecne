import React from 'react';
import { MachineConfig, MachineData, MachineStatus, Priority } from '../types';

type Props = {
  data: MachineData;
  config: MachineConfig;
  onClick: () => void;
  onDropEmployee: (employeeName: string) => void;
  onRemoveEmployee: (employeeName: string) => void;
  onToggleStatus: () => void;
};

const priorityBadge = (priority: Priority) => {
  switch (priority) {
    case Priority.URGENT:
      return 'bg-rose-600 text-white border-rose-700';
    case Priority.HIGH:
      return 'bg-amber-600 text-white border-amber-700';
    case Priority.MEDIUM:
      return 'bg-blue-600 text-white border-blue-700';
    case Priority.LOW:
    default:
      return 'bg-emerald-600 text-white border-emerald-700';
  }
};

const statusBadge = (status: MachineStatus) => {
  switch (status) {
    case MachineStatus.LAVORAZIONE:
      return 'bg-emerald-500 text-white border-emerald-600';
    case MachineStatus.ATTREZZAGGIO:
      return 'bg-amber-500 text-white border-amber-600';
    case MachineStatus.FERMA:
    default:
      return 'bg-rose-500 text-white border-rose-600';
  }
};

export default function MachineCard({
  data,
  onClick,
  onDropEmployee,
  onRemoveEmployee,
  onToggleStatus,
}: Props) {
  const handleDrop: React.DragEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    const name = e.dataTransfer.getData('text/plain');
    if (name) onDropEmployee(name);
  };

  const handleDragOver: React.DragEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
  };

  const isBusy = Boolean(data.currentJob) || data.assignedEmployees.length > 0;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onClick();
      }}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      className={`select-none rounded-2xl border-2 shadow-sm bg-white hover:shadow-md transition-all cursor-pointer active:scale-[0.99] ${
        isBusy ? 'border-slate-300' : 'border-slate-200'
      }`}
    >
      <div className="p-3 flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="text-xs font-black text-slate-800 truncate">{data.name}</div>
              <span className="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-black uppercase tracking-tight">
                {data.id.toUpperCase()}
              </span>
            </div>
            {data.currentJob ? (
              <div className="text-[11px] font-bold text-slate-650 mt-1 truncate">
                Lavoro: <span className="text-slate-900 font-black">{data.currentJob}</span>
              </div>
            ) : (
              <div className="text-[11px] text-slate-400 italic mt-1">Libera</div>
            )}
          </div>

          <div className="flex flex-col items-end gap-1 shrink-0">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleStatus();
              }}
              className={`px-2.5 py-1 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all border shadow-sm ${statusBadge(
                data.status
              )}`}
              title="Cambia stato"
            >
              {data.status === MachineStatus.LAVORAZIONE ? 'Lavoro' : data.status}
            </button>
            <span
              className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider border ${priorityBadge(
                data.priority
              )}`}
              title="Priorità"
            >
              {data.priority}
            </span>
          </div>
        </div>

        {data.processTime ? (
          <div className="text-[10px] text-slate-500">
            Tempo: <span className="font-bold text-slate-700">{data.processTime}</span>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-1 items-center bg-slate-50 p-2 rounded-xl text-[11px] border border-slate-100">
          {data.assignedEmployees.length === 0 ? (
            <span className="text-slate-400 italic">Trascina qui un operatore</span>
          ) : (
            data.assignedEmployees.map((name) => (
              <button
                type="button"
                key={name}
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveEmployee(name);
                }}
                className="px-2 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 font-bold hover:bg-rose-50 hover:border-rose-200"
                title="Rimuovi operatore"
              >
                {name}
              </button>
            ))
          )}
        </div>

        {data.notes ? (
          <div className="text-[10px] text-slate-500 line-clamp-2">
            Note: <span className="font-medium text-slate-600">{data.notes}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

