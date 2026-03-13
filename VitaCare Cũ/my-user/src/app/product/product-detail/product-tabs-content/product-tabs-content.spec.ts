import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ProductTabsContent } from './product-tabs-content';

describe('ProductTabsContent', () => {
  let component: ProductTabsContent;
  let fixture: ComponentFixture<ProductTabsContent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProductTabsContent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ProductTabsContent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
