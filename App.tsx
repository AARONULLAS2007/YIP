
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Header } from './components/Header';
import { StatusCard } from './components/StatusCard';
import { RFIDFeed } from './components/RFIDFeed';
import { AppState, RFIDRead, BusStatus, BusState, TerminalConfig, HardwareHealth } from './types';
import { DEFAULT_CONFIG, MOCK_BUSES } from './constants';
import { getBusSummary } from './services/geminiService';
import { hardware, ConnectionType } from './services/hardwareService';

const App: React.FC = () => {
  const [state, setState] = useState<AppState>({
    config: DEFAULT_CONFIG,
    isConnected: false,
    health: {
      status: 'disconnected',
      lastReadTime: null,
      batteryLevel: 100,
      linkQuality: 'EXCELLENT',
      isScanning: false,
      faults: []
    },
    currentBus: null,
    history: [],
  });

  const [activeTab, setActiveTab] = useState<'monitor' | 'settings'>('monitor');
  const [isSimulating, setIsSimulating] = useState(false);
  const [connectionType, setConnectionType] = useState<ConnectionType>('NONE');
  
  const prevBusStateRef = useRef<BusState | null>(null);
  const prevHealthStatusRef = useRef<string>('disconnected');
  const mainRef = useRef<HTMLElement>(null);

  // Accessible Voice Alerts for Hardware Status (Basic Speech Synthesis)
  const announceHardwareStatus = useCallback((message: string) => {
    if (!state.config.audioAlertsEnabled) return;
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.rate = 0.9;
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
  }, [state.config.audioAlertsEnabled]);

  // Keyboard Shortcuts for accessibility
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key.toLowerCase() === 'm') {
        setActiveTab('monitor');
        mainRef.current?.focus();
      }
      if (e.key.toLowerCase() === 's') {
        setActiveTab('settings');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const playArrivalChime = useCallback(() => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(523.25, audioCtx.currentTime); 
      oscillator.frequency.exponentialRampToValueAtTime(659.25, audioCtx.currentTime + 0.15);
      gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.1, audioCtx.currentTime + 0.05);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.8);
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.8);
    } catch (e) {
      console.warn("Audio alert failed", e);
    }
  }, []);

  const handleNewRead = useCallback(async (read: RFIDRead) => {
    setState(prev => {
      const newHistory = [read, ...prev.history].slice(0, 50);
      if (read.rssi < prev.config.minRssiThreshold) return { ...prev, history: newHistory };
      let updatedBus: BusStatus | null = prev.currentBus;
      if (updatedBus?.tagId.startsWith('MANUAL') && updatedBus.route !== read.route) {
         return { ...prev, history: newHistory };
      }
      if (!updatedBus || updatedBus.tagId !== read.tagId) {
        updatedBus = {
          tagId: read.tagId,
          route: read.route,
          state: BusState.APPROACHING,
          confidence: 60,
          firstSeen: read.timestamp,
          lastSeen: read.timestamp,
          avgRssi: read.rssi,
          description: "Detecting bus approach pattern...",
        };
      } else {
        const duration = read.timestamp - updatedBus.firstSeen;
        const newAvgRssi = (updatedBus.avgRssi * 0.7) + (read.rssi * 0.3);
        let newState = updatedBus.state;
        if (duration > prev.config.arrivalDurationThreshold && newAvgRssi > -65) {
          newState = BusState.ARRIVED;
        } 
        updatedBus = {
          ...updatedBus,
          lastSeen: read.timestamp,
          avgRssi: newAvgRssi,
          state: newState,
          confidence: Math.min(100, updatedBus.confidence + 5),
        };
      }
      return { ...prev, history: newHistory, currentBus: updatedBus };
    });
  }, []);

  const handleHealthUpdate = useCallback((health: HardwareHealth) => {
    setState(prev => {
      // Check for status change alerts
      if (health.status === 'disconnected' && prevHealthStatusRef.current === 'connected') {
        announceHardwareStatus("Scanner disconnected. Please check the connection.");
      }
      if (health.batteryLevel < 20 && prev.health.batteryLevel >= 20) {
        announceHardwareStatus("Warning. Scanner battery is low.");
      }
      prevHealthStatusRef.current = health.status;
      return { ...prev, health, isConnected: health.status !== 'disconnected' };
    });
  }, [announceHardwareStatus]);

  useEffect(() => {
    hardware.setOnRead(handleNewRead);
    hardware.setOnHealthUpdate(handleHealthUpdate);
  }, [handleNewRead, handleHealthUpdate]);

  const connectUSB = async () => {
    const success = await hardware.connectUSB();
    if (success) setConnectionType('USB');
  };

  const connectBT = async () => {
    const success = await hardware.connectBluetooth();
    if (success) setConnectionType('BT');
  };

  const handleManualIdentify = (route: string) => {
    if (!route) {
      setState(prev => ({ ...prev, currentBus: null }));
      return;
    }
    const newBus: BusStatus = {
      tagId: `MANUAL-${Date.now()}`,
      route: route,
      state: BusState.ARRIVED,
      confidence: 100,
      firstSeen: Date.now(),
      lastSeen: Date.now(),
      avgRssi: 0,
      description: "Manually confirmed. Fetching guidance...",
    };
    setState(prev => ({ ...prev, currentBus: newBus }));
  };

  useEffect(() => {
    if (state.currentBus?.state === BusState.ARRIVED && prevBusStateRef.current !== BusState.ARRIVED && state.config.audioAlertsEnabled) {
      playArrivalChime();
    }
    prevBusStateRef.current = state.currentBus?.state || null;
  }, [state.currentBus?.state, state.config.audioAlertsEnabled, playArrivalChime]);

  useEffect(() => {
    const updateDescription = async () => {
      if (state.currentBus && (state.currentBus.description.includes("Detecting") || state.currentBus.description.includes("Manually confirmed"))) {
        const summary = await getBusSummary(state.currentBus, state.config.terminalName, state.config.bayNumber);
        setState(prev => ({
          ...prev,
          currentBus: prev.currentBus ? { ...prev.currentBus, description: summary } : null
        }));
      }
    };
    updateDescription();
  }, [state.currentBus?.state, state.currentBus?.tagId, state.config.terminalName, state.config.bayNumber]);

  useEffect(() => {
    const timer = setInterval(() => {
      setState(prev => {
        if (!prev.currentBus) return prev;
        const idleTime = Date.now() - prev.currentBus.lastSeen;
        const timeout = prev.currentBus.tagId.startsWith('MANUAL') ? 120000 : 8000; 
        if (idleTime > timeout) return { ...prev, currentBus: null };
        return prev;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const toggleSimulation = () => {
    if (isSimulating) {
      setIsSimulating(false);
      setConnectionType('NONE');
    } else {
      setIsSimulating(true);
      setConnectionType('NONE');
    }
  };

  useEffect(() => {
    if (!isSimulating) return;
    let currentSimulatedTag = '';
    const interval = setInterval(() => {
      if (!currentSimulatedTag || Math.random() > 0.95) {
        const keys = Object.keys(MOCK_BUSES);
        currentSimulatedTag = keys[Math.floor(Math.random() * keys.length)];
      }
      handleNewRead({
        id: Math.random().toString(36).substr(2, 9),
        tagId: currentSimulatedTag,
        route: MOCK_BUSES[currentSimulatedTag],
        rssi: -85 + Math.floor(Math.random() * 45),
        timestamp: Date.now(),
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isSimulating, handleNewRead]);

  return (
    <div className="min-h-screen flex flex-col font-sans selection:bg-amber-500 selection:text-slate-950">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[200] focus:bg-amber-500 focus:text-slate-950 focus:px-6 focus:py-3 focus:rounded-xl focus:font-black">
        Skip to main content
      </a>

      <Header 
        terminalName={state.config.terminalName} 
        bayNumber={state.config.bayNumber} 
        isConnected={state.isConnected}
        connectionType={connectionType}
      />

      <main id="main-content" ref={mainRef} tabIndex={-1} className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-8 space-y-8 outline-none">
        <nav className="flex bg-slate-900 p-1 rounded-2xl border border-slate-800" aria-label="Application View Toggle">
          <button onClick={() => setActiveTab('monitor')} aria-pressed={activeTab === 'monitor'} className={`flex-1 py-3 px-4 rounded-xl font-bold transition-all ${activeTab === 'monitor' ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20' : 'text-slate-400 hover:text-white'}`}>Live Monitor (M)</button>
          <button onClick={() => setActiveTab('settings')} aria-pressed={activeTab === 'settings'} className={`flex-1 py-3 px-4 rounded-xl font-bold transition-all ${activeTab === 'settings' ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20' : 'text-slate-400 hover:text-white'}`}>System Settings (S)</button>
        </nav>

        {activeTab === 'monitor' ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <section className="lg:col-span-7 xl:col-span-8" aria-labelledby="status-section-heading">
              <h2 id="status-section-heading" className="sr-only">Current Bus Status</h2>
              <StatusCard status={state.currentBus} onManualIdentify={handleManualIdentify} />
              
              <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
                <article className="bg-slate-900 p-6 rounded-3xl border border-slate-800 space-y-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-1">Hardware Health</h3>
                      <p className={`text-xl font-black ${state.health.status === 'connected' ? 'text-white' : 'text-slate-500'}`}>
                        {state.health.status === 'connected' ? 'Reader Active' : 
                         state.health.status === 'idle' ? 'Reader Idle' : 'Scanner Offline'}
                      </p>
                    </div>
                    <div className={`p-3 rounded-2xl ${state.isConnected ? 'bg-green-500/10 text-green-500' : 'bg-slate-800 text-slate-500'}`} aria-hidden="true">
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                     <div className="flex-1 bg-slate-800 h-2 rounded-full overflow-hidden">
                        <div className={`h-full transition-all duration-1000 ${state.health.batteryLevel < 20 ? 'bg-red-500' : 'bg-green-500'}`} style={{ width: `${state.health.batteryLevel}%` }} />
                     </div>
                     <span className="text-xs font-black text-slate-400">{state.health.batteryLevel}% Power</span>
                  </div>
                </article>

                <article className="bg-slate-900 p-6 rounded-3xl border border-slate-800 space-y-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-1">RF Performance</h3>
                      <p className="text-xl font-black text-white">{state.health.linkQuality} SIGNAL</p>
                    </div>
                    <div className="p-3 bg-blue-500/10 rounded-2xl text-blue-500" aria-hidden="true">
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0"/></svg>
                    </div>
                  </div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                    {state.health.lastReadTime ? `Last Read: ${Math.floor((Date.now() - state.health.lastReadTime)/1000)}s ago` : 'Waiting for scan...'}
                  </p>
                </article>
              </div>
            </section>

            <section className="lg:col-span-5 xl:col-span-4" aria-labelledby="telemetry-section-heading">
              <h2 id="telemetry-section-heading" className="sr-only">Live Telemetry Data</h2>
              <RFIDFeed reads={state.history} />
            </section>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto space-y-6">
            <section className="bg-slate-900 border border-slate-800 rounded-3xl p-8 space-y-6">
              <h2 className="text-2xl font-black text-white">Hardware Connection</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button onClick={connectUSB} className={`p-6 rounded-2xl font-bold flex flex-col items-center gap-4 transition-all border-2 ${connectionType === 'USB' ? 'bg-amber-500 text-slate-950 border-amber-500' : 'bg-slate-800 text-slate-300 border-slate-700 hover:border-slate-500'}`}>Connect via USB</button>
                <button onClick={connectBT} className={`p-6 rounded-2xl font-bold flex flex-col items-center gap-4 transition-all border-2 ${connectionType === 'BT' ? 'bg-blue-500 text-white border-blue-500' : 'bg-slate-800 text-slate-300 border-slate-700 hover:border-slate-500'}`}>Connect Bluetooth</button>
              </div>
              <button onClick={toggleSimulation} className={`w-full p-4 rounded-2xl font-bold transition-all ${isSimulating ? 'bg-red-500/10 text-red-500' : 'bg-slate-800 text-slate-400'}`}>{isSimulating ? 'Stop Simulator' : 'Run Internal Simulator'}</button>
            </section>
          </div>
        )}
      </main>

      <footer className="p-8 text-center text-slate-600 text-sm font-medium">
        &copy; 2024 BaySense • Precision Assistive Mobility.
      </footer>
    </div>
  );
};

export default App;
