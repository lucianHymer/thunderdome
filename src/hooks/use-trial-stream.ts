/**
 * Client-Side Trial Stream Hook
 *
 * Provides real-time updates for a trial via Server-Sent Events
 * with automatic reconnection on connection loss
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type TrialEvent = {
  type: string;
  trialId?: string;
  timestamp?: string;
  [key: string]: any;
};

export type TrialStreamState = {
  connected: boolean;
  error: string | null;
  events: TrialEvent[];
  lastEvent: TrialEvent | null;
};

export type UseTrialStreamOptions = {
  enabled?: boolean;
  reconnectDelay?: number; // milliseconds
  maxReconnectAttempts?: number;
  onEvent?: (event: TrialEvent) => void;
  onError?: (error: Error) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
};

/**
 * Hook to stream trial updates via SSE
 */
export function useTrialStream(trialId: string | null, options: UseTrialStreamOptions = {}) {
  const {
    enabled = true,
    reconnectDelay = 2000,
    maxReconnectAttempts = 10,
    onEvent,
    onError,
    onConnect,
    onDisconnect,
  } = options;

  const [state, setState] = useState<TrialStreamState>({
    connected: false,
    error: null,
    events: [],
    lastEvent: null,
  });

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Connect to the SSE stream
  const connect = useCallback(() => {
    if (!trialId || !enabled) {
      return;
    }

    // Close existing connection if any
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    try {
      const eventSource = new EventSource(`/api/trials/${trialId}/stream`);
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        setState((prev) => ({ ...prev, connected: true, error: null }));
        reconnectAttemptsRef.current = 0;
        onConnect?.();
      };

      eventSource.onmessage = (event) => {
        try {
          const data: TrialEvent = JSON.parse(event.data);

          setState((prev) => ({
            ...prev,
            events: [...prev.events, data],
            lastEvent: data,
          }));

          onEvent?.(data);
        } catch (_error) {}
      };

      eventSource.onerror = (_error) => {
        eventSource.close();

        setState((prev) => ({
          ...prev,
          connected: false,
          error: "Connection lost",
        }));

        onDisconnect?.();

        // Attempt to reconnect
        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current++;

          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, reconnectDelay);
        } else {
          const maxRetriesError = new Error("Max reconnection attempts reached");
          setState((prev) => ({
            ...prev,
            error: maxRetriesError.message,
          }));
          onError?.(maxRetriesError);
        }
      };
    } catch (error) {
      const connectionError = error instanceof Error ? error : new Error("Failed to connect");
      setState((prev) => ({
        ...prev,
        connected: false,
        error: connectionError.message,
      }));
      onError?.(connectionError);
    }
  }, [
    trialId,
    enabled,
    reconnectDelay,
    maxReconnectAttempts,
    onEvent,
    onError,
    onConnect,
    onDisconnect,
  ]);

  // Disconnect from the stream
  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    setState((prev) => ({ ...prev, connected: false }));
  }, []);

  // Manually trigger reconnection
  const reconnect = useCallback(() => {
    disconnect();
    reconnectAttemptsRef.current = 0;
    connect();
  }, [connect, disconnect]);

  // Clear all events
  const clearEvents = useCallback(() => {
    setState((prev) => ({ ...prev, events: [], lastEvent: null }));
  }, []);

  // Effect to manage connection lifecycle
  useEffect(() => {
    if (enabled && trialId) {
      connect();
    } else {
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [trialId, enabled, connect, disconnect]);

  return {
    ...state,
    reconnect,
    disconnect,
    clearEvents,
  };
}
