
import React, { useState, useEffect } from 'react';
import { BusStatus, BusState } from '../types';

interface StatusCardProps {
  status: BusStatus | null;
  onManualIdentify: (route: string) => void;
}

export const StatusCard: React.FC<StatusCardProps> = ({ status, onManualIdentify }) => {
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [manualInput, setManualInput] = useState('');

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualInput.trim()) {
      onManualIdentify(manualInput.trim());
      setManualInput('');
    }
  };

  const steps = [
    { label: 'Scanning', active: !status },
    { label: 'Approaching', active: status?.state === BusState.APPROACHING },
    { label: 'Arrived', active: status?.state === BusState.ARRIVED },
  ];

  if (!status) {
    return (
      <div className="bg-slate-900 border-2 border-slate-800 rounded-[2.5rem] overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-500" role="status" aria-live="polite">
        <div className="bg-slate-800/50 px-8 py-4 border-b border-slate-800 flex justify-between items-center" aria-label="Current monitoring phase">
          <div className="flex gap-4">
            {steps.map((step, i) => (
              <div key={step.label} className="flex items-center gap-2">
                <div className={`w-2.5 h-2.5 rounded-full ${step.active ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]' : 'bg-slate-700'}`} />
                <span className={`text-[10px] font-black uppercase tracking-widest ${step.active ? 'text-white' : 'text-slate-500'}`}>
                  {step.label}
                </span>
                {i < steps.length - 1 && <div className="w-4 h-[1px] bg-slate-800" />}
              </div>
            ))}
          </div>
          <div className="bg-slate-900 px-3 py-1 rounded-full border border-slate-700">
             <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Bay Status: Not Present</span>
          </div>
        </div>

        <div className="p-8 md:p-12 space-y-10">
          <div className="text-center space-y-3">
            <h2 className="text-4xl font-black text-white tracking-tight">Identify Your Bus</h2>
            <p className="text-slate-400 font-medium max-w-md mx-auto">
              The bay is currently empty. The system is scanning for incoming vehicles.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-slate-800/50 border-2 border-amber-500/20 rounded-[2rem] p-8 flex flex-col items-center text-center space-y-6 group border-dashed">
              <div className="relative" aria-hidden="true">
                <div className="absolute inset-0 bg-amber-500/20 rounded-full animate-ping" />
                <div className="relative bg-amber-500 text-slate-950 p-6 rounded-full shadow-lg shadow-amber-500/40">
                  <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
                  </svg>
                </div>
              </div>
              <div>
                <h3 className="text-xl font-black text-white uppercase tracking-wider">Automatic Scan</h3>
                <p className="text-slate-500 text-sm leading-relaxed mt-4">
                  The RFID reader will announce your bus as it approaches.
                </p>
              </div>
            </div>

            <div className="bg-slate-800/50 border-2 border-slate-700 rounded-[2rem] p-8 flex flex-col space-y-6">
              <div className="flex items-center gap-4">
                <div className="bg-slate-700 text-slate-300 p-3 rounded-2xl" aria-hidden="true">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </div>
                <h3 className="text-xl font-black text-white uppercase tracking-wider">Manual Entry</h3>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <label htmlFor="route-input" className="sr-only">Enter route number manually</label>
                <input
                  id="route-input"
                  type="text"
                  placeholder="Enter Route..."
                  value={manualInput}
                  onChange={(e) => setManualInput(e.target.value)}
                  className="w-full bg-slate-900 border-2 border-slate-700 rounded-2xl px-5 py-4 text-lg font-bold text-white placeholder:text-slate-600 focus:border-amber-500 outline-none transition-all"
                />
                <button
                  type="submit"
                  aria-label="Manually identify this bus route"
                  className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-black py-4 rounded-2xl text-lg shadow-lg active:scale-[0.98] transition-all"
                >
                  Confirm Route
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const stateColors = {
    [BusState.NOT_PRESENT]: 'bg-slate-800 text-slate-400',
    [BusState.APPROACHING]: 'bg-blue-600 text-white',
    [BusState.ARRIVED]: 'bg-amber-500 text-slate-950',
    [BusState.DEPARTING]: 'bg-orange-600 text-white',
    [BusState.PASSING]: 'bg-purple-600 text-white',
  };

  // ETA Calculation for approaching buses
  // We assume a standard approach timeframe of 2 minutes from first detection for visualization
  const getEtaString = () => {
    if (status.state !== BusState.APPROACHING) return null;
    const approachWindow = 120000; // 2 minutes in ms
    const elapsed = currentTime - status.firstSeen;
    const remaining = Math.max(0, approachWindow - elapsed);
    const minutes = Math.ceil(remaining / 60000);
    return `Arriving in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
  };

  return (
    <article className="bg-slate-900 border border-slate-800 rounded-[2.5rem] overflow-hidden shadow-2xl relative animate-in slide-in-from-bottom-4 duration-500" role="status" aria-live="assertive" aria-atomic="true">
      <div className="bg-slate-800/50 px-8 py-4 border-b border-slate-800 flex justify-between items-center" aria-label="Progress timeline">
        <div className="flex gap-4">
          {steps.map((step, i) => {
            const isCompleted = (status.state === BusState.ARRIVED && step.label !== 'Arrived') || (status.state === BusState.APPROACHING && step.label === 'Scanning');
            const isCurrent = step.active;
            return (
              <div key={step.label} className="flex items-center gap-2">
                <div className={`w-2.5 h-2.5 rounded-full transition-all duration-500 ${isCompleted ? 'bg-green-500' : isCurrent ? 'bg-amber-500' : 'bg-slate-700'}`} />
                <span className={`text-[10px] font-black uppercase tracking-widest ${isCurrent || isCompleted ? 'text-white' : 'text-slate-500'}`}>
                  {step.label}
                </span>
                {i < steps.length - 1 && <div className="w-4 h-[1px] bg-slate-800" />}
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-2 bg-slate-900 px-3 py-1 rounded-full border border-slate-700">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
            {status.state === BusState.ARRIVED ? 'STOPPED AT BAY' : 'APPROACHING'}
          </span>
        </div>
      </div>

      <button 
        onClick={() => onManualIdentify('')} 
        aria-label="Clear current bus and restart scan"
        className="absolute top-16 right-6 bg-white/5 hover:bg-white/10 text-white p-3 rounded-full transition-colors z-10"
      >
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
      </button>

      <div className={`${stateColors[status.state]} py-4 px-8 font-black text-sm tracking-[0.3em] uppercase flex items-center justify-center gap-3`}>
        {status.state}
      </div>
      
      <div className="p-10 md:p-12 space-y-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-1">
            <span className="text-amber-500/60 text-xs font-black uppercase tracking-[0.2em]">Live Recognition</span>
            <h2 className="text-5xl md:text-6xl font-black text-white leading-[1.1] tracking-tight">{status.route}</h2>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div className="bg-slate-800/50 p-6 rounded-[1.5rem] border border-slate-700">
            <span className="text-slate-500 text-xs font-black uppercase tracking-widest block mb-2">Confidence Score</span>
            <span className="text-3xl font-black text-amber-500">{status.confidence}%</span>
          </div>
          <div className="bg-slate-800/50 p-6 rounded-[1.5rem] border border-slate-700">
            <span className="text-slate-500 text-xs font-black uppercase tracking-widest block mb-2">
              {status.state === BusState.APPROACHING ? 'Estimated Arrival' : 'Distance Check'}
            </span>
            <span className="text-xl font-black text-white uppercase tracking-wider">
              {status.state === BusState.APPROACHING 
                ? getEtaString()
                : (status.avgRssi > -60 ? 'Close Range' : 'In Range')}
            </span>
          </div>
        </div>

        <div className="bg-amber-500/10 border-2 border-amber-500/20 p-8 rounded-[2rem] relative">
          <h3 className="text-amber-500 text-xs font-black uppercase tracking-[0.3em] mb-4">Voice Guidance Summary</h3>
          <p className="text-xl md:text-2xl font-bold leading-snug text-slate-100">
            {status.description}
          </p>
        </div>
      </div>
    </article>
  );
};
