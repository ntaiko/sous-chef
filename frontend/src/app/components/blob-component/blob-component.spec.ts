import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BlobComponent } from './blob-component';

describe('BlobComponent', () => {
  let component: BlobComponent;
  let fixture: ComponentFixture<BlobComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BlobComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(BlobComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
