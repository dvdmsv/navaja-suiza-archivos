import { NgFor, NgIf } from '@angular/common';
import { HttpClient, HttpClientModule, HttpEventType } from '@angular/common/http';
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
  url = ''

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
  
      // Mostrar el mensaje de "Subiendo archivo..." con la barra de progreso
      const swalInstance = Swal.fire({
        text: 'Subiendo archivo...',
        showConfirmButton: false,
        allowOutsideClick: false, // Evitar que el usuario cierre la alerta
        willOpen: () => {
          Swal.showLoading(); // Mostrar el indicador de carga
        },
        html: `<div style="width: 100%; height: 20px; background-color: #f3f3f3;">
                 <div id="progress-bar" style="height: 100%; width: 0%; background-color: #4db8ff;"></div>
               </div>`, // Barra de progreso
      });
  
      // Realizar la solicitud HTTP
      this.http.post(this.url + '/upload', formData, {
        observe: 'events', // Observar todos los eventos de la solicitud
        reportProgress: true, // Habilitar reporte de progreso
      })
      .subscribe({
        next: (event: any) => {
          // Si se trata de un evento de progreso de subida
          if (event.type === HttpEventType.UploadProgress && event.total) {
            const progress = Math.round((100 * event.loaded) / event.total);
            
            // Actualizamos la barra de progreso en la interfaz
            const progressBar = document.getElementById('progress-bar')!;
            progressBar.style.width = `${progress}%`;
          }
         
        },
        complete: () => {
          Swal.close();
           // Guardamos el archivo subido en la lista
           this.uploadedFiles.push(this.selectedFile!);
           this.fileInput.nativeElement.value = ''; // Limpiar input del archivo
        },
        error: (err) => {
          // Si ocurre un error en la subida
          console.error('Error en la subida del archivo:', err);
          Swal.fire({
            text: 'Hubo un error al intentar subir el archivo.',
            icon: 'error'
          });
        }
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
        // window.location.reload();
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
