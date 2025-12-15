/**
 * Gladiator Stream Hook
 *
 * Manages SSE connection for individual gladiator's streaming output.
 */

import { useEffect, useState, useRef } from 'react';

export interface GladiatorStreamEvent {
  type: 'text' | 'tool_use' | 'status' | 'complete' | 'error';
  content: string;
  timestamp: number;
  data?: any;
}

export interface GladiatorStreamState {
  output: string; // Accumulated text output
  events: GladiatorStreamEvent[];
  isStreaming: boolean;
  isComplete: boolean;
  error: string | null;
}

export function useGladiatorStream(gladiatorId: string) {
  const [state, setState] = useState<GladiatorStreamState>({
    output: '',
    events: [],
    isStreaming: false,
    isComplete: false,
    error: null,
  });

  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const eventSource = new EventSource(`/api/gladiators/${gladiatorId}/stream`);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setState(prev => ({ ...prev, isStreaming: true, error: null }));
    };

    eventSource.addEventListener('text', (e: MessageEvent) => {
      const event: GladiatorStreamEvent = JSON.parse(e.data);
      setState(prev => ({
        ...prev,
        output: prev.output + event.content,
        events: [...prev.events, event],
      }));
    });

    eventSource.addEventListener('tool_use', (e: MessageEvent) => {
      const event: GladiatorStreamEvent = JSON.parse(e.data);
      setState(prev => ({
        ...prev,
        events: [...prev.events, event],
      }));
    });

    eventSource.addEventListener('status', (e: MessageEvent) => {
      const event: GladiatorStreamEvent = JSON.parse(e.data);
      setState(prev => ({
        ...prev,
        events: [...prev.events, event],
      }));
    });

    eventSource.addEventListener('complete', (e: MessageEvent) => {
      const event: GladiatorStreamEvent = JSON.parse(e.data);
      setState(prev => ({
        ...prev,
        isStreaming: false,
        isComplete: true,
        events: [...prev.events, event],
      }));
      eventSource.close();
    });

    eventSource.addEventListener('error_event', (e: MessageEvent) => {
      const event: GladiatorStreamEvent = JSON.parse(e.data);
      setState(prev => ({
        ...prev,
        error: event.content,
        isStreaming: false,
        events: [...prev.events, event],
      }));
    });

    eventSource.onerror = () => {
      setState(prev => ({
        ...prev,
        isStreaming: false,
        error: prev.error || 'Connection lost',
      }));
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [gladiatorId]);

  return state;
}
