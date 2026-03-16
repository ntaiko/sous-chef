import { Component, input } from '@angular/core';

export interface PlaceResult {
  name: string;
  formattedAddress: string;
  rating?: number;
  websiteUri?: string | null;
  googleMapsUri?: string | null;
  photoName?: string | null;
}

@Component({
  selector: 'app-stores-component',
  templateUrl: './stores-component.html',
  styleUrl: './stores-component.css',
})
export class StoresComponent {
  readonly places = input.required<PlaceResult[]>();

  readonly label = input<string>('Where to find it');

  placePhotoUrl(photoName: string | null | undefined): string {
    if (!photoName) return '';
    return `/api/place-photo?name=${encodeURIComponent(photoName)}`;
  }
}
