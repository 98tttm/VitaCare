import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Vitabot } from './vitabot';

describe('Vitabot', () => {
  let component: Vitabot;
  let fixture: ComponentFixture<Vitabot>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Vitabot]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Vitabot);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
