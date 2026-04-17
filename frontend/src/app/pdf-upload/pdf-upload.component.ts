import { NgFor, NgIf, NgSwitch, NgSwitchCase } from '@angular/common';
import { HttpClient, HttpClientModule, HttpEventType } from '@angular/common/http';
import { Component, ElementRef, ViewChild } from '@angular/core';
import Swal from 'sweetalert2';
// IMPORTANTE: Asegúrate de tener estos imports para el Drag & Drop
import { CdkDragDrop, moveItemInArray, DragDropModule } from '@angular/cdk/drag-drop';

interface UploadItem {
  file: File;
  isUploaded: boolean;
  uploading: boolean;
  serverFilename?: string; // El ID único del sistema (UUID)
}

@Component({
  selector: 'app-pdf-upload',
  standalone: true,
  // IMPORTANTE: DragDropModule debe estar aquí
  imports: [NgFor, HttpClientModule, NgIf, DragDropModule, NgSwitch, NgSwitchCase], 
  templateUrl: './pdf-upload.component.html',
  styleUrl: './pdf-upload.component.css'
})
export class PdfUploadComponent {
  @ViewChild('fileInput') fileInput!: ElementRef;
  
  uploadedFiles: UploadItem[] = [];
  mergeResult: any = null;
  // Asegúrate de que esta IP sea correcta y accesible
  url = ''

  constructor(private http: HttpClient){}

  onFileSelected(event: Event) {
    const target = event.target as HTMLInputElement;
    if (target.files && target.files.length > 0) {
      const newFiles: UploadItem[] = Array.from(target.files).map(file => ({
        file: file,
        isUploaded: false,
        uploading: false,
      }));

      newFiles.forEach(newItem => {
        const isDuplicate = this.uploadedFiles.some(existingItem => 
          existingItem.file.name === newItem.file.name && existingItem.file.size === newItem.file.size
        );
        if (!isDuplicate) {
          this.uploadedFiles.push(newItem);
        }
      });
      
      if (this.fileInput && this.fileInput.nativeElement) {
        this.fileInput.nativeElement.value = '';
      }
    }
  }

  onUpload() {
    // Obtenemos los pendientes EN EL ORDEN ACTUAL DE LA LISTA
    const pendingItems = this.uploadedFiles.filter(item => !item.isUploaded);

    if (pendingItems.length === 0) {
      Swal.fire({ text: 'No hay archivos pendientes.', icon: 'warning' });
      return;
    }

    const formData = new FormData();
    pendingItems.forEach(item => {
      formData.append('files', item.file);
      item.uploading = true;
    });

    Swal.fire({
      text: 'Subiendo archivos...',
      showConfirmButton: false,
      allowOutsideClick: false,
      willOpen: () => { Swal.showLoading(); },
      html: `<div style="width: 100%; height: 20px; background-color: #f3f3f3; border-radius: 4px; overflow: hidden;">
              <div id="progress-bar" style="height: 100%; width: 0%; background-color: #4db8ff; transition: width 0.3s ease-in-out;"></div>
            </div>`,
    });

    this.http.post(this.url + '/upload', formData, {
      observe: 'events',
      reportProgress: true,
    })
    .subscribe({
      next: (event: any) => {
        if (event.type === HttpEventType.UploadProgress && event.total) {
          const progress = Math.round((100 * event.loaded) / event.total);
          const progressBar = document.getElementById('progress-bar');
          if(progressBar) progressBar.style.width = `${progress}%`;
        }
        else if (event.type === HttpEventType.Response) {
            Swal.close();
            const responseBody = event.body as any;
            
            // CORRECCIÓN CRÍTICA: Mapeo por ÍNDICE
            // El servidor procesa los archivos en el orden que se enviaron.
            // pendingItems[0] corresponde a responseBody.uploaded[0].
            if (responseBody.uploaded && Array.isArray(responseBody.uploaded)) {
                responseBody.uploaded.forEach((serverItem: any, index: number) => {
                    if (index < pendingItems.length) {
                        const localItem = pendingItems[index];
                        
                        // Actualizamos el estado y guardamos el UUID
                        localItem.isUploaded = true;
                        localItem.uploading = false;
                        localItem.serverFilename = serverItem.system_name;
                        
                        console.log(`Asignado ID ${localItem.serverFilename} a ${localItem.file.name}`);
                    }
                });
            }

            Swal.fire({ text: 'Subida completa.', icon: 'success', timer: 1500 });
        }
      },
      error: (err) => {
        console.error('Error subida:', err);
        Swal.fire({ text: 'Error al subir.', icon: 'error' });
        pendingItems.forEach(item => item.uploading = false);
      }
    });
  }

  // Esta función es la que actualiza el array visualmente
  drop(event: CdkDragDrop<UploadItem[]>) {
    // Mueve el elemento en el array 'uploadedFiles'
    moveItemInArray(this.uploadedFiles, event.previousIndex, event.currentIndex);
    
    // Depuración: Verifica en consola que el orden ha cambiado
    console.log('Nuevo orden visual:', this.uploadedFiles.map(f => f.file.name));
  }

  onMerge() {
    // Validamos que no haya pendientes
    const nonUploaded = this.uploadedFiles.some(item => !item.isUploaded);
    if (nonUploaded) {
        Swal.fire({ text: 'Sube todos los archivos antes de combinar.', icon: 'warning' });
        return;
    }
    
    // Extraemos los IDs (serverFilename) en el orden actual de la lista
    const fileIds = this.uploadedFiles
        .map(item => item.serverFilename)
        .filter(id => !!id); // Filtramos nulos o undefined por seguridad

    console.log('Enviando a combinar (IDs ordenados):', fileIds);

    if (fileIds.length === 0) {
        Swal.fire({ text: 'No hay IDs válidos para combinar. Recarga la página e intenta de nuevo.', icon: 'error' });
        return;
    }
    
    this.http.post(this.url + '/merge', { files: fileIds }).subscribe({
      next: (response: any) => {
        this.mergeResult = response.output;
        Swal.fire({ icon: 'success', title: '¡PDF Combinado!', timer: 1500 });
      },
      error: err => {
        console.error('Error merge:', err);
        Swal.fire({ text: 'Error al combinar en el servidor.', icon: 'error' });
      }
    });
  }

  onClear() {
    this.http.post(this.url + '/clear_uploads', {}).subscribe({
      next: () => {
        this.uploadedFiles = [];
        this.mergeResult = null;
        if (this.fileInput) this.fileInput.nativeElement.value = '';
      }
    });
  }

  onDownload() {
    if (this.mergeResult) {
      window.open(this.url + `/download/${this.mergeResult}`, '_blank');
    }
  }

  get pendingCount(): number {
    return this.uploadedFiles.filter(item => !item.isUploaded).length;
  }
  
  get hasPendingFiles(): boolean {
    return this.pendingCount > 0;
  }
}