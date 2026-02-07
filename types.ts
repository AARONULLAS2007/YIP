
export enum BusState {
  NOT_PRESENT = 'NOT_PRESENT',
  APPROACHING = 'APPROACHING',
  ARRIVED = 'ARRIVED',
  DEPARTING = 'DEPARTING',
  PASSING = 'PASSING'
}

export interface RFIDRead {
  id: string;
  tagId: string;
  rssi: number; // Signal strength in dBm
  timestamp: number;
  route: string;
  duration?: number;
}

export interface BusStatus {
  tagId: string;
  route: string;
  state: BusState;
  confidence: number;
  lastSeen: number;
  firstSeen: number;
  avgRssi: number;
  description: string; // AI generated description
}

export interface HardwareHealth {
  status: 'connected' | 'disconnected' | 'error' | 'idle';
  lastReadTime: number | null;
  batteryLevel: number;
  linkQuality: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR';
  isScanning: boolean;
  faults: string[];
}

export interface TerminalConfig {
  terminalName: string;
  bayNumber: string;
  minRssiThreshold: number;
  arrivalDurationThreshold: number; // ms
  audioAlertsEnabled: boolean;
}

export interface AppState {
  config: TerminalConfig;
  isConnected: boolean;
  health: HardwareHealth;
  currentBus: BusStatus | null;
  history: RFIDRead[];
}
