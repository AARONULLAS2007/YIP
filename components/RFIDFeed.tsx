
import React from 'react';
import { RFIDRead } from '../types';

interface RFIDFeedProps {
  reads: RFIDRead[];
}

export const RFIDFeed: React.FC<RFIDFeedProps> = ({ reads }) => {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-[2rem] overflow-hidden flex flex-col h-[520px] shadow-2xl">
      <div className="bg-slate-800/80 backdrop-blur-md p-5 border-b border-slate-700 flex justify-between items-center">
        <h3 className="font-black text-white flex items-center gap-3 text-sm uppercase tracking-widest">
          Live Scanner Telemetry
        </h3>
        <span className="text-[10px] font-mono text-slate-500" aria-label={`${reads.length} packets currently in buffer`}>
          {reads.length} PKTS
        </span>
      </div>
      
      <div className="overflow-y-auto flex-1 scrollbar-thin scrollbar-thumb-slate-700">
        <table className="w-full text-left text-[11px] border-collapse" aria-label="Recent RFID detections">
          <caption className="sr-only">List of recently detected bus transponders with signal strength. Newest entries at the top.</caption>
          <thead className="sticky top-0 bg-slate-900 text-slate-500 font-black uppercase tracking-[0.2em] border-b border-slate-800 z-10">
            <tr>
              <th scope="col" className="p-4">Time</th>
              <th scope="col" className="p-4">Tag ID</th>
              <th scope="col" className="p-4">Signal (dBm)</th>
              <th scope="col" className="p-4">Route</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50 font-mono">
            {reads.length === 0 ? (
              <tr>
                <td colSpan={4} className="p-20 text-center text-slate-600 font-black uppercase tracking-widest">
                  Scanner Idle
                </td>
              </tr>
            ) : (
              reads.map((read, idx) => (
                <tr key={read.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="p-4 text-slate-500">
                    {new Date(read.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </td>
                  <td className="p-4 text-amber-500/90 font-black">
                    {read.tagId.slice(-4)}
                  </td>
                  <td className="p-4 font-black">
                    {read.rssi}
                  </td>
                  <td className="p-4 text-slate-300 font-bold">
                    {read.route.split(' - ')[0]}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
