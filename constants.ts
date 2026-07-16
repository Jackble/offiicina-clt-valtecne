
import { MachineConfig, Priority } from './types';

export const INITIAL_EMPLOYEES = [
  // Lasciamo vuoto: lo staff viene popolato da PDF oppure inserito manualmente.
];

export const MACHINE_LAYOUT: MachineConfig[] = [
  // Row 1 (Top Row)
  { id: 'clt25', name: 'CLT 25', type: 'machine', row: 1, col: 1 },
  { id: 'clt24', name: 'CLT 24', type: 'machine', row: 1, col: 2 },
  { id: 'clt23', name: 'CLT 23', type: 'machine', row: 1, col: 3 },
  { id: 'clt22', name: 'CLT 22', type: 'machine', row: 1, col: 4 },

  // Row 2 (Mid-Top Row)
  { id: 'clt28', name: 'CLT 28', type: 'machine', row: 2, col: 1 },
  { id: 'clt21', name: 'CLT 21', type: 'machine', row: 2, col: 2 },
  { id: 'clt20', name: 'CLT 20', type: 'machine', row: 2, col: 3 },

  // Row 3 (Small cluster right)
  { id: 'clt6', name: 'CLT 6', type: 'machine', row: 3, col: 4 },
  { id: 'clv10', name: 'CLV 10', type: 'machine', row: 3, col: 5 },

  // Row 4
  { id: 'clt15', name: 'CLT 15', type: 'machine', row: 4, col: 3 },
  { id: 'clt12', name: 'CLT 12', type: 'machine', row: 4, col: 4 },
  { id: 'clo15', name: 'CLO 15', type: 'machine', row: 4, col: 5 },

  // Row 5
  { id: 'clt17', name: 'CLT 17', type: 'machine', row: 5, col: 1, spanRow: 2 },
  { id: 'clt16', name: 'CLT 16', type: 'machine', row: 5, col: 3 },
  { id: 'clt5', name: 'CLT 5', type: 'machine', row: 5, col: 4 },
  { id: 'clt9', name: 'CLT 9', type: 'machine', row: 5, col: 5 },

  // Row 6
  { id: 'clt14', name: 'CLT 14', type: 'machine', row: 6, col: 3 },
  { id: 'clt7', name: 'CLT 7', type: 'machine', row: 6, col: 4 },
  { id: 'clt10', name: 'CLT 10', type: 'machine', row: 6, col: 5 },

  // Row 7
  { id: 'clt13', name: 'CLT 13', type: 'machine', row: 7, col: 4 },
  { id: 'clt11', name: 'CLT 11', type: 'machine', row: 7, col: 5 },

  // Row 8 (Bottom row)
  { id: 'clt19', name: 'CLT 19', type: 'machine', row: 8, col: 3 },
  { id: 'clt27', name: 'CLT 27', type: 'machine', row: 8, col: 4 },
  { id: 'clt26', name: 'CLT 26', type: 'machine', row: 8, col: 5 },
];

export const PRIORITY_COLORS: Record<Priority, string> = {
  [Priority.LOW]: 'bg-green-100 border-green-300 text-green-800',
  [Priority.MEDIUM]: 'bg-blue-100 border-blue-300 text-blue-800',
  [Priority.HIGH]: 'bg-orange-100 border-orange-300 text-orange-800',
  [Priority.URGENT]: 'bg-red-100 border-red-300 text-red-800',
};
