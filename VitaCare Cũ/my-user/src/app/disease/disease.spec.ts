import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Disease } from './disease';

describe('Disease', () => {
  let component: Disease;
  let fixture: ComponentFixture<Disease>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Disease]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Disease);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
