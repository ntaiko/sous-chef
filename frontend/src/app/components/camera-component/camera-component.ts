import { Component, input } from '@angular/core';

@Component({
  selector: 'app-camera-component',
  templateUrl: './camera-component.html',
  styleUrl: './camera-component.css',
})
export class CameraComponent {
  readonly stream = input<MediaStream | null>(null);
}
