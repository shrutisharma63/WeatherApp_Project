import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NewApp } from './new-app';

describe('NewApp', () => {
  let component: NewApp;
  let fixture: ComponentFixture<NewApp>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NewApp]
    })
    .compileComponents();

    fixture = TestBed.createComponent(NewApp);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
