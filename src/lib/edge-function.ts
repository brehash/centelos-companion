import { supabase } from "@/lib/supabase";

const DEFAULT_TIMEOUT = 30000;

function extractErrorMessage(error: any): string {
  try {
    if (error?.context?.responseBody) {
      const body = typeof error.context.responseBody === "string"
        ? JSON.parse(error.context.responseBody)
        : error.context.responseBody;
      return body?.error || body?.message || body?.msg || error.message;
    }
  } catch {
    if (typeof error?.context?.responseBody === "string" && error.context.responseBody.length < 300) {
      return error.context.responseBody;
    }
  }
  return error?.message || String(error);
}

export async function invokeWithTimeout<T = any>(
  functionName: string,
  options: { body?: any; timeout?: number } = {}
): Promise<{ data: T | null; error: any }> {
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const { data, error } = await supabase.functions.invoke(functionName, {
      body: options.body,
    });

    clearTimeout(timeoutId);

    if (error) {
      const msg = extractErrorMessage(error);
      if (msg.includes("Failed to send request to edge function")) {
        return { data: null, error: new Error("Connection failed. Please check your internet and try again.") };
      }
      return { data: null, error: new Error(msg) };
    }

    return { data, error: null };
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError" || controller.signal.aborted) {
      return { data: null, error: new Error("Request timed out. Please try again.") };
    }
    const msg = err.message || String(err);
    if (msg.includes("Failed to send request") || msg.includes("fetch")) {
      return { data: null, error: new Error("Connection failed. Please check your internet and try again.") };
    }
    return { data: null, error: err };
  }
}
