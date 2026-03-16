import { Component, output, inject, signal, input, OnInit, OnDestroy, effect } from '@angular/core';
import { Subscription } from 'rxjs';
import { BlobComponent } from '../blob-component/blob-component';
import { MicrophoneComponent } from '../microphone-component/microphone-component';
import { TimerComponent, type TimerItem } from '../timer-component/timer-component';
import { StoresComponent, type PlaceResult } from '../stores-component/stores-component';
import { RecipeComponent, type Recipe } from '../recipe-component/recipe-component';
import { CameraComponent } from '../camera-component/camera-component';
import { LiveAgentService, LiveEvent } from '../../services/live-agent.service';
import { startLiveAudioCapture, LiveAudioPlayback } from '../../services/live-audio.service';
import { startLiveVideoCapture } from '../../services/live-video.service';
import { SavedRecipesComponent } from '../saved-recipes-component/saved-recipes-component';

const LAST_RECIPE_STORAGE_KEY = 'sous-chef-last-current-recipe';
const SAVED_RECIPES_STORAGE_KEY = 'sous-chef-saved-recipes';

export interface AgentLiveState {
  isConnected(): boolean;
  isConnecting(): boolean;
}

@Component({
  selector: 'app-main-component',
  imports: [
    BlobComponent,
    MicrophoneComponent,
    TimerComponent,
    StoresComponent,
    RecipeComponent,
    CameraComponent,
    SavedRecipesComponent,
  ],
  templateUrl: './main-component.html',
  styleUrl: './main-component.css',
})
export class MainComponent implements OnInit, OnDestroy {
  readonly openSettings = output<void>();
  readonly assistantName = input<string>('Sous Chef');
  readonly personality = input<string>('friendly');
  readonly responseType = input<string>('concise');
  readonly language = input<string>('en');
  readonly voice = input<string>('Aoede');

  readonly agentError = signal('');
  readonly errorDismissing = signal(false);
  readonly agentLoading = signal(false);
  readonly speakReplies = signal(true);
  readonly cameraEnabled = signal(false);
  readonly agentLevel = signal(0);

  readonly timers = signal<TimerItem[]>([]);

  readonly storesList = signal<PlaceResult[]>([]);
  readonly currentRecipe = signal<Recipe | null>(null);
  readonly ingredientChecked = signal<boolean[]>([]);
  readonly recipeSaved = signal(false);
  readonly savedRecipes = signal<Recipe[]>([]);
  readonly showSavedPanel = signal(false);
  readonly userCoords = signal<{ lat: number; lng: number } | null>(null);

  readonly liveConnected = signal(false);
  readonly liveConnecting = signal(false);

  private timerTickId: ReturnType<typeof setInterval> | null = null;
  private errorDismissTimeoutId: ReturnType<typeof setTimeout> | null = null;

  readonly agentLive: AgentLiveState = {
    isConnected: () => this.liveConnected() ?? false,
    isConnecting: () => this.liveConnecting() ?? false,
  };

  private subs = new Subscription();
  private readonly liveAgent = inject(LiveAgentService);

  constructor() {
    effect(() => {
      const err = this.agentError();
      if (this.errorDismissTimeoutId) {
        clearTimeout(this.errorDismissTimeoutId);
        this.errorDismissTimeoutId = null;
      }
      this.errorDismissing.set(false);
      if (!err) return;
      this.errorDismissTimeoutId = setTimeout(() => {
        this.errorDismissing.set(true);
        setTimeout(() => {
          this.agentError.set('');
          this.errorDismissing.set(false);
          this.errorDismissTimeoutId = null;
        }, 600);
      }, 5000);
    });
  }

  private stopAudioCapture: (() => void) | null = null;
  private playback: LiveAudioPlayback | null = null;
  private stopVideoCapture: (() => void) | null = null;

  readonly cameraStream = signal<MediaStream | null>(null);

  ngOnInit(): void {
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => this.userCoords.set({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => {},
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 300_000 },
      );
    }
    this.loadSavedRecipes();
    setTimeout(() => this.connectLive(), 300);
  }

  private loadSavedRecipes(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      const raw = localStorage.getItem(SAVED_RECIPES_STORAGE_KEY);
      if (!raw) return;
      const list = JSON.parse(raw) as unknown;
      if (!Array.isArray(list)) return;
      const recipes = list.filter(
        (r): r is Recipe =>
          r != null &&
          typeof r === 'object' &&
          typeof (r as Recipe).title === 'string' &&
          Array.isArray((r as Recipe).ingredients) &&
          Array.isArray((r as Recipe).steps),
      );
      this.savedRecipes.set(recipes);
    } catch {
      // ignore corrupted storage
    }
  }

  private persistSavedRecipes(recipes: Recipe[]): void {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(SAVED_RECIPES_STORAGE_KEY, JSON.stringify(recipes));
    } catch {
      // ignore
    }
  }

  /** Last recipe (from previous session) for agent to show only when user asks. */
  getLastRecipeFromStorage(): Recipe | null {
    try {
      if (typeof localStorage === 'undefined') return null;
      const raw = localStorage.getItem(LAST_RECIPE_STORAGE_KEY);
      if (!raw) return null;
      const recipe = JSON.parse(raw) as Recipe;
      if (!recipe || !Array.isArray(recipe.ingredients) || !Array.isArray(recipe.steps))
        return null;
      return recipe;
    } catch {
      return null;
    }
  }

  private persistLastRecipe(recipe: Recipe): void {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(LAST_RECIPE_STORAGE_KEY, JSON.stringify(recipe));
    } catch {
      // ignore quota / privacy errors
    }
  }

  ngOnDestroy(): void {
    if (this.errorDismissTimeoutId) clearTimeout(this.errorDismissTimeoutId);
    this.subs.unsubscribe();
    this.disconnectLive();
    this.playback?.dispose();
  }

  async connectLive(): Promise<void> {
    if (this.liveConnected() || this.liveConnecting()) return;
    this.liveConnecting.set(true);
    this.agentError.set('');
    try {
      this.playback = new LiveAudioPlayback({
        onInterrupt: () => {},
        onLevel: (level) => this.agentLevel.set(level),
      });
      const coords = this.userCoords();
      await this.liveAgent.connect((event) => this.onLiveEvent(event), {
        assistantName: this.assistantName() || undefined,
        personality: this.personality() || undefined,
        responseType: this.responseType() || undefined,
        language: this.language() || undefined,
        voice: this.voice() || undefined,
        userLat: coords?.lat,
        userLng: coords?.lng,
        savedRecipes: this.savedRecipes(),
        lastRecipe: this.getLastRecipeFromStorage(),
      });
      this.liveConnected.set(true);
    } catch (err) {
      this.agentError.set(err instanceof Error ? err.message : 'Connect failed');
    } finally {
      this.liveConnecting.set(false);
    }
  }

  disconnectLive(): void {
    this.stopTimerTick();
    this.timers.set([]);
    this.storesList.set([]);
    this.currentRecipe.set(null);
    this.ingredientChecked.set([]);
    this.recipeSaved.set(false);
    this.liveAgent.disconnect();
    this.liveConnected.set(false);
    this.stopAudioCapture?.();
    this.stopAudioCapture = null;
    this.stopVideoCapture?.();
    this.stopVideoCapture = null;
    this.cameraStream()
      ?.getTracks()
      .forEach((t) => t.stop());
    this.cameraStream.set(null);
    this.cameraEnabled.set(false);
    this.playback?.dispose();
    this.playback = null;
    this.agentLevel.set(0);
  }

  private stopTimerTick(): void {
    if (this.timerTickId !== null) {
      clearInterval(this.timerTickId);
      this.timerTickId = null;
    }
  }

  private startTimerTick(): void {
    this.stopTimerTick();
    this.timerTickId = setInterval(() => {
      const anyRunning = this.timers().some((t) => t.status === 'running');
      if (!anyRunning) {
        this.stopTimerTick();
        return;
      }
      this.timers.update((list) =>
        list
          .map((t) => {
            if (t.status !== 'running') return t;
            const next = Math.max(0, (t.remainingSeconds ?? 0) - 1);
            if (next <= 0) return null;
            return { ...t, remainingSeconds: next };
          })
          .filter((t): t is NonNullable<typeof t> => t != null),
      );
    }, 1000);
  }

  private normalizeForMatch(s: string): string {
    return (s || '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private ingredientKeywords(ingredientText: string): string[] {
    const t = this.normalizeForMatch(ingredientText);
    if (!t) return [];

    const stop = new Set([
      'a',
      'an',
      'and',
      'or',
      'of',
      'to',
      'the',
      'for',
      'with',
      'without',
      'add',
      'added',
      'i',
      'ive',
      'i ve',
      'we',
      'you',
      'this',
      'that',
      'it',
      'item',
      'tsp',
      'teaspoon',
      'teaspoons',
      'tbsp',
      'tablespoon',
      'tablespoons',
      'cup',
      'cups',
      'oz',
      'ounce',
      'ounces',
      'lb',
      'lbs',
      'pound',
      'pounds',
      'g',
      'gram',
      'grams',
      'kg',
      'ml',
      'l',
      'liter',
      'liters',
      'pinch',
      'dash',
      'slice',
      'slices',
      'clove',
      'cloves',
      'fresh',
      'optional',
      'taste',
      'tastes',
      'needed',
      'as',
      'at',
    ]);

    return t
      .split(' ')
      .map((w) => w.trim())
      .filter((w) => w.length >= 3)
      .filter((w) => !/^\d+([./]\d+)?$/.test(w))
      .filter((w) => !stop.has(w));
  }

  private tryAutoCheckAddedItem(userText: string): void {
    const recipe = this.currentRecipe();
    if (!recipe || !Array.isArray(recipe.ingredients) || recipe.ingredients.length === 0) return;

    const utter = this.normalizeForMatch(userText);
    if (!utter) return;

    if (
      /\btimer\b|\bstores?\b|\bcamera\b|\bclose\s+(the\s+)?(stores?|timer|camera)\b/i.test(userText)
    )
      return;

    if (!/\badded\b/.test(utter) && !/\badd\b/.test(utter) && !/\bmarked\b/.test(utter)) return;

    const checked = this.ingredientChecked();

    const allPhrases =
      /\ball\s*(the\s*)?(ingredients?|items?)\b|\b(ingredients?|items?)\s*all\b|\beverything\b|\ball\s*of\s*them\b|\bmarked\s*all\b|\badded\s*all\b|\badd\s*all\b/i;
    const markAll = allPhrases.test(utter);

    const matchedIndices: number[] = [];
    if (markAll) {
      for (let i = 0; i < recipe.ingredients.length; i++) matchedIndices.push(i);
    } else {
      for (let i = 0; i < recipe.ingredients.length; i++) {
        const kws = this.ingredientKeywords(recipe.ingredients[i]);
        if (kws.length === 0) continue;
        let score = 0;
        for (const kw of kws) {
          if (utter.includes(kw)) score++;
        }
        if (score > 0) matchedIndices.push(i);
      }

      if (matchedIndices.length === 0) {
        const nextUnchecked = checked.findIndex((v) => !v);
        if (nextUnchecked < 0 || nextUnchecked >= recipe.ingredients.length) return;
        matchedIndices.push(nextUnchecked);
      }
    }

    this.ingredientChecked.update((arr) => {
      const next = recipe.ingredients.map((_, idx) => !!arr[idx]);
      for (const i of matchedIndices) {
        if (i >= 0 && i < next.length) next[i] = true;
      }
      return next;
    });
  }

  private onLiveEvent(event: LiveEvent): void {
    switch (event.type) {
      case 'audio':
        if (this.speakReplies() && this.playback) this.playback.play(event.data);
        break;
      case 'user':
        this.tryAutoCheckAddedItem(event.text);
        break;
      case 'gemini':
        break;
      case 'turn_complete':
        this.agentLoading.set(false);
        break;
      case 'interrupted':
        this.playback?.interrupt();
        break;
      case 'ready':
        break;
      case 'error':
        this.agentError.set(event.error);
        this.agentLoading.set(false);
        break;
      case 'timer_started': {
        const id = event.timer_id;
        const newEntry = {
          id,
          title: event.title,
          remainingSeconds: event.duration_seconds,
          status: 'running' as const,
        };
        this.timers.update((list) => {
          const idx = list.findIndex((t) => t.id === id);
          if (idx >= 0) return list.map((t, i) => (i === idx ? { ...newEntry } : t));
          return [...list, newEntry];
        });
        this.startTimerTick();
        break;
      }
      case 'timer_updated':
        this.timers.update((list) =>
          list.map((t) =>
            t.id === event.timer_id
              ? {
                  ...t,
                  title: event.title ?? t.title,
                  remainingSeconds: event.remaining_seconds,
                  status: 'running' as const,
                }
              : t,
          ),
        );
        this.startTimerTick();
        break;
      case 'timer_ended':
        this.timers.update((list) => list.filter((t) => t.id !== event.timer_id));
        break;
      case 'timer_cancelled':
        this.timers.update((list) => list.filter((t) => t.id !== event.timer_id));
        break;
      case 'timer_paused':
        this.timers.update((list) =>
          list.map((t) =>
            t.id === event.timer_id
              ? { ...t, remainingSeconds: event.remaining_seconds, status: 'paused' }
              : t,
          ),
        );
        break;
      case 'places_result':
        this.storesList.set(event.places);
        break;
      case 'stores_hidden':
        this.storesList.set([]);
        break;
      case 'camera_command':
        if (event.action === 'open' && !this.cameraEnabled()) {
          void this.openCamera();
        } else if (event.action === 'close' && this.cameraEnabled()) {
          this.closeCamera();
        }
        break;
      case 'recipe_result':
        this.currentRecipe.set(event.recipe);
        this.ingredientChecked.set(event.recipe.ingredients.map(() => false));
        this.recipeSaved.set(false);
        this.persistLastRecipe(event.recipe);
        break;
      case 'ingredient_added':
        this.ingredientChecked.update((arr) => {
          const next = [...arr];
          if (event.index >= 0 && event.index < next.length) next[event.index] = true;
          return next;
        });
        break;
      case 'recipe_saved': {
        this.recipeSaved.set(true);
        const toSave = event.recipe ?? this.currentRecipe();
        if (toSave) {
          this.persistLastRecipe(toSave);
          this.savedRecipes.update((list) => {
            const next = list.some((r) => r.title === toSave.title) ? list : [...list, toSave];
            this.persistSavedRecipes(next);
            return next;
          });
        }
        setTimeout(() => this.recipeSaved.set(false), 3000);
        break;
      }
      case 'closed':
        this.liveConnected.set(false);
        if (event.code === 1000) {
          this.agentError.set('');
        } else if (event.reason && !this.agentError()) {
          this.agentError.set(event.reason);
        }
        break;
    }
  }

  async onMicStreamReady(stream: MediaStream): Promise<void> {
    if (this.stopAudioCapture) return;
    if (!this.liveConnected()) {
      await this.connectLive();
      if (!this.liveConnected()) return;
    }
    try {
      this.stopAudioCapture = await startLiveAudioCapture({
        stream,
        onChunk: (b64) => this.liveAgent.sendAudio(b64),
        onStopped: () => {
          this.stopAudioCapture = null;
        },
      });
    } catch (err) {
      this.agentError.set(err instanceof Error ? err.message : 'Failed to start audio capture');
    }
  }

  onMicStreamEnded(): void {
    this.stopAudioCapture?.();
    this.stopAudioCapture = null;
  }

  onRecipeRemoved(recipe: Recipe): void {
    this.savedRecipes.update((list) => {
      const next = list.filter((r) => r !== recipe && r.title !== recipe.title);
      this.persistSavedRecipes(next);
      return next;
    });
  }

  onRecipeSelected(recipe: Recipe): void {
    this.currentRecipe.set(recipe);
    this.ingredientChecked.set(recipe.ingredients.map(() => false));
    this.showSavedPanel.set(false);
  }

  toggleSavedPanel(): void {
    this.showSavedPanel.update((v) => !v);
  }

  onIngredientCheckedChange(payload: { index: number; checked: boolean }): void {
    this.ingredientChecked.update((arr) => {
      const next = [...arr];
      if (payload.index >= 0 && payload.index < next.length) next[payload.index] = payload.checked;
      return next;
    });
  }

  closeCamera(): void {
    if (!this.cameraEnabled()) return;
    this.stopVideoCapture?.();
    this.stopVideoCapture = null;
    this.cameraStream()
      ?.getTracks()
      .forEach((t) => t.stop());
    this.cameraStream.set(null);
    this.cameraEnabled.set(false);
    this.agentError.set('');
  }

  async openCamera(): Promise<void> {
    if (this.cameraEnabled()) return;
    this.agentError.set('');
    if (!this.liveConnected()) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 768, max: 768 },
          height: { ideal: 768, max: 768 },
          facingMode: 'user',
        },
        audio: false,
      });
      const videoTracks = stream.getVideoTracks();
      if (videoTracks.length === 0) {
        stream.getTracks().forEach((t) => t.stop());
        this.agentError.set('No video track. Camera may be in use elsewhere.');
        return;
      }
      this.cameraStream.set(stream);
      this.cameraEnabled.set(true);
      this.stopVideoCapture = startLiveVideoCapture({
        stream,
        onFrame: (b64) => this.liveAgent.sendVideo(b64),
        onStopped: () => {
          this.cameraEnabled.set(false);
        },
      });
    } catch (err: unknown) {
      const name = err instanceof Error ? err.name : '';
      const msg =
        name === 'NotAllowedError'
          ? 'Camera denied. Click the lock or camera icon in the address bar and allow camera for this site. Voice works without camera.'
          : name === 'NotFoundError'
            ? 'No camera found. You can keep using voice.'
            : name === 'NotReadableError' || name === 'OverconstrainedError'
              ? 'Camera in use or not supported. Try closing other apps that use the camera. Voice still works.'
              : err instanceof Error
                ? err.message
                : 'Could not start video source. You can keep using voice.';
      this.agentError.set(msg);
    }
  }
}
