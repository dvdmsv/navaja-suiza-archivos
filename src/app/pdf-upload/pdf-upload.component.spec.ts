import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PdfUploadComponent } from './pdf-upload.component';

describe('PdfUploadComponent', () => {
  let component: PdfUploadComponent;
  let fixture: ComponentFixture<PdfUploadComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PdfUploadComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(PdfUploadComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
