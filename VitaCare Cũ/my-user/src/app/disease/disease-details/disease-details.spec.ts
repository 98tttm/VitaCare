import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DiseaseDetails } from './disease-details';

describe('DiseaseDetails', () => {
  let component: DiseaseDetails;
  let fixture: ComponentFixture<DiseaseDetails>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DiseaseDetails]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DiseaseDetails);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
