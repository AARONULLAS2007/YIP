
import { RFIDRead, HardwareHealth } from "../types";
import { MOCK_BUSES } from "../constants";

export type ConnectionType = 'USB' | 'BT' | 'NONE';

export class HardwareService {
  // Use any for experimental browser types that might be missing in default TS lib configuration
  private usbDevice: any | null = null;
  private btDevice: any | null = null;
  private onReadCallback: (read: RFIDRead) => void = () => {};
  private onHealthCallback: (health: HardwareHealth) => void = () => {};
  
  private lastReadTimestamp: number | null = null;
  private mockBattery: number = 85;
  private rssiHistory: number[] = [];
  private preferredConnectionType: ConnectionType = 'NONE';
  private isReconnecting: boolean = false;

  constructor() {
    // Start internal health monitoring loop
    setInterval(() => this.monitorHealth(), 5000);
    
    // Listen for global USB disconnection - casting navigator to any to access experimental WebUSB API
    if ((navigator as any).usb) {
      (navigator as any).usb.addEventListener('disconnect', (event: any) => {
        if (this.usbDevice === event.device) {
          console.warn("USB Device disconnected unexpectedly.");
          this.handleUnexpectedDisconnect();
        }
      });
    }
  }

  private handleUnexpectedDisconnect() {
    this.usbDevice = null;
    this.btDevice = null; // Clear both just in case
    this.monitorHealth();
    
    if (this.preferredConnectionType !== 'NONE' && !this.isReconnecting) {
      this.attemptAutoReconnect();
    }
  }

  private async attemptAutoReconnect() {
    this.isReconnecting = true;
    console.log(`Attempting auto-reconnect to ${this.preferredConnectionType}...`);
    
    let success = false;
    let attempts = 0;
    const maxAttempts = 5;

    while (!success && attempts < maxAttempts && this.preferredConnectionType !== 'NONE') {
      attempts++;
      try {
        if (this.preferredConnectionType === 'USB') {
          success = await this.tryReconnectUSB();
        } else if (this.preferredConnectionType === 'BT') {
          success = await this.tryReconnectBT();
        }
        
        if (success) {
          console.log("Auto-reconnect successful.");
          break;
        }
      } catch (e) {
        console.error("Reconnect attempt failed", e);
      }
      
      // Wait before next attempt (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, Math.min(10000, 1000 * Math.pow(2, attempts))));
    }
    
    this.isReconnecting = false;
  }

  private async tryReconnectUSB(): Promise<boolean> {
    // Cast navigator to any for WebUSB
    if (!(navigator as any).usb) return false;
    const devices = await (navigator as any).usb.getDevices();
    if (devices.length > 0) {
      // Reconnect to the first authorized device found
      this.usbDevice = devices[0];
      await this.usbDevice.open();
      if (this.usbDevice.configuration === null) {
        await this.usbDevice.selectConfiguration(1);
      }
      await this.usbDevice.claimInterface(0);
      this.startUSBListen();
      this.monitorHealth();
      return true;
    }
    return false;
  }

  private async tryReconnectBT(): Promise<boolean> {
    // Bluetooth reconnection usually requires the device to be in range and advertising.
    if (this.btDevice && this.btDevice.gatt) {
      try {
        await this.btDevice.gatt.connect();
        this.monitorHealth();
        return true;
      } catch (e) {
        return false;
      }
    }
    return false;
  }

  setOnRead(callback: (read: RFIDRead) => void) {
    this.onReadCallback = callback;
  }

  setOnHealthUpdate(callback: (health: HardwareHealth) => void) {
    this.onHealthCallback = callback;
  }

  private monitorHealth() {
    const isConnected = !!(this.usbDevice || (this.btDevice && this.btDevice.gatt?.connected));
    
    // Simulating slight battery drain
    if (isConnected && this.mockBattery > 5) {
      this.mockBattery -= 0.05;
    }

    const idleTime = this.lastReadTimestamp ? Date.now() - this.lastReadTimestamp : Infinity;
    const status: HardwareHealth['status'] = !isConnected 
      ? (this.isReconnecting ? 'idle' : 'disconnected')
      : (idleTime > 60000 ? 'idle' : 'connected');

    const health: HardwareHealth = {
      status,
      lastReadTime: this.lastReadTimestamp,
      batteryLevel: Math.floor(this.mockBattery),
      linkQuality: this.calculateLinkQuality(),
      isScanning: isConnected && status !== 'idle',
      faults: this.mockBattery < 20 ? ['Low Battery Warning'] : (this.isReconnecting ? ['Attempting Reconnect...'] : [])
    };

    this.onHealthCallback(health);
  }

  private calculateLinkQuality(): HardwareHealth['linkQuality'] {
    if (this.rssiHistory.length < 3) return 'EXCELLENT';
    const latest = this.rssiHistory.slice(-5);
    const avg = latest.reduce((a, b) => a + b, 0) / latest.length;
    if (avg > -60) return 'EXCELLENT';
    if (avg > -75) return 'GOOD';
    if (avg > -85) return 'FAIR';
    return 'POOR';
  }

  async connectUSB(): Promise<boolean> {
    try {
      // Cast navigator to any for WebUSB requestDevice
      this.usbDevice = await (navigator as any).usb.requestDevice({ filters: [] });
      await this.usbDevice.open();
      if (this.usbDevice.configuration === null) {
        await this.usbDevice.selectConfiguration(1);
      }
      await this.usbDevice.claimInterface(0);
      this.preferredConnectionType = 'USB';
      this.startUSBListen();
      this.monitorHealth();
      return true;
    } catch (err) {
      console.error("USB Connection failed:", err);
      return false;
    }
  }

  async connectBluetooth(): Promise<boolean> {
    try {
      // Cast navigator to any for Web Bluetooth
      this.btDevice = await (navigator as any).bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['battery_service', 'device_information']
      });
      
      this.btDevice.addEventListener('gattserverdisconnected', () => {
        console.warn("Bluetooth Device disconnected unexpectedly.");
        this.handleUnexpectedDisconnect();
      });

      await this.btDevice.gatt?.connect();
      this.preferredConnectionType = 'BT';
      this.monitorHealth();
      return true;
    } catch (err) {
      console.error("Bluetooth Connection failed:", err);
      return false;
    }
  }

  private async startUSBListen() {
    if (!this.usbDevice) return;
    while (this.usbDevice.opened) {
      try {
        const result = await this.usbDevice.transferIn(1, 64);
        if (result.data && result.data.byteLength > 0) {
          const decoder = new TextDecoder();
          const rawData = decoder.decode(result.data).trim();
          this.processRawData(rawData);
        }
      } catch (err) {
        // Only break if it's a real failure, not just a timeout
        if (err instanceof Error && err.name === 'NotFoundError') break;
        await new Promise(r => setTimeout(r, 100));
      }
    }
  }

  private processRawData(data: string) {
    const parts = data.split(',');
    const tagId = parts[0];
    const rssi = parseInt(parts[1]) || -70;
    
    this.lastReadTimestamp = Date.now();
    this.rssiHistory.push(rssi);
    if (this.rssiHistory.length > 20) this.rssiHistory.shift();

    if (tagId && MOCK_BUSES[tagId]) {
      this.onReadCallback({
        id: Math.random().toString(36).substr(2, 9),
        tagId,
        route: MOCK_BUSES[tagId],
        rssi,
        timestamp: Date.now()
      });
    }
  }

  disconnect() {
    this.preferredConnectionType = 'NONE';
    if (this.usbDevice) this.usbDevice.close();
    if (this.btDevice) this.btDevice.gatt?.disconnect();
    this.usbDevice = null;
    this.btDevice = null;
    this.monitorHealth();
  }
}

export const hardware = new HardwareService();
