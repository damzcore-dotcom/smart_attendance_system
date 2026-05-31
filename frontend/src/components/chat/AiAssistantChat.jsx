import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, Send, X, Bot, Sparkles, Loader2, RefreshCw } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import api, { authAPI } from '../../services/api';

const AiAssistantChat = () => {
  const enableAI = import.meta.env.VITE_ENABLE_AI !== 'false';
  if (!enableAI) return null;

  const [isOpen, setIsOpen] = useState(false);
  
  const { data: userData } = useQuery({
    queryKey: ['me'],
    queryFn: () => authAPI.getMe().catch(() => null),
  });

  const user = userData?.data || authAPI.getStoredUser() || { role: 'EMPLOYEE' };
  const isEnglish = user.role === 'DIREKTUR' || user.role === 'MANAGER';

  const [messages, setMessages] = useState([
    {
      role: 'model',
      text: 'Halo! Saya adalah Asisten AI Smart Attendance Pro. Ada yang bisa saya bantu terkait data karyawan, absensi, BHL (Buruh Harian Lepas), cuti, atau info statistik lainnya?'
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (messages.length === 1 && messages[0].role === 'model') {
      setMessages([
        {
          role: 'model',
          text: isEnglish 
            ? 'Hello! I am the Smart Attendance Pro AI Assistant. How can I help you with employee data, attendance logs, daily workers (BHL), leaves, or other statistical analysis?'
            : 'Halo! Saya adalah Asisten AI Smart Attendance Pro. Ada yang bisa saya bantu terkait data karyawan, absensi, BHL (Buruh Harian Lepas), cuti, atau info statistik lainnya?'
        }
      ]);
    }
  }, [isEnglish]);

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userText = input.trim();
    setInput('');
    
    // Add user message to UI
    const updatedMessages = [...messages, { role: 'user', text: userText }];
    setMessages(updatedMessages);
    setIsLoading(true);

    try {
      // Format history for Gemini API: [{ role: 'user'|'model', text: '...' }]
      // Strip out the first greeting message to avoid cluttering context
      const apiHistory = updatedMessages.slice(1, -1); 

      const res = await api.post('/chat', {
        message: userText,
        history: apiHistory
      });

      if (res.data && res.data.reply) {
        setMessages(prev => [...prev, { role: 'model', text: res.data.reply }]);
      } else {
        throw new Error(isEnglish ? 'Response format is invalid' : 'Format respon tidak sesuai');
      }
    } catch (err) {
      console.error('Chat error:', err);
      setMessages(prev => [
        ...prev,
        { 
          role: 'model', 
          text: isEnglish 
            ? `Sorry, I failed to process your message. ${err.message || 'API connection issue.'}`
            : `Maaf, saya gagal memproses pesan Anda. ${err.message || 'Koneksi API bermasalah.'}` 
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearChat = () => {
    setMessages([
      {
        role: 'model',
        text: isEnglish
          ? 'Hello! The chat session has been reset. How can I help you with employee data, attendance logs, or daily workers today?'
          : 'Halo! Sesi obrolan telah di-reset. Ada yang bisa saya bantu terkait data karyawan, absensi, atau BHL hari ini?'
      }
    ]);
  };

  // Helper to format simple markdown-like elements (bold, bullet points, code blocks) in text
  const formatMessageText = (text) => {
    if (!text) return '';
    
    // Split into lines
    const lines = text.split('\n');
    
    return lines.map((line, idx) => {
      let formattedLine = line;
      
      // Bold **text**
      const boldRegex = /\*\*(.*?)\*\*/g;
      const parts = [];
      let lastIndex = 0;
      let match;
      
      while ((match = boldRegex.exec(formattedLine)) !== null) {
        if (match.index > lastIndex) {
          parts.push(formattedLine.substring(lastIndex, match.index));
        }
        parts.push(<strong key={match.index} className="font-semibold text-gray-900 dark:text-white">{match[1]}</strong>);
        lastIndex = boldRegex.lastIndex;
      }
      
      if (lastIndex < formattedLine.length) {
        parts.push(formattedLine.substring(lastIndex));
      }
      
      const content = parts.length > 0 ? parts : formattedLine;

      // Unordered list bullet points starting with "- " or "* "
      if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
        const bulletText = line.trim().substring(2);
        return (
          <li key={idx} className="ml-4 list-disc text-sm leading-relaxed mb-1">
            {formatMessageText(bulletText)}
          </li>
        );
      }

      // Check if line represents a markdown table divider (e.g. |---|---|)
      if (line.trim().startsWith('|') && line.includes('-')) {
        return null; // Skip table border dividers in plain presentation
      }

      // Standard table row format | cell | cell |
      if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
        const cells = line.split('|').filter(c => c.trim() !== '');
        return (
          <div key={idx} className="flex border-b border-gray-200 dark:border-gray-700 py-1 text-xs">
            {cells.map((cell, cIdx) => (
              <span key={cIdx} className="flex-1 px-2 font-mono truncate" title={cell.trim()}>
                {cell.trim()}
              </span>
            ))}
          </div>
        );
      }

      return (
        <p key={idx} className="text-sm leading-relaxed mb-1 min-h-[1rem]">
          {content}
        </p>
      );
    });
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 font-sans">
      {/* Floating Action Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-tr from-indigo-600 via-indigo-700 to-violet-600 text-white shadow-2xl transition-all duration-300 hover:scale-110 hover:shadow-indigo-500/30 focus:outline-none cursor-pointer"
        >
          <Sparkles className="h-6 w-6 animate-pulse" />
        </button>
      )}

      {/* Chat Window Panel */}
      {isOpen && (
        <div className="flex h-[520px] w-96 flex-col rounded-2xl border border-gray-150/70 bg-white/95 shadow-2xl backdrop-blur-xl transition-all duration-300 dark:border-gray-800 dark:bg-gray-900/95">
          {/* Header */}
          <div className="flex items-center justify-between rounded-t-2xl bg-gradient-to-r from-indigo-700 to-violet-700 px-4 py-3.5 text-white">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10">
                <Bot className="h-5 w-5 text-indigo-200" />
              </div>
              <div>
                <h3 className="text-sm font-semibold tracking-wide">AI Assistant</h3>
                <div className="flex items-center gap-1.5 text-xs text-indigo-200">
                  <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse"></span>
                  <span>Online • Query Agent</span>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <button 
                onClick={handleClearChat}
                title={isEnglish ? "Reset Chat" : "Reset Obrolan"}
                className="rounded-lg p-1.5 text-indigo-200 transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="rounded-lg p-1.5 text-indigo-200 transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg, index) => (
              <div
                key={index}
                className={`flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {/* AI Avatar */}
                {msg.role === 'model' && (
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400">
                    <Bot className="h-4 w-4" />
                  </div>
                )}

                {/* Bubble Text */}
                <div
                  className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-gray-800 dark:text-gray-100 ${
                    msg.role === 'user'
                      ? 'rounded-tr-none bg-indigo-600 text-white dark:bg-indigo-600'
                      : 'rounded-tl-none bg-gray-100 dark:bg-gray-800'
                  }`}
                >
                  <div className={msg.role === 'user' ? 'text-white' : ''}>
                    {formatMessageText(msg.text)}
                  </div>
                </div>
              </div>
            ))}

            {/* Bouncing Typing Indicator */}
            {isLoading && (
              <div className="flex gap-2.5 justify-start">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400">
                  <Bot className="h-4 w-4" />
                </div>
                <div className="rounded-2xl rounded-tl-none bg-gray-100 px-4 py-3 dark:bg-gray-800">
                  <div className="flex items-center gap-1">
                    <Loader2 className="h-4 w-4 animate-spin text-indigo-600 dark:text-indigo-400" />
                    <span className="text-xs text-gray-500">
                      {isEnglish ? 'Querying database...' : 'Membaca database...'}
                    </span>
                  </div>
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>

          {/* Footer Input */}
          <form
            onSubmit={handleSend}
            className="flex items-center gap-2 border-t border-gray-150/70 p-3 bg-gray-50/50 rounded-b-2xl dark:border-gray-800 dark:bg-gray-900/50"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={isEnglish ? "Ask about today's attendance, daily worker logs..." : "Tanyakan absensi hari ini, data BHL..."}
              disabled={isLoading}
              className="flex-1 rounded-xl border border-gray-300 bg-white px-3.5 py-2 text-sm outline-none transition-shadow focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-gray-700 dark:bg-gray-800"
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white transition-all hover:bg-indigo-700 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed cursor-pointer"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

export default AiAssistantChat;
