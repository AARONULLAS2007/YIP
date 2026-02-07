
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { BusStatus, TerminalConfig } from '../types';

interface VoiceAssistantProps {
  currentBus: BusStatus | null;
  config: TerminalConfig;
}

export const VoiceAssistant: React.FC<VoiceAssistantProps> = ({ currentBus, config }) => {
  const [isActive, setIsActive] = useState(false);
  const [transcription, setTranscription] = useState<{ user: string; assistant: string }>({ user: '', assistant: '' });
  const [isConnecting, setIsConnecting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const outAudioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const sessionRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Listen for global toggle event from App.tsx keyboard shortcut
  useEffect(() => {
    const handleToggle = () => {
      if (isActive) stopSession();
      else startSession();
    };
    window.addEventListener('toggle-voice', handleToggle);
    return () => window.removeEventListener('toggle-voice', handleToggle);
  }, [isActive]);

  const encode = (bytes: Uint8Array) => {
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  };

  const decode = (base64: string) => {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
    return bytes;
  };

  const decodeAudioData = async (data: Uint8Array, ctx: AudioContext) => {
    const dataInt16 = new Int16Array(data.buffer);
    const buffer = ctx.createBuffer(1, dataInt16.length, 24000);
    const channelData = buffer.getChannelData(0);
    for (let i = 0; i < dataInt16.length; i++) channelData[i] = dataInt16[i] / 32768.0;
    return buffer;
  };

  const createBlob = (data: Float32Array) => {
    const l = data.length;
    const int16 = new Int16Array(l);
    for (let i = 0; i < l; i++) int16[i] = data[i] * 32768;
    return {
      data: encode(new Uint8Array(int16.buffer)),
      mimeType: 'audio/pcm;rate=16000',
    };
  };

  const stopSession = useCallback(() => {
    if (sessionRef.current) {
      try { sessionRef.current.close(); } catch (e) {}
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
    }
    sourcesRef.current.forEach(s => {
      try { s.stop(); } catch (e) {}
    });
    sourcesRef.current.clear();
    
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(console.error);
    }
    if (outAudioContextRef.current && outAudioContextRef.current.state !== 'closed') {
      outAudioContextRef.current.close().catch(console.error);
    }

    setIsActive(false);
    setIsConnecting(false);
    setTranscription({ user: '', assistant: '' });
    streamRef.current = null;
    sessionRef.current = null;
    audioContextRef.current = null;
    outAudioContextRef.current = null;
  }, []);

  const startSession = async () => {
    try {
      setErrorMsg(null);
      setIsConnecting(true);

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Browser does not support audio recording.");
      }

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (err: any) {
        throw new Error("Microphone access denied.");
      }

      streamRef.current = stream;
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      outAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } },
          systemInstruction: `You are the BaySense Assistant at ${config.terminalName}, ${config.bayNumber}. 
          IMPORTANT: Your user is blind or visually impaired. Always give spatial descriptions. 
          Current Bus Status: ${currentBus ? `${currentBus.route} is ${currentBus.state}` : 'No bus detected'}.
          Be highly descriptive but concise. If a bus is ARRIVED, tell them "The bus is right in front of you."`,
          outputAudioTranscription: {},
          inputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            setIsActive(true);
            setIsConnecting(false);
            const source = audioContextRef.current!.createMediaStreamSource(stream);
            const scriptProcessor = audioContextRef.current!.createScriptProcessor(4096, 1, 1);
            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              sessionPromise.then(s => {
                if (s) s.sendRealtimeInput({ media: createBlob(inputData) });
              }).catch(() => {});
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(audioContextRef.current!.destination);
          },
          onmessage: async (msg: LiveServerMessage) => {
            if (msg.serverContent?.inputTranscription) {
               setTranscription(prev => ({ ...prev, user: prev.user + msg.serverContent!.inputTranscription!.text }));
            }
            if (msg.serverContent?.outputTranscription) {
               setTranscription(prev => ({ ...prev, assistant: prev.assistant + msg.serverContent!.outputTranscription!.text }));
            }

            const audioBase64 = msg.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (audioBase64 && outAudioContextRef.current) {
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outAudioContextRef.current.currentTime);
              const buffer = await decodeAudioData(decode(audioBase64), outAudioContextRef.current);
              const source = outAudioContextRef.current.createBufferSource();
              source.buffer = buffer;
              source.connect(outAudioContextRef.current.destination);
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += buffer.duration;
              sourcesRef.current.add(source);
              source.onended = () => sourcesRef.current.delete(source);
            }
          },
          onclose: () => stopSession(),
          onerror: () => stopSession(),
        }
      });

      sessionRef.current = await sessionPromise;
    } catch (err: any) {
      setErrorMsg(err.message || "Voice failed.");
      stopSession();
    }
  };

  return (
    <>
      <div className="fixed bottom-8 right-8 z-[100] flex flex-col items-end gap-4">
        {errorMsg && (
          <div className="bg-red-500 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-xl" role="alert">
            {errorMsg}
          </div>
        )}
        
        <button
          onClick={isActive ? stopSession : startSession}
          disabled={isConnecting}
          aria-label={isActive ? "Stop Voice Assistant" : "Start Voice Assistant (Shortcut: V)"}
          className={`p-6 rounded-full shadow-2xl transition-all active:scale-95 ${isActive ? 'bg-red-500 text-white' : 'bg-amber-500 text-slate-950'}`}
        >
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            {isActive ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /> : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-20a3 3 0 00-3 3v8a3 3 0 006 0V5a3 3 0 00-3-3z" />}
          </svg>
        </button>
      </div>

      {isActive && (
        <div className="fixed inset-x-0 bottom-32 flex justify-center px-4 z-[90]">
          <div className="bg-slate-900/95 backdrop-blur-xl border border-amber-500/30 p-8 rounded-[40px] max-w-2xl w-full shadow-2xl flex flex-col items-center text-center space-y-6" role="dialog" aria-modal="true" aria-label="Voice Interaction Panel">
            <div className="flex gap-1 h-8 items-center" aria-hidden="true">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="w-1.5 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.1}s`, height: '60%' }} />
              ))}
            </div>
            <div className="space-y-4" aria-live="polite">
              {transcription.assistant && <p className="text-white text-2xl font-black">{transcription.assistant}</p>}
              {!transcription.assistant && <p className="text-amber-500 text-2xl font-black">Listening for your questions...</p>}
            </div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Press V to Close Voice Feed</p>
          </div>
        </div>
      )}
    </>
  );
};
