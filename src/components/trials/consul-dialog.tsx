/**
 * Consul Dialog Component
 *
 * Interactive modal for conversing with the Consul about the trial verdict
 * and executing decree actions.
 */

'use client';

import { useState, useRef, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Send, Loader2, GitMerge, GitPullRequest, Sparkles } from 'lucide-react';

interface Verdict {
  summary: string;
  winnerGladiatorId: string | null;
  reasoning: string;
}

interface ConsulDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trialId: string;
  verdict: Verdict;
}

interface Message {
  role: 'user' | 'consul';
  content: string;
}

export function ConsulDialog({ open, onOpenChange, trialId, verdict }: ConsulDialogProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Initialize conversation when dialog opens
  useEffect(() => {
    if (open && !initialized) {
      initializeConversation();
      setInitialized(true);
    }
  }, [open, initialized]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const initializeConversation = async () => {
    setIsStreaming(true);

    try {
      const response = await fetch(`/api/trials/${trialId}/consul`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: '__INIT__', // Special message to trigger greeting
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to initialize conversation');
      }

      await streamResponse(response);
    } catch (error) {
      console.error('Error initializing conversation:', error);
      setMessages([
        {
          role: 'consul',
          content: 'Salutations. I am the Consul, ready to assist with decree actions. How may I help you today?',
        },
      ]);
    } finally {
      setIsStreaming(false);
    }
  };

  const streamResponse = async (response: Response) => {
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (!reader) {
      throw new Error('No response body');
    }

    let accumulatedContent = '';

    // Add placeholder message for streaming
    const placeholderIndex = messages.length;
    setMessages(prev => [
      ...prev,
      { role: 'consul', content: '' },
    ]);

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              if (parsed.type === 'content') {
                accumulatedContent += parsed.text;
                // Update the placeholder message
                setMessages(prev => {
                  const newMessages = [...prev];
                  newMessages[placeholderIndex] = {
                    role: 'consul',
                    content: accumulatedContent,
                  };
                  return newMessages;
                });
              }
            } catch (e) {
              // Ignore parse errors
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || isStreaming) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsStreaming(true);

    try {
      const response = await fetch(`/api/trials/${trialId}/consul`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: userMessage,
          history: messages,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to send message');
      }

      await streamResponse(response);
    } catch (error) {
      console.error('Error sending message:', error);
      setMessages(prev => [
        ...prev,
        {
          role: 'consul',
          content: 'My apologies, I encountered an error. Please try again.',
        },
      ]);
    } finally {
      setIsStreaming(false);
    }
  };

  const handleQuickAction = (action: string) => {
    setInput(action);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-2xl">⚖️</span>
            <span>Consul</span>
          </DialogTitle>
          <DialogDescription>
            Discuss the verdict and execute decree actions
          </DialogDescription>
        </DialogHeader>

        {/* Verdict Summary */}
        <div className="bg-purple-950/20 border border-purple-500/30 rounded-lg p-3 text-sm">
          <strong>Verdict:</strong> {verdict.summary}
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1 pr-4" ref={scrollRef}>
          <div className="space-y-4">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg p-3 ${
                    message.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'bg-muted'
                  }`}
                >
                  {message.role === 'consul' && (
                    <Badge variant="outline" className="mb-2">
                      Consul
                    </Badge>
                  )}
                  <div className="whitespace-pre-wrap text-sm">
                    {message.content}
                  </div>
                </div>
              </div>
            ))}
            {isStreaming && messages[messages.length - 1]?.role !== 'consul' && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-lg p-3">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Quick Actions */}
        {!isStreaming && messages.length > 0 && (
          <div className="flex flex-wrap gap-2 py-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleQuickAction('Merge the winner\'s changes')}
            >
              <GitMerge className="h-3 w-3 mr-1" />
              Merge Winner
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleQuickAction('Create a PR with the winner\'s changes')}
            >
              <GitPullRequest className="h-3 w-3 mr-1" />
              Create PR
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleQuickAction('Synthesize the best elements from both gladiators')}
            >
              <Sparkles className="h-3 w-3 mr-1" />
              Synthesize
            </Button>
          </div>
        )}

        {/* Input */}
        <div className="flex gap-2 pt-2 border-t">
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask the Consul for guidance..."
            disabled={isStreaming}
            className="flex-1"
          />
          <Button
            onClick={sendMessage}
            disabled={!input.trim() || isStreaming}
            size="icon"
          >
            {isStreaming ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
