import { Injectable } from '@angular/core';

export type LiveEvent =
  | { type: 'audio'; data: string }
  | { type: 'user'; text: string }
  | { type: 'gemini'; text: string }
  | { type: 'turn_complete' }
  | { type: 'interrupted' }
  | { type: 'ready' }
  | { type: 'error'; error: string }
  | { type: 'timer_started'; timer_id: string; title: string; duration_seconds: number }
  | { type: 'timer_updated'; timer_id: string; title: string; remaining_seconds: number }
  | { type: 'timer_ended'; timer_id: string; title: string }
  | { type: 'timer_cancelled'; timer_id: string; title: string }
  | { type: 'timer_paused'; timer_id: string; title: string; remaining_seconds: number }
  | {
      type: 'places_result';
      places: Array<{
        name: string;
        formattedAddress: string;
        rating?: number;
        websiteUri?: string | null;
        googleMapsUri?: string | null;
        photoName?: string | null;
      }>;
    }
  | { type: 'stores_hidden' }
  | { type: 'camera_command'; action: 'open' | 'close' }
  | { type: 'recipe_result'; recipe: { title: string; ingredients: string[]; steps: string[] } }
  | { type: 'recipe_saved'; recipe: { title: string; ingredients: string[]; steps: string[] } }
  | { type: 'ingredient_added'; index: number }
  | { type: 'closed'; code: number; reason: string };

export type LiveEventCallback = (event: LiveEvent) => void;

export interface RecipeInit {
  title: string;
  ingredients: string[];
  steps: string[];
}

export interface LiveConnectOptions {
  assistantName?: string;
  personality?: string;
  responseType?: string;
  language?: string;
  voice?: string;
  userLat?: number;
  userLng?: number;
  savedRecipes?: RecipeInit[];
  lastRecipe?: RecipeInit | null;
}

@Injectable({ providedIn: 'root' })
export class LiveAgentService {
  private ws: WebSocket | null = null;
  private eventCallback: LiveEventCallback | null = null;

  /** Build WebSocket URL with optional query params for system instruction. */
  private getWsUrl(options?: LiveConnectOptions): string {
    const origin =
      typeof location !== 'undefined' ? location.origin : 'http://localhost:4200';
    const wsProtocol = origin.startsWith('https') ? 'wss' : 'ws';
    const host = origin.replace(/^https?:\/\//, '');
    let path = `${wsProtocol}://${host}/api/live`;
    const params = new URLSearchParams();
    if (options?.assistantName?.trim()) params.set('assistant_name', options.assistantName.trim());
    if (options?.personality?.trim()) params.set('personality', options.personality.trim());
    if (options?.responseType?.trim()) params.set('response_type', options.responseType.trim());
    if (options?.language?.trim()) params.set('language', options.language.trim());
    if (options?.voice?.trim()) params.set('voice_name', options.voice.trim());
    if (options?.userLat != null && options?.userLng != null) {
      params.set('user_lat', String(options.userLat));
      params.set('user_lng', String(options.userLng));
    }
    const qs = params.toString();
    if (qs) path += `?${qs}`;
    return path;
  }

  private readonly CONNECT_TIMEOUT_MS = 15000;

  connect(callback: LiveEventCallback, options?: LiveConnectOptions): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }
      if (this.ws?.readyState === WebSocket.CONNECTING) {
        reject(new Error('Connection already in progress'));
        return;
      }
      if (this.ws) {
        this.ws.close();
        this.ws = null;
      }
      const url = this.getWsUrl(options);
      this.eventCallback = callback;
      const ws = new WebSocket(url);
      ws.binaryType = 'arraybuffer';

      const timeoutId = setTimeout(() => {
        if (ws.readyState === WebSocket.CONNECTING) {
          ws.close();
          this.ws = null;
          reject(new Error('Connection timed out. Is the backend running on port 8000?'));
        }
      }, this.CONNECT_TIMEOUT_MS);

      ws.onopen = () => {
        clearTimeout(timeoutId);
        this.ws = ws;
        if (options?.savedRecipes?.length || options?.lastRecipe) {
          try {
            ws.send(
              JSON.stringify({
                type: 'init',
                saved_recipes: options.savedRecipes ?? [],
                last_recipe: options.lastRecipe ?? null,
              }),
            );
          } catch {
            // ignore
          }
        }
        resolve();
      };
      ws.onerror = () => {
        clearTimeout(timeoutId);
        if (this.ws === ws) this.ws = null;
        reject(new Error('WebSocket connection failed. Check backend and proxy.'));
      };
      ws.onclose = (ev) => {
        clearTimeout(timeoutId);
        if (this.ws === ws) {
          this.ws = null;
          const cb = this.eventCallback;
          this.eventCallback = null;
          if (cb) {
            cb({ type: 'closed', code: ev.code, reason: ev.reason || '' });
          }
        }
      };
      ws.onmessage = (e) => {
        if (typeof e.data !== 'string') return;
        try {
          const msg = JSON.parse(e.data) as LiveEvent;
          this.eventCallback?.(msg);
        } catch {
          // ignore
        }
      };
    });
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close(1000, 'User ended session');
      this.ws = null;
    }
    this.eventCallback = null;
  }

  sendAudio(pcmBase64: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'audio', data: pcmBase64 }));
    }
  }

  sendVideo(jpegBase64: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'video', data: jpegBase64 }));
    }
  }

  sendText(text: string): void {
    if (this.ws?.readyState === WebSocket.OPEN && text.trim()) {
      this.ws.send(JSON.stringify({ type: 'text', text: text.trim() }));
    }
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
