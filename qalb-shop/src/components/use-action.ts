"use client";

import { useCallback, useRef, useState } from "react";
import { ApiError } from "@/lib/api-client";

export interface ActionState {
  pending: boolean;
  error: string | null;
  fieldErrors: Record<string, string[]>;
}

/**
 * Wraps an async submit: blocks double submission (ref guard, so even rapid double clicks
 * in the same tick are ignored) and surfaces API errors as form + field messages.
 */
export function useAction() {
  const inFlight = useRef(false);
  const [state, setState] = useState<ActionState>({ pending: false, error: null, fieldErrors: {} });

  const run = useCallback(async <T,>(task: () => Promise<T>): Promise<T | undefined> => {
    if (inFlight.current) return undefined;
    inFlight.current = true;
    setState({ pending: true, error: null, fieldErrors: {} });
    try {
      const result = await task();
      setState({ pending: false, error: null, fieldErrors: {} });
      return result;
    } catch (error) {
      if (error instanceof ApiError) {
        setState({
          pending: false,
          error: Object.keys(error.fieldErrors).length > 0 ? null : error.message,
          fieldErrors: error.fieldErrors,
        });
      } else {
        setState({ pending: false, error: "Something went wrong. Please try again.", fieldErrors: {} });
      }
      return undefined;
    } finally {
      inFlight.current = false;
    }
  }, []);

  const fail = useCallback((fieldErrors: Record<string, string[]>) => {
    setState({ pending: false, error: null, fieldErrors });
  }, []);

  return { ...state, run, fail };
}
