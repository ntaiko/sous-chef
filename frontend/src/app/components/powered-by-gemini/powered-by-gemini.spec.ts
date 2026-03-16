import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PoweredByGemini } from './powered-by-gemini';

describe('PoweredByGemini', () => {
  let component: PoweredByGemini;
  let fixture: ComponentFixture<PoweredByGemini>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PoweredByGemini]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PoweredByGemini);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
