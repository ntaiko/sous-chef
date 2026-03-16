import { Component, output } from '@angular/core';

@Component({
  selector: 'app-intro-component',
  imports: [],
  templateUrl: './intro-component.html',
  styleUrl: './intro-component.css',
})
export class IntroComponent {
  isLeaving = false;
  start = output<void>();

  personalize() {
    if (this.isLeaving) return;
    this.isLeaving = true;
    setTimeout(() => {
      this.start.emit();
    });
  }
}
