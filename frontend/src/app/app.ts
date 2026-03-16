import { Component, signal } from '@angular/core';
import { IntroComponent } from './components/intro-component/intro-component';
import { MainComponent } from './components/main-component/main-component';
import { PersonalizeComponent } from './components/personalize-component/personalize-component';
import { PoweredByGemini } from './components/powered-by-gemini/powered-by-gemini';
import { WelcomeMesssageComponent } from './components/welcome-messsage-component/welcome-messsage-component';

type Step = 'intro-component' | 'personalize-component' | 'welcome-message-component' | 'main-component';
type PersonalizeMode = 'onboarding' | 'settings';

@Component({
  selector: 'app-root',
  imports: [
    IntroComponent,
    PersonalizeComponent,
    WelcomeMesssageComponent,
    MainComponent,
    PoweredByGemini,
  ],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('frontend');
  protected readonly step = signal<Step>('intro-component');
  protected readonly name = signal('');
  protected readonly personality = signal('friendly');
  protected readonly responseType = signal('concise');
  protected readonly language = signal('en');
  protected readonly voice = signal('Aoede');
  /** When true, personalize screen is shown as "Settings" with Save → back to main. */
  protected readonly personalizeMode = signal<PersonalizeMode>('onboarding');

  personalize(): void {
    this.personalizeMode.set('onboarding');
    this.step.set('personalize-component');
  }

  onPersonalizeSubmit(ev: { assistantName: string; personality: string; responseType: string; language: string; voice: string }): void {
    this.name.set(ev.assistantName ?? '');
    this.personality.set(ev.personality ?? 'friendly');
    this.responseType.set(ev.responseType ?? 'concise');
    this.language.set(ev.language ?? 'en');
    this.voice.set(ev.voice ?? 'Aoede');
    if (this.personalizeMode() === 'settings') {
      this.step.set('main-component');
      this.personalizeMode.set('onboarding');
    } else {
      this.step.set('welcome-message-component');
    }
  }

  goToMain(): void {
    this.step.set('main-component');
    this.personalizeMode.set('onboarding');
  }

  openSettings(): void {
    this.personalizeMode.set('settings');
    this.step.set('personalize-component');
  }
}
