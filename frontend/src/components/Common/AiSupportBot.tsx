import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  Bot,
  X,
  Send,
  Mic,
  MicOff,
  RotateCcw,
  Maximize2,
  Minimize2,
  ChevronDown,
  Sun,
  Copy,
  Check
} from 'lucide-react';
import { sendAiSupportMessage, type ChatMessage } from '../../services/aiChatService';
import { useAuthStore } from '../../store/authStore';

const STORAGE_KEY = 'green_energy_setu_ai_chat_history';

const DEFAULT_SUGGESTIONS = [
  { text: '📊 Dashboard Live Summary', prompt: 'Mujhe abhi ke dashboard counts, total leads aur status breakdown batao.' },
  { text: '⚡ PM Surya Ghar Subsidy', prompt: 'PM Surya Ghar Muft Bijli Yojana ki central subsidy calculation kya hai 1kW, 2kW aur 3kW par?' },
  { text: '📦 Low Stock & Inventory', prompt: 'Inventory me kaunse products low stock ya out of stock hain?' },
  { text: '📋 Today\'s Follow-ups', prompt: 'Aaj kitne customer follow-ups scheduled hain?' },
  { text: '☀️ Calculate 5kW Solar ROI', prompt: '5 kW residential solar plant lagane ka estimation, generation aur ROI payback period kitna hoga?' },
  { text: '📄 How to make WCR / DCR?', prompt: 'Software me WCR aur DCR documents kaise generate aur save karte hain?' }
];

export const AiSupportBot: React.FC = () => {
  const currentRole = useAuthStore((state) => state.currentRole);

  if (currentRole !== 'admin' && currentRole !== 'super_admin') {
    return null;
  }

  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputQuery, setInputQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [unreadNotification, setUnreadNotification] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

  // Load saved history on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        setMessages(JSON.parse(saved));
      } else {
        // Initial friendly greeting
        setMessages([
          {
            id: 'welcome_1',
            role: 'assistant',
            content: `Namaste! 🙏 Main **Setu AI** hoon (Aapka Intelligent Solar & CRM Assistant).

Main aapke live CRM dashboard counts, customer leads, inventory stock, PM Surya Ghar subsidy calculations, aur solar engineering se jude kisi bhi sawal me madad kar sakta hoon. 

Aap mujhse neeche diye gaye topics par pooch sakte hain ya seedha apna sawal type/bol sakte hain! ✨`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }
        ]);
      }
    } catch (_) {}
  }, []);

  // Save history to localStorage
  useEffect(() => {
    if (messages.length > 0) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-20)));
      } catch (_) {}
    }
  }, [messages]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen, isLoading]);

  // Setup Web Speech Recognition for voice input (Hindi & English)
  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = 'hi-IN'; // Supports Hindi + English mixed speech

      rec.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        if (transcript) {
          setInputQuery(transcript);
        }
        setIsListening(false);
      };

      rec.onerror = () => {
        setIsListening(false);
      };

      rec.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = rec;
    }
  }, []);

  const handleToggleVoice = () => {
    if (!recognitionRef.current) {
      alert('Speech recognition is not supported in this browser. Please use Google Chrome or Edge.');
      return;
    }
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch (err) {
        console.warn(err);
      }
    }
  };

  const handleSend = async (customPrompt?: string) => {
    const queryToSend = customPrompt || inputQuery.trim();
    if (!queryToSend || isLoading) return;

    const userMsg: ChatMessage = {
      id: 'msg_' + Date.now(),
      role: 'user',
      content: queryToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputQuery('');
    setIsLoading(true);

    try {
      const aiReply = await sendAiSupportMessage(queryToSend, messages);
      const botMsg: ChatMessage = {
        id: 'msg_bot_' + Date.now(),
        role: 'assistant',
        content: aiReply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages((prev) => [...prev, botMsg]);
      if (!isOpen) setUnreadNotification(true);
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: 'msg_err_' + Date.now(),
        role: 'assistant',
        content: `Khama karein, ek error aayi: ${err.message || 'Server se connect nahi ho paya.'}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearHistory = () => {
    if (confirm('Kya aap chat history clear karna chahte hain?')) {
      const defaultMsg: ChatMessage = {
        id: 'welcome_' + Date.now(),
        role: 'assistant',
        content: 'Chat history clear kar di gayi hai. Aap apna naya sawal pooch sakte hain! ☀️',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages([defaultMsg]);
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  /**
   * Markdown formatter for clean bold, bullet points, links, and code
   */
  const renderFormattedContent = (content: string) => {
    const lines = content.split('\n');
    return (
      <div className="space-y-1.5 leading-relaxed text-xs">
        {lines.map((line, idx) => {
          let trimmed = line.trim();

          // Heading ###
          if (trimmed.startsWith('### ')) {
            return (
              <h4 key={idx} className="font-extrabold text-orange-800 dark:text-orange-300 text-xs mt-2 mb-1">
                {trimmed.replace('### ', '')}
              </h4>
            );
          }
          // Heading ##
          if (trimmed.startsWith('## ')) {
            return (
              <h3 key={idx} className="font-black text-slate-900 dark:text-white text-sm mt-2.5 mb-1 pb-0.5 border-b border-orange-200/60 dark:border-slate-800">
                {trimmed.replace('## ', '')}
              </h3>
            );
          }
          // Bullet point
          if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
            const bulletText = trimmed.replace(/^[-*]\s+/, '');
            return (
              <div key={idx} className="flex items-start gap-1.5 ml-1">
                <span className="text-orange-500 font-bold">•</span>
                <span dangerouslySetInnerHTML={{ __html: formatInlineMarkdown(bulletText) }} />
              </div>
            );
          }
          // Numbered list
          if (/^\d+\.\s/.test(trimmed)) {
            return (
              <div key={idx} className="flex items-start gap-1.5 ml-1">
                <span className="text-orange-600 font-bold">{trimmed.match(/^\d+\./)?.[0]}</span>
                <span dangerouslySetInnerHTML={{ __html: formatInlineMarkdown(trimmed.replace(/^\d+\.\s*/, '')) }} />
              </div>
            );
          }
          // Blank line
          if (!trimmed) {
            return <div key={idx} className="h-1" />;
          }

          return (
            <p key={idx} dangerouslySetInnerHTML={{ __html: formatInlineMarkdown(trimmed) }} />
          );
        })}
      </div>
    );
  };

  const formatInlineMarkdown = (text: string): string => {
    let formatted = text
      // Bold **text**
      .replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-slate-900 dark:text-slate-100">$1</strong>')
      // Code `code`
      .replace(/`([^`]+)`/g, '<code class="bg-orange-50 dark:bg-slate-800 px-1 py-0.5 rounded text-[11px] font-mono text-orange-700 dark:text-orange-400 font-bold">$1</code>')
      // Links [text](url)
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-orange-600 hover:text-orange-800 dark:text-orange-400 underline font-bold inline-flex items-center gap-0.5">$1 ↗</a>');

    return formatted;
  };

  return (
    <>
      {/* Floating Action Button (Always on top bottom-right) */}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-2 print:hidden">
        {/* Pulsing Greeting Pill when collapsed */}
        {!isOpen && (
          <div
            onClick={() => {
              setIsOpen(true);
              setUnreadNotification(false);
            }}
            className="group cursor-pointer bg-slate-950/95 hover:bg-black text-white px-3.5 py-2 rounded-2xl shadow-2xl border border-orange-500/50 backdrop-blur-md flex items-center gap-2 transition-all duration-300 hover:scale-105 animate-fade-in"
          >
            <div className="w-2 h-2 rounded-full bg-orange-400 animate-ping" />
            <span className="text-xs font-bold bg-gradient-to-r from-orange-400 via-amber-300 to-yellow-200 bg-clip-text text-transparent">
              ✨ Ask Setu AI
            </span>
            <span className="text-[10px] bg-orange-500/20 text-orange-300 px-1.5 py-0.5 rounded-full font-bold border border-orange-500/30">
              Live CRM
            </span>
          </div>
        )}

        {/* Circular Launch Button (Warm Vibrant Orange Theme) */}
        <button
          type="button"
          onClick={() => {
            setIsOpen(!isOpen);
            setUnreadNotification(false);
          }}
          className={`relative p-3.5 rounded-2xl shadow-2xl transition-all duration-300 transform active:scale-95 cursor-pointer flex items-center justify-center ${
            isOpen
              ? 'bg-slate-800 text-white rotate-90 scale-90 border border-slate-700'
              : 'bg-gradient-to-tr from-orange-600 via-amber-500 to-orange-500 text-white hover:shadow-orange-500/40 hover:shadow-2xl hover:scale-105 border-2 border-orange-400/50'
          }`}
          title="Setu AI Assistant (Solar & CRM Support)"
        >
          {isOpen ? (
            <X className="w-6 h-6" />
          ) : (
            <>
              <div className="relative">
                <Bot className="w-6 h-6" />
                <Sparkles className="w-3.5 h-3.5 text-yellow-200 absolute -top-1 -right-1 animate-spin" style={{ animationDuration: '4s' }} />
              </div>
              {unreadNotification && (
                <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-rose-500 rounded-full border-2 border-white animate-bounce" />
              )}
            </>
          )}
        </button>
      </div>

      {/* Main Chat Window Drawer (Orange Themed) */}
      {isOpen && (
        <div
          className={`fixed z-50 transition-all duration-300 ease-out flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl rounded-3xl overflow-hidden print:hidden backdrop-blur-xl ${
            isExpanded
              ? 'inset-4 md:inset-10 max-w-5xl mx-auto h-[calc(100vh-5rem)]'
              : 'bottom-20 right-4 sm:right-6 w-[calc(100vw-2rem)] sm:w-[420px] md:w-[440px] h-[580px] max-h-[82vh]'
          }`}
        >
          {/* Header - Orange / Amber Gradient */}
          <div className="px-4 py-3.5 bg-gradient-to-r from-slate-950 via-slate-900 to-orange-950 text-white flex items-center justify-between border-b border-orange-500/30 shrink-0 select-none">
            <div className="flex items-center space-x-2.5">
              <div className="relative w-9 h-9 rounded-xl bg-gradient-to-tr from-orange-500 via-amber-400 to-yellow-300 p-0.5 shadow-md flex items-center justify-center">
                <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center text-orange-400 font-black">
                  <Bot className="w-5 h-5" />
                </div>
                <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-orange-400 rounded-full border-2 border-slate-950 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="font-extrabold text-sm tracking-tight text-white">Setu AI</h3>
                  <span className="text-[9px] bg-orange-500/20 text-orange-300 font-black px-1.5 py-0.5 rounded border border-orange-400/30 uppercase tracking-wider">
                    ⚡ Live CRM
                  </span>
                </div>
                <p className="text-[10px] text-orange-200/70 font-medium">
                  Solar Engineering & Dashboard Support
                </p>
              </div>
            </div>

            {/* Header Control Buttons */}
            <div className="flex items-center space-x-1">
              <button
                type="button"
                onClick={handleClearHistory}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800/80 transition-colors cursor-pointer"
                title="Clear Chat History"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setIsExpanded(!isExpanded)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800/80 transition-colors cursor-pointer hidden sm:block"
                title={isExpanded ? 'Minimize Window' : 'Expand Fullscreen'}
              >
                {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800/80 transition-colors cursor-pointer"
                title="Close Window"
              >
                <ChevronDown className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Quick Suggestions Carousel */}
          <div className="px-3 py-2 bg-slate-50 dark:bg-slate-900/60 border-b border-slate-100 dark:border-slate-800 shrink-0 overflow-x-auto no-scrollbar flex items-center gap-1.5 select-none">
            {DEFAULT_SUGGESTIONS.map((item, idx) => (
              <button
                key={idx}
                type="button"
                disabled={isLoading}
                onClick={() => handleSend(item.prompt)}
                className="shrink-0 text-[11px] font-bold px-2.5 py-1 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-full border border-slate-200 dark:border-slate-700 hover:border-orange-500 dark:hover:border-orange-500 hover:text-orange-600 dark:hover:text-orange-400 transition-all shadow-2xs cursor-pointer flex items-center gap-1"
              >
                <span>{item.text}</span>
              </button>
            ))}
          </div>

          {/* Messages Feed */}
          <div className="flex-1 p-4 overflow-y-auto space-y-3.5 bg-slate-100/60 dark:bg-slate-950/40">
            {messages.map((msg) => {
              const isUser = msg.role === 'user';
              return (
                <div
                  key={msg.id}
                  className={`flex items-start gap-2.5 ${isUser ? 'flex-row-reverse' : 'flex-row'} group`}
                >
                  {/* Avatar */}
                  <div
                    className={`w-7 h-7 rounded-xl shrink-0 flex items-center justify-center text-xs font-black shadow-xs ${
                      isUser
                        ? 'bg-slate-800 text-white'
                        : 'bg-gradient-to-tr from-orange-600 via-amber-500 to-orange-500 text-white'
                    }`}
                  >
                    {isUser ? 'You' : <Bot className="w-4 h-4" />}
                  </div>

                  {/* Message Body */}
                  <div
                    className={`relative max-w-[85%] rounded-2xl p-3 shadow-xs ${
                      isUser
                        ? 'bg-gradient-to-r from-orange-600 via-orange-500 to-amber-600 text-white rounded-tr-none font-medium'
                        : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-tl-none border border-slate-200/80 dark:border-slate-700/80'
                    }`}
                  >
                    {isUser ? (
                      <p className="text-xs leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                    ) : (
                      renderFormattedContent(msg.content)
                    )}

                    {/* Footer Info & Copy Action */}
                    <div
                      className={`flex items-center justify-between text-[9px] pt-1.5 mt-1 border-t ${
                        isUser
                          ? 'border-orange-400/40 text-orange-100'
                          : 'border-slate-100 dark:border-slate-700/60 text-slate-400'
                      }`}
                    >
                      <span>{msg.timestamp}</span>
                      {!isUser && (
                        <button
                          type="button"
                          onClick={() => handleCopy(msg.id, msg.content)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer flex items-center gap-1"
                          title="Copy message"
                        >
                          {copiedId === msg.id ? (
                            <Check className="w-3 h-3 text-orange-500" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                          <span>{copiedId === msg.id ? 'Copied' : 'Copy'}</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* AI Typing Indicator */}
            {isLoading && (
              <div className="flex items-start gap-2.5">
                <div className="w-7 h-7 rounded-xl bg-gradient-to-tr from-orange-600 to-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs animate-pulse">
                  <Bot className="w-4 h-4" />
                </div>
                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl rounded-tl-none p-3 shadow-xs flex items-center space-x-2">
                  <Sparkles className="w-4 h-4 text-orange-500 animate-spin" />
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-300">
                    Setu AI is analyzing CRM dashboard & generating answer...
                  </span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Bar */}
          <div className="p-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 shrink-0">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="flex items-center gap-2"
            >
              <div className="relative flex-1">
                <input
                  ref={inputRef}
                  type="text"
                  value={inputQuery}
                  onChange={(e) => setInputQuery(e.target.value)}
                  placeholder={isListening ? 'Listening (boliye)...' : 'Ask Setu AI anything (Hindi / English)...'}
                  disabled={isLoading}
                  className="w-full bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-white rounded-xl pl-3.5 pr-9 py-2.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all"
                />

                {/* Voice Mic Button */}
                <button
                  type="button"
                  onClick={handleToggleVoice}
                  className={`absolute right-1.5 top-1.5 p-1.5 rounded-lg transition-colors cursor-pointer ${
                    isListening
                      ? 'bg-rose-500 text-white animate-bounce'
                      : 'text-slate-400 hover:text-orange-600 dark:hover:text-orange-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                  title={isListening ? 'Stop Listening' : 'Voice Input (Hindi/English)'}
                >
                  {isListening ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                </button>
              </div>

              {/* Send Button */}
              <button
                type="submit"
                disabled={!inputQuery.trim() || isLoading}
                className="p-2.5 bg-gradient-to-r from-orange-500 via-amber-500 to-orange-600 hover:from-orange-600 hover:to-amber-600 disabled:opacity-40 text-white rounded-xl shadow-md transition-all duration-200 cursor-pointer shrink-0 disabled:cursor-not-allowed"
                title="Send Message"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>

            <div className="flex items-center justify-between text-[10px] text-slate-400 px-1 pt-1.5">
              <span>⚡ Setu AI • Powered by Groq LPU</span>
              <span className="flex items-center gap-1 font-semibold text-orange-600 dark:text-orange-400">
                <Sun className="w-3 h-3 text-amber-500" /> Green Energy Solution
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
