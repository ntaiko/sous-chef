import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PersonalizeComponent } from './personalize-component';

describe('PersonalizeComponent', () => {
  let component: PersonalizeComponent;
  let fixture: ComponentFixture<PersonalizeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PersonalizeComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PersonalizeComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
