/* Shim cho TS khi import xlsx / pdfmake (đường dẫn build). */
declare module 'xlsx' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const XLSX: any;
  export = XLSX;
}

declare module 'pdfmake/build/pdfmake' {
  const pdfMake: {
    vfs?: unknown;
    createPdf: (doc: unknown) => { download: (name?: string) => void };
    [key: string]: unknown;
  };
  export default pdfMake;
}

declare module 'pdfmake/build/vfs_fonts';
