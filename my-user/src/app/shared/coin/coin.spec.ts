import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Coin } from './coin';

describe('Coin', () => {
  let component: Coin;
  let fixture: ComponentFixture<Coin>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Coin]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Coin);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
