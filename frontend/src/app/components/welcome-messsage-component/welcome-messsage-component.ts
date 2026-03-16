import { Component, input, output, computed } from '@angular/core';
import { BlobComponent } from '../blob-component/blob-component';

@Component({
  selector: 'app-welcome-messsage-component',
  imports: [BlobComponent],
  templateUrl: './welcome-messsage-component.html',
  styleUrl: './welcome-messsage-component.css',
})
export class WelcomeMesssageComponent {
  name = input<string>('');
  continueToSelection = output<void>();

  greeting = computed(() => {
    const n = this.name()?.trim() || '';
    return n
      ? `Hi! ${n} is ready to cook with you.`
      : "Hi! Your assistant is ready to get started.";
  });

  onContinue(): void {
    this.continueToSelection.emit();
  }
}
