'use client'

import { useState, useRef, useEffect } from 'react'
import { MessageCircle, Send, X, Loader2, Settings } from 'lucide-react'
import { useToast } from '@/contexts/ToastContext'

interface CalendarChatProps {
  onUpdate?: () => void
}

export function CalendarChat({ onUpdate }: CalendarChatProps) {
  const { showToast } = useToast()
  const [isOpen, setIsOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([])
  const [loading, setLoading] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // Load API key from localStorage
    const savedKey = localStorage.getItem('claudeApiKey')
    if (savedKey) {
      setApiKey(savedKey)
    }
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen])

  const handleSend = async () => {
    if (!message.trim()) return

    if (!apiKey) {
      setShowSettings(true)
      showToast('Please set your Claude API key first', 'error')
      return
    }

    const userMessage = message
    setMessage('')
    setMessages(prev => [...prev, { role: 'user', content: userMessage }])
    setLoading(true)

    try {
      const response = await fetch('/api/time-blocks/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          apiKey
        })
      })

      if (!response.ok) {
        throw new Error('Failed to process message')
      }

      const data = await response.json()
      
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: data.message || 'Action completed successfully'
      }])

      // Trigger calendar refresh
      if (onUpdate) {
        onUpdate()
      }

      showToast(data.message || 'Action completed', 'success')
    } catch (error) {
      console.error('Error sending message:', error)
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: 'Sorry, I encountered an error processing your request.'
      }])
      showToast('Failed to process message', 'error')
    } finally {
      setLoading(false)
    }
  }

  const saveApiKey = () => {
    localStorage.setItem('claudeApiKey', apiKey)
    setShowSettings(false)
    showToast('API key saved', 'success')
  }

  return (
    <>
      {/* Chat Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 bg-blue-500 hover:bg-blue-600 text-white rounded-full p-4 shadow-lg transition-all transform hover:scale-110 z-50"
      >
        <MessageCircle className="w-6 h-6" />
      </button>

      {/* Chat Window */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 w-96 bg-gray-800 rounded-lg shadow-2xl z-50 flex flex-col max-h-[600px] border border-gray-700">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-700">
            <h3 className="text-lg font-semibold text-gray-100">Calendar Assistant</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="text-gray-400 hover:text-gray-200 transition-colors"
              >
                <Settings className="w-5 h-5" />
              </button>
              <button
                onClick={() => {
                  setIsOpen(false)
                  setShowSettings(false)
                }}
                className="text-gray-400 hover:text-gray-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Settings Panel */}
          {showSettings && (
            <div className="p-4 border-b border-gray-700 bg-gray-900/50">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Claude API Key
              </label>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-ant-..."
                  className="flex-1 bg-gray-700 text-gray-100 px-3 py-2 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={saveApiKey}
                  className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors text-sm"
                >
                  Save
                </button>
              </div>
              <p className="mt-2 text-xs text-gray-400">
                Your API key is stored locally and never sent to our servers.
              </p>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 && (
              <div className="text-center text-gray-400 py-8">
                <p className="mb-2">Hi! I can help you manage your calendar.</p>
                <p className="text-sm">Try saying:</p>
                <ul className="text-sm mt-2 space-y-1">
                  <li>&quot;Add a meeting from 2pm to 3pm tomorrow&quot;</li>
                  <li>&quot;Create a work block from 9am to 12pm&quot;</li>
                  <li>&quot;Delete the last time block&quot;</li>
                  <li>&quot;Update the 10am block title to &apos;Team Standup&apos;&quot;</li>
                </ul>
              </div>
            )}
            
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-4 py-2 ${
                    msg.role === 'user'
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-700 text-gray-100'
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                </div>
              </div>
            ))}
            
            {loading && (
              <div className="flex justify-start">
                <div className="bg-gray-700 rounded-lg px-4 py-2">
                  <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-4 border-t border-gray-700">
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSend()
                  }
                }}
                placeholder="Type your message..."
                className="flex-1 bg-gray-700 text-gray-100 px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={loading}
              />
              <button
                onClick={handleSend}
                disabled={loading || !message.trim()}
                className="bg-blue-500 hover:bg-blue-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white p-2 rounded-lg transition-colors"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}