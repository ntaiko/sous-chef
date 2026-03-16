import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MicrophoneComponent } from './microphone-component';

describe('MicrophoneComponent', () => {
  let component: MicrophoneComponent;
  let fixture: ComponentFixture<MicrophoneComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MicrophoneComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MicrophoneComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
