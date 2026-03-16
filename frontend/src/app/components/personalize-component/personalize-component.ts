import { Component, signal, output, input, OnInit } from '@angular/core';
import { BlobComponent } from '../blob-component/blob-component';
import { LIVE_VOICES, LIVE_LANGUAGES } from '../../config/live-api-options';

export interface PersonalizationResult {
  assistantName: string;
  personality: string;
  responseType: string;
  language: string;
  voice: string;
}

@Component({
  selector: 'app-personalize-component',
  imports: [BlobComponent],
  templateUrl: './personalize-component.html',
  styleUrl: './personalize-component.css',
})
export class PersonalizeComponent implements OnInit {
  isLeaving = false;
  /** Emits when user continues with all personalization values for the Live API. */
  start = output<PersonalizationResult>();

  readonly voices = LIVE_VOICES;
  readonly languages = LIVE_LANGUAGES;

  /** 'settings' = opened from main (Save → back to main); 'onboarding' = first-time (Continue → welcome). */
  mode = input<'onboarding' | 'settings'>('onboarding');

  /** Pre-fill when opening from settings or re-editing. */
  initialAssistantName = input<string>('');
  initialPersonality = input<string>('');
  initialResponseType = input<string>('');
  initialLanguage = input<string>('');
  initialVoice = input<string>('');

  assistantName = signal('Sous Chef');
  personality = signal('friendly');
  responseType = signal('concise');
  language = signal('en');
  voice = signal('Aoede');

  ngOnInit(): void {
    const n = this.initialAssistantName()?.trim();
    if (n) this.assistantName.set(n);
    const p = this.initialPersonality()?.trim();
    if (p) this.personality.set(p);
    const r = this.initialResponseType()?.trim();
    if (r) this.responseType.set(r);
    const l = this.initialLanguage()?.trim();
    if (l) this.language.set(l);
    const v = this.initialVoice()?.trim();
    if (v) this.voice.set(v);
  }

  continue() {
    if (this.isLeaving) return;
    this.isLeaving = true;
    setTimeout(() => {
      this.start.emit({
        assistantName: this.assistantName()?.trim() || 'Sous Chef',
        personality: this.personality() || 'friendly',
        responseType: this.responseType() || 'concise',
        language: this.language()?.trim() || 'en',
        voice: this.voice() || 'Aoede',
      });
    });
  }
}
