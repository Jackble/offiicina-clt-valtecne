
export enum Priority {
  LOW = 'Low',
  MEDIUM = 'Medium',
  HIGH = 'High',
  URGENT = 'Urgent'
}

export enum MachineStatus {
  ATTREZZAGGIO = 'Attrezzaggio',
  FERMA = 'Ferma',
  LAVORAZIONE = 'In Lavorazione'
}

export interface MachineData {
  id: string;
  name: string;
  type: 'machine' | 'office' | 'area';
  assignedEmployees: string[];
  currentJob: string;
  processTime: string; // Tempo di lavorazione (es. "2h 30m" o "30 min")
  notes: string;
  priority: Priority;
  status: MachineStatus;
}

export interface Employee {
  id: string;
  name: string;
}

export interface MachineConfig {
  id: string;
  name: string;
  type: 'machine' | 'office' | 'area';
  row: number;
  col: number;
  spanCol?: number;
  spanRow?: number;
}
