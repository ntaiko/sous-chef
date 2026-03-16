import { Component, input } from '@angular/core';

export type TimerStatus = 'running' | 'paused' | 'ended';

export interface TimerItem {
  id: string;
  title: string;
  remainingSeconds: number;
  status: TimerStatus;
}

@Component({
  selector: 'app-timer-component',
  templateUrl: './timer-component.html',
  styleUrl: './timer-component.css',
})
export class TimerComponent {
  readonly timers = input<TimerItem[]>([]);

  formatSeconds(seconds: number): string {
    const total = Math.max(0, Math.floor(seconds));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = (n: number) => n.toString().padStart(2, '0');
    if (h > 0) {
      return `${h}:${pad(m)}:${pad(s)}`;
    }
    return `${m}:${pad(s)}`;
  }
}
