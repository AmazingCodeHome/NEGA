'use client';

import React, { useState, useRef, useEffect } from 'react';
import { 
  Button, 
  Textarea, 
  ScrollShadow, 
  Spinner, 
  Avatar, 
  Tooltip,
  Accordion,
  AccordionItem,
  Divider
} from '@heroui/react';
import { 
  Send, 
  Mic, 
  Square, 
  Plus, 
  MessageSquare, 
  Settings, 
  User, 
  Copy,
  ThumbsUp,
  ThumbsDown,
  Volume2,
  LogOut,
  LogIn
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSession, signIn, signOut } from 'next-auth/react';
import { useI18n } from '@/i18n/context';
import { isBrowserSpeechRecognitionSupported, createLiveSpeechRecognition } from '@/lib/browser-speech';

type Message = {
  role: 'user' | 'assistant';
  content: string;
  thought?: string;
};

export default function ChatInterface({ onSwitchToVoice }: { onSwitchToVoice?: () => void }) {
  const { data: session } = useSession();
  const { dict } = useI18n();
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: "Yo! NEGA in the building. I'm your real-deal English homie. We finna get your grammar on point and your slang sounding authentic. What's the move today?" }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isLimitReached, setIsLimitReached] = useState(false);
  const [useBrowserRecognition, setUseBrowserRecognition] = useState(false);
  
  useEffect(() => {
    if (session) {
      setIsLimitReached(false);
    }
  }, [session]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const browserRecognitionRef = useRef<any>(null);
  const browserTranscriptRef = useRef<string>('');

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    // Check if browser supports speech recognition
    if (isBrowserSpeechRecognitionSupported()) {
      console.debug('Browser Speech Recognition is supported');
      setUseBrowserRecognition(true);
    } else {
      console.debug('Browser Speech Recognition not supported, will use remote API');
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async () => {
    if (!input.trim() || isLimitReached) return;

    const userMessage: Message = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [...messages.map(m => ({ role: m.role, content: m.content })), userMessage] }),
      });
      
      const data = await response.json();

      if (!response.ok) {
        if (data.error === "LIMIT_REACHED") {
          setIsLimitReached(true);
          setMessages(prev => [...prev, { role: 'assistant', content: dict.common.limitReached }]);
          return;
        }
        throw new Error(data.message || 'Failed to send message');
      }
      
      if (data.content) {
        const assistantMessage: Message = { 
            role: 'assistant', 
            content: data.content,
        };
        setMessages(prev => [...prev, assistantMessage]);
        await playTTS(data.content);
      }
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const startRecording = async () => {
    try {
      // If browser supports live recognition, use it
      if (useBrowserRecognition && !browserRecognitionRef.current) {
        browserTranscriptRef.current = '';
        browserRecognitionRef.current = createLiveSpeechRecognition(
          (result) => {
            if (result.isFinal) {
              browserTranscriptRef.current += result.text + ' ';
              console.debug('Browser recognition (final):', result.text);
            } else {
              // Update input with interim results for immediate feedback
              const interim = result.text;
              setInput(prev => {
                // Remove previous interim result and add new one
                const baseText = browserTranscriptRef.current;
                return baseText + interim;
              });
            }
          },
          (error) => {
            console.warn('Browser recognition error:', error);
            // Fall back to recording for remote API
          },
          {
            lang: 'en-US',
            continuous: true,
            interimResults: true,
          }
        );
        
        try {
          browserRecognitionRef.current.start();
          setIsRecording(true);
          console.debug('Browser speech recognition started');
          return; // Don't record audio if using browser recognition
        } catch (err) {
          console.error('Failed to start browser recognition:', err);
          browserRecognitionRef.current = null;
          // Continue with MediaRecorder fallback below
        }
      }

      // Fallback: record audio for remote API transcription
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await handleTranscribe(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error('Error accessing microphone:', err);
    }
  };

  const stopRecording = () => {
    // Stop browser recognition if active
    if (browserRecognitionRef.current) {
      try {
        browserRecognitionRef.current.stop();
        // Use the final transcript
        const finalText = browserTranscriptRef.current.trim();
        if (finalText) {
          setInput(prev => prev ? prev + ' ' + finalText : finalText);
        }
      } catch (err) {
        console.error('Error stopping browser recognition:', err);
      }
      browserRecognitionRef.current = null;
      browserTranscriptRef.current = '';
      setIsRecording(false);
      return;
    }

    // Stop MediaRecorder if active
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
  };

  const handleTranscribe = async (audioBlob: Blob) => {
    // Only called when using MediaRecorder (fallback)
    setIsLoading(true);
    const formData = new FormData();
    formData.append('file', audioBlob, 'recording.webm');
    formData.append('mimeType', audioBlob.type);

    try {
      console.debug('Using remote API for transcription (browser recognition not used)');
      const res = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.text) {
        setInput(prev => (prev ? prev + ' ' + data.text : data.text));
      }
    } catch (err) {
      console.error('Transcription failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const playTTS = async (text: string) => {
    try {
        const res = await fetch('/api/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text }),
        });
        
        if (!res.ok) throw new Error("TTS fetch failed");

        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        
        if (audioPlayerRef.current) {
            audioPlayerRef.current.src = url;
            audioPlayerRef.current.play();
        }
    } catch (e) {
        console.error("TTS Playback error:", e);
    }
  };

  return (
    <div className="flex h-screen w-full bg-background text-foreground transition-colors duration-500">
      {/* Sidebar */}
      <aside className="hidden md:flex flex-col w-[280px] bg-foreground/[0.02] border-r border-foreground/5 p-4">
        <div className="flex items-center gap-3 px-2 mb-8">
            <div className="w-8 h-8 rounded-lg bg-foreground flex items-center justify-center">
                <span className="text-background font-black text-xl">N</span>
            </div>
            <span className="font-black tracking-tight text-xl">NEGA</span>
        </div>

        <Button 
          className="justify-start gap-3 bg-foreground text-background font-bold rounded-xl mb-6 shadow-lg shadow-foreground/10"
          onPress={() => setMessages([{ role: 'assistant', content: "Hello! I am NEGA, your Native English Grammar Assistant. How can I help you today?" }])}
          startContent={<Plus size={18} />}
        >
          New chat
        </Button>
        
        <ScrollShadow className="flex-1 -mx-2 px-2">
          <div className="space-y-4">
            <div>
                <p className="px-2 text-[10px] font-black text-foreground/30 uppercase tracking-[0.2em] mb-3">Recent</p>
                <div className="space-y-1">
                    <Button size="sm" variant="light" className="w-full justify-start gap-3 h-10 px-3 rounded-lg hover:bg-foreground/5 group">
                        <MessageSquare size={16} className="text-foreground/40 group-hover:text-foreground" />
                        <span className="truncate font-medium">English Grammar Help</span>
                    </Button>
                </div>
            </div>
          </div>
        </ScrollShadow>

        <div className="mt-auto pt-4 space-y-4">
            {session ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-3 px-3 py-3 rounded-2xl bg-foreground/5 border border-foreground/5 transition-all hover:bg-foreground/[0.08] group/user">
                  <Avatar 
                    src={session.user?.image || undefined} 
                    name={session.user?.name || 'User'} 
                    size="sm"
                    isBordered
                    className="flex-shrink-0 border-2 border-foreground"
                    classNames={{
                      base: "bg-foreground text-background font-black",
                      name: "font-black"
                    }}
                  />
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-black truncate leading-tight">{session.user?.name}</span>
                    <span className="text-[10px] text-foreground/40 truncate font-medium uppercase tracking-tighter">{session.user?.email}</span>
                  </div>
                </div>
                <Button 
                  variant="light" 
                  className="w-full justify-start gap-3 h-11 px-3 rounded-xl hover:bg-danger/10 hover:text-danger group transition-all"
                  onPress={() => signOut()}
                >
                  <LogOut size={18} className="text-foreground/40 group-hover:text-danger transition-colors" />
                  <span className="font-bold text-sm">{dict.common.signOut}</span>
                </Button>
              </div>
            ) : (
              <Button 
                variant="light" 
                className="w-full justify-start gap-4 h-12 px-4 rounded-xl bg-foreground text-background hover:scale-[1.02] active:scale-[0.98] transition-all shadow-lg shadow-foreground/10 group mb-2"
                onPress={() => signIn('casdoor')}
              >
                <LogIn size={20} className="group-hover:translate-x-0.5 transition-transform" />
                <span className="font-black text-sm">{dict.common.signIn}</span>
              </Button>
            )}
            <Button variant="light" className="w-full justify-start gap-3 px-3 rounded-lg hover:bg-foreground/5 group">
                <Settings size={18} className="text-foreground/40 group-hover:text-foreground" />
                <span className="font-medium text-sm">Settings</span>
            </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative h-full mesh-gradient">
        <header className="absolute top-0 left-0 right-0 z-10 p-4 flex justify-between items-center backdrop-blur-md bg-background/50 border-b border-foreground/5">
            <h1 className="text-sm font-black uppercase tracking-widest text-foreground/40 px-4">NEGA v1.0</h1>
            <div className="md:hidden">
              <Button isIconOnly variant="flat" size="sm" className="bg-foreground/5"><Plus size={18}/></Button>
            </div>
        </header>

        <ScrollShadow className="flex-1 pt-24 pb-40">
          <div className="max-w-3xl mx-auto w-full px-6">
            <AnimatePresence initial={false}>
              {messages.map((msg, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                  className={`group py-8 flex gap-6 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {msg.role === 'assistant' && (
                    <div className="w-8 h-8 rounded-lg bg-foreground flex items-center justify-center flex-shrink-0 mt-1 shadow-sm">
                        <span className="text-background font-black text-xs">N</span>
                    </div>
                  )}
                  
                  <div className={`flex flex-col gap-3 max-w-[85%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                    <div className={`${
                        msg.role === 'user' 
                        ? 'bg-foreground text-background px-5 py-3 rounded-[20px] rounded-br-sm shadow-xl shadow-foreground/10' 
                        : 'w-full'
                    }`}>
                      <p className={`text-base md:text-lg leading-relaxed whitespace-pre-wrap ${msg.role === 'assistant' ? 'font-medium' : 'font-medium'}`}>
                        {msg.content}
                      </p>
                    </div>

                        <Tooltip 
                          content="Copy" 
                          showArrow 
                          placement="top"
                          classNames={{
                            content: "bg-foreground text-background font-bold text-xs py-2 px-3 rounded-xl",
                            arrow: "bg-foreground"
                          }}
                        >
                          <Button isIconOnly size="sm" variant="flat" className="bg-foreground/5 text-foreground/40 hover:text-foreground rounded-lg"><Copy size={16} /></Button>
                        </Tooltip>
                        <Tooltip 
                          content="Listen" 
                          showArrow 
                          placement="top"
                          classNames={{
                            content: "bg-foreground text-background font-bold text-xs py-2 px-3 rounded-xl",
                            arrow: "bg-foreground"
                          }}
                        >
                          <Button isIconOnly size="sm" variant="flat" className="bg-foreground/5 text-foreground/40 hover:text-foreground rounded-lg" onPress={() => playTTS(msg.content)}><Volume2 size={16} /></Button>
                        </Tooltip>
                        <div className="w-[1px] h-4 bg-foreground/10 self-center mx-1" />
                        <Tooltip 
                          content="Good response" 
                          showArrow 
                          placement="top"
                          classNames={{
                            content: "bg-foreground text-background font-bold text-xs py-2 px-3 rounded-xl",
                            arrow: "bg-foreground"
                          }}
                        >
                          <Button isIconOnly size="sm" variant="flat" className="bg-foreground/5 text-foreground/40 hover:text-foreground rounded-lg"><ThumbsUp size={16} /></Button>
                        </Tooltip>
                        <Tooltip 
                          content="Bad response" 
                          showArrow 
                          placement="top"
                          classNames={{
                            content: "bg-foreground text-background font-bold text-xs py-2 px-3 rounded-xl",
                            arrow: "bg-foreground"
                          }}
                        >
                          <Button isIconOnly size="sm" variant="flat" className="bg-foreground/5 text-foreground/40 hover:text-foreground rounded-lg"><ThumbsDown size={16} /></Button>
                        </Tooltip>
                  </div>

                  {msg.role === 'user' && (
                    <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center flex-shrink-0 mt-1 shadow-lg shadow-accent/20">
                        <User size={16} className="text-white" />
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
            
            {isLoading && (
              <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                className="py-8 flex gap-6"
              >
                <div className="w-8 h-8 rounded-lg bg-foreground flex items-center justify-center animate-pulse">
                    <span className="text-background font-black text-xs">N</span>
                </div>
                <div className="flex gap-1 items-center">
                    <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 1 }} className="w-1.5 h-1.5 rounded-full bg-foreground/20" />
                    <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }} className="w-1.5 h-1.5 rounded-full bg-foreground/20" />
                    <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }} className="w-1.5 h-1.5 rounded-full bg-foreground/20" />
                </div>
              </motion.div>
            )}
            <div ref={messagesEndRef} className="h-4" />
          </div>
        </ScrollShadow>

        {/* Input area */}
        <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-background via-background/90 to-transparent">
          <div className="max-w-3xl mx-auto">
            <AnimatePresence>
              {isLimitReached && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-4 p-4 rounded-2xl bg-foreground text-background shadow-2xl flex flex-col md:flex-row items-center justify-between gap-4"
                >
                  <div className="flex flex-col">
                    <p className="font-black text-sm">{dict.common.limitReached}</p>
                    <p className="text-[10px] font-bold opacity-60 uppercase tracking-widest">{dict.common.limitReachedSubtitle}</p>
                  </div>
                  <Button 
                    size="sm" 
                    className="bg-background text-foreground font-black rounded-xl px-6"
                    onPress={() => signIn('casdoor')}
                  >
                    {dict.common.signIn}
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
            <div className={`relative flex flex-col gap-2 bg-foreground/5 p-2 rounded-[28px] border border-foreground/10 focus-within:border-foreground/20 transition-all backdrop-blur-xl ${isLimitReached ? 'opacity-50 pointer-events-none' : ''}`}>
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={isLimitReached ? "Limit reached..." : "Message NEGA..."}
                isDisabled={isLimitReached}
                minRows={1}
                maxRows={12}
                className="w-full"
                classNames={{
                    input: "text-base md:text-lg bg-transparent border-none focus:ring-0 px-4 py-3 placeholder:text-foreground/30 font-medium",
                    inputWrapper: "bg-transparent border-none shadow-none hover:bg-transparent focus-within:bg-transparent px-0",
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
              />
              
              <div className="flex justify-between items-center px-2 pb-1">
                <div className="flex gap-1">
                    <Tooltip 
                      content="Record audio" 
                      showArrow 
                      placement="top"
                      classNames={{
                        content: "bg-foreground text-background font-bold text-xs py-2 px-3 rounded-xl",
                        arrow: "bg-foreground"
                      }}
                    >
                        <Button 
                            isIconOnly 
                            radius="full"
                            variant="flat"
                            className={`w-10 h-10 bg-transparent hover:bg-foreground/10 transition-colors ${isRecording ? 'text-danger' : 'text-foreground/60'}`}
                            onPress={isRecording ? stopRecording : startRecording}
                        >
                            {isRecording ? <Square size={20} fill="currentColor" /> : <Mic size={20} />}
                        </Button>
                    </Tooltip>
                    <Tooltip 
                      content="Switch to Voice" 
                      showArrow 
                      placement="top"
                      classNames={{
                        content: "bg-foreground text-background font-bold text-xs py-2 px-3 rounded-xl",
                        arrow: "bg-foreground"
                      }}
                    >
                        <Button 
                            isIconOnly 
                            radius="full" 
                            variant="flat" 
                            className="w-10 h-10 bg-transparent hover:bg-foreground/10 text-foreground/60"
                            onPress={onSwitchToVoice}
                        >
                            <Mic size={20} />
                        </Button>
                    </Tooltip>
                </div>

                <Button 
                    isIconOnly 
                    radius="full" 
                    className={`w-10 h-10 transition-all ${input ? 'bg-foreground text-background scale-100' : 'bg-foreground/10 text-foreground/20 scale-90'}`}
                    onPress={handleSendMessage}
                    isLoading={isLoading}
                    isDisabled={!input && !isRecording}
                >
                    <Send size={18} strokeWidth={2.5} />
                </Button>
              </div>
            </div>
            <p className="text-center text-[10px] font-bold text-foreground/20 uppercase tracking-widest mt-4">
              Native English Grammar Assistant • v1.0
            </p>
          </div>
        </div>
      </main>
      <audio ref={audioPlayerRef} className="hidden" />
    </div>
  );
}
