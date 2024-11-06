import { NgFor, NgIf } from '@angular/common';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { Component, ElementRef, ViewChild } from '@angular/core';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-pdf-upload',
  standalone: true,
  imports: [NgFor, HttpClientModule, NgIf],
  templateUrl: './pdf-upload.component.html',
  styleUrl: './pdf-upload.component.css'
})
export class PdfUploadComponent {
  @ViewChild('fileInput') fileInput!: ElementRef; // Referencia al elemento de input de archivos
  
  selectedFile: File | null = null;
  uploadedFiles: File[] = [];
  mergeResult: any = null;
  mergeResultURL: string | null = null;
  #url = 'https://dvdmsv.pythonanywhere.com'
  url = 'http://localhost:5000'

  constructor(private http: HttpClient){}

  onFileSelected(event: Event) {
    const target = event.target as HTMLInputElement;
    if (target.files && target.files.length > 0) {
      this.selectedFile = target.files[0];
    }
  }

  onUpload() {
    if (this.selectedFile) {
      const formData = new FormData();
      formData.append('file', this.selectedFile);
      
      this.http.post(this.url + '/upload', formData)
        .subscribe(response => {
          console.log(response);
          this.uploadedFiles.push(this.selectedFile!);
          this.fileInput.nativeElement.value = '';
        });
    }
  }

  onMerge() {
    const fileNames = this.uploadedFiles.map(file => file.name);
    this.http.post(this.url + '/merge', { files: fileNames }).subscribe({
      next: (response: any) => {
        console.log('PDFs combinados con éxito:', response);
        this.mergeResult = response.output;  // Guardar el nombre del archivo combinado
      },
      error: err => console.error('Error en el merge:', err),
      complete: () => {
        Swal.fire({
          icon: 'success',
          timer: 1500,
        })
      }
    });
  }

  onClear() {
    // Solicitud al backend para limpiar la carpeta de archivos subidos
    this.http.post(this.url + '/clear_uploads', {}).subscribe({
      next: () => {
        console.log('Carpeta de archivos subidos limpiada.');
        this.uploadedFiles = [];
        this.mergeResult = null;
        this.mergeResultURL = null;
        window.location.reload();
      },
      error: err => console.error('Error al limpiar la carpeta de subidas:', err)
    });
  }

  onDownload() {
    if (this.mergeResult) {
      const downloadUrl = this.url + `/download/${this.mergeResult}`;
      window.open(downloadUrl, '_blank');  // Abre la URL de descarga en una nueva ventana o pestaña
    }
  }
}
