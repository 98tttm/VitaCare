import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Notice } from './notice';

describe('Notice', () => {
  let component: Notice;
  let fixture: ComponentFixture<Notice>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Notice]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Notice);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
