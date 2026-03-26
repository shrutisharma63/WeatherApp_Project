import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SearchPopup } from './search-popup';

describe('SearchPopup', () => {
  let component: SearchPopup;
  let fixture: ComponentFixture<SearchPopup>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SearchPopup]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SearchPopup);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
