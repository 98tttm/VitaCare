import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideQuillConfig } from 'ngx-quill/config';

import { routes } from './app.routes';

/** Toolbar rich text (Quill) — gần với soạn thư: định dạng, list, màu, căn, link */
const quillToolbar = [
  ['bold', 'italic', 'underline', 'strike'],
  [{ header: [1, 2, 3, false] }],
  [{ list: 'ordered' }, { list: 'bullet' }],
  [{ align: [] }],
  [{ color: [] }, { background: [] }],
  ['blockquote', 'link'],
  ['clean'],
];

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(),
    provideQuillConfig({
      modules: {
        toolbar: quillToolbar,
      },
    }),
  ]
};
