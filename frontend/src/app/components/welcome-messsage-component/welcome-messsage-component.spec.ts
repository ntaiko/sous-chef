import { ComponentFixture, TestBed } from '@angular/core/testing';

import { WelcomeMesssageComponent } from './welcome-messsage-component';

describe('WelcomeMesssageComponent', () => {
  let component: WelcomeMesssageComponent;
  let fixture: ComponentFixture<WelcomeMesssageComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WelcomeMesssageComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(WelcomeMesssageComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
