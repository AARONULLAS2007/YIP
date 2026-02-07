
import { TerminalConfig } from './types';

export const DEFAULT_CONFIG: TerminalConfig = {
  terminalName: 'Kottarakara',
  bayNumber: 'Bay 12',
  minRssiThreshold: -75,
  arrivalDurationThreshold: 3000, // 3 seconds of continuous reading
  audioAlertsEnabled: true,
};

export const MOCK_BUSES: Record<string, string> = {
  'E280-11AC-0001': 'Route 402 - Northgate',
  'E280-11AC-0002': 'Route 105 - University District',
  'E280-11AC-0003': 'Route 550 - Bellevue Express',
  'E280-11AC-0004': 'Route 7 - Rainier Beach',
};
