import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FeatureCategories } from './feature-categories';

describe('FeatureCategories', () => {
  let component: FeatureCategories;
  let fixture: ComponentFixture<FeatureCategories>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FeatureCategories]
    })
    .compileComponents();

    fixture = TestBed.createComponent(FeatureCategories);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
