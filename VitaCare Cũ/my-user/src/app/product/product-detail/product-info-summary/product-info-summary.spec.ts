import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ProductInfoSummary } from './product-info-summary';

describe('ProductInfoSummary', () => {
  let component: ProductInfoSummary;
  let fixture: ComponentFixture<ProductInfoSummary>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProductInfoSummary]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ProductInfoSummary);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
