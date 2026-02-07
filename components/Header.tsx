
import React from 'react';
import { ConnectionType } from '../services/hardwareService';

interface HeaderProps {
  terminalName: string;
  bayNumber: string;
  isConnected: boolean;
  connectionType: ConnectionType;
}

export const Header: React.FC<HeaderProps> = ({ terminalName, bayNumber, isConnected, connectionType }) => {
  return (
    <header className="bg-slate-900 border-b border-slate-800 p-4 md:p-6 sticky top-0 z-50 shadow-xl">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-amber-500 text-slate-950 p-2 rounded-lg font-black text-xl tracking-tighter" aria-hidden="true">
            BS
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">BaySense</h1>
            <p className="text-slate-400 text-sm font-black uppercase tracking-widest leading-none">Smart Terminal Aid</p>
          </div>
        </div>

        <div className="flex flex-wrap justify-center gap-4">
          <div className="bg-slate-800 px-4 py-2 rounded-full border border-slate-700 flex items-center gap-2 shadow-inner">
            <span className="text-slate-500 text-[10px] font-black tracking-widest">LOCATION</span>
            <span className="text-amber-400 font-black text-sm">{terminalName} - {bayNumber}</span>
          </div>
          
          <div className="flex items-center gap-3 bg-slate-800 px-5 py-2 rounded-full border border-slate-700 shadow-inner">
            <div className="relative flex items-center justify-center">
              <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
              {isConnected && <div className="absolute w-5 h-5 bg-green-500/40 rounded-full animate-ping" />}
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] font-black uppercase tracking-widest leading-tight">
                {isConnected ? 'Reader Online' : 'Reader Offline'}
              </span>
              {isConnected && (
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-tight">
                  {connectionType === 'NONE' ? 'Simulated Link' : `${connectionType} Link`}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
