import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DiseaseGroupDetails } from './disease-group-details';

describe('DiseaseGroupDetails', () => {
  let component: DiseaseGroupDetails;
  let fixture: ComponentFixture<DiseaseGroupDetails>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DiseaseGroupDetails]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DiseaseGroupDetails);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
