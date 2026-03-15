import { Component, OnInit, Inject, ViewChild, ElementRef, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { BlogService } from '../services/blog.service';

@Component({
    selector: 'app-blogdetail',
    standalone: true,
    imports: [CommonModule, FormsModule],
    providers: [BlogService],
    templateUrl: './blogdetail.html',
    styleUrl: './blogdetail.css'
})
export class Blogdetail implements OnInit {
    isEditMode: boolean = false;
    blogId: string | null = null;
    isLoading: boolean = false;
    blogData: any = {
        title: '',
        tags: [],
        author: { fullName: '', email: '' },
        publishedAt: '',
        descriptionHtml: '',
        categoryId: '',
        slug: '',
        primaryImage: { url: '' },
        category: { name: '', slug: '' },
        isApproved: false
    };

    notification = {
        show: false,
        message: '',
        type: 'success'
    };

    categories: any[] = [];

    @ViewChild('contentEditor') contentEditor!: ElementRef;
    @ViewChild('formatBlockSelect') formatBlockSelect!: ElementRef;
    @ViewChild('fontSizeSelect') fontSizeSelect!: ElementRef;

    editorHistory: string[] = [];
    historyIndex: number = -1;
    isUpdatingContent: boolean = false;
    historySaveTimeout: any = null;

    constructor(
        private route: ActivatedRoute,
        private router: Router,
        private cdr: ChangeDetectorRef,
        @Inject(BlogService) private blogService: BlogService
    ) { }

    ngOnInit() {
        this.loadCategories();
        this.route.queryParamMap.subscribe(params => {
            this.blogId = params.get('id');
            if (this.blogId) {
                this.isEditMode = true;
                this.loadBlogDetail(this.blogId);
            } else {
                this.blogData = {
                    title: '',
                    tags: [],
                    author: { fullName: '', email: '' },
                    publishedAt: this.formatDateForInput(new Date()),
                    descriptionHtml: '',
                    categoryId: '',
                    slug: '',
                    primaryImage: { url: '' },
                    category: { name: '', slug: '' },
                    isApproved: false
                };
                setTimeout(() => this.initEditorContent(), 100);
            }
        });
    }

    initEditorContent() {
        if (this.contentEditor?.nativeElement) {
            this.contentEditor.nativeElement.innerHTML = this.blogData.descriptionHtml || '';
            this.saveToHistory();
        }
    }

    loadCategories() {
        this.blogService.getCategories().subscribe({
            next: (res) => {
                if (res && res.success) {
                    this.categories = res.data.map((c: any) => ({
                        id: c._id || c.id,
                        name: c.name,
                        slug: c.slug
                    }));
                }
            },
            error: (err) => console.error('Lỗi tải danh mục', err)
        });
    }

    loadBlogDetail(id: string) {
        this.isLoading = true;
        this.blogService.getBlogs(1, 1000).subscribe({
            next: (res) => {
                if (res && res.success) {
                    const foundBlog = res.data.find((b: any) => b._id === id || b.id === id);
                    if (foundBlog) {
                        this.blogData = { ...foundBlog };
                        if (!this.blogData.author) this.blogData.author = { fullName: '', email: '' };
                        if (!this.blogData.categoryId && this.blogData.category) {
                            this.blogData.categoryId = this.blogData.category.id || this.blogData.category._id;
                        }
                        // Remove plural categories if exist to unify
                        if (this.blogData.categories) delete this.blogData.categories;
                        if (this.blogData.publishedAt) {
                            this.blogData.publishedAt = this.formatDateForInput(new Date(this.blogData.publishedAt));
                        }
                        this.cdr.markForCheck(); // Force immediate view update
                        setTimeout(() => this.initEditorContent(), 100);
                    } else {
                        this.showNotification('Không tìm thấy bài viết!', 'error');
                        setTimeout(() => this.goBack(), 1500);
                    }
                }
                this.isLoading = false;
            },
            error: (err) => {
                console.error('Lỗi tải chi tiết blog', err);
                this.isLoading = false;
            }
        });
    }

    formatDateForInput(date: Date): string {
        const d = new Date(date);
        let month = '' + (d.getMonth() + 1);
        let day = '' + d.getDate();
        const year = d.getFullYear();

        if (month.length < 2) month = '0' + month;
        if (day.length < 2) day = '0' + day;

        return [year, month, day].join('-');
    }

    showNotification(message: string, type: 'success' | 'error' = 'success') {
        this.notification = { show: true, message, type };
        setTimeout(() => {
            if (this.notification.message === message) {
                this.notification.show = false;
            }
        }, 3000);
    }

    triggerImageInput() {
        const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
        if (fileInput) fileInput.click();
    }

    onFileSelected(event: any) {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e: any) => {
                if (!this.blogData.primaryImage) this.blogData.primaryImage = { url: '' };
                this.blogData.primaryImage.url = e.target.result;
                this.showNotification('Đã tải lên ảnh xem trước thành công!');
            };
            reader.readAsDataURL(file);
        }
    }

    saveBlog() {
        if (!this.blogData.title || !this.blogData.categoryId) {
            this.showNotification('Vui lòng nhập tiêu đề và chọn danh mục!', 'error');
            return;
        }

        this.isLoading = true;

        // Find complete category from choices
        const cat = this.categories.find(c => c.id === this.blogData.categoryId);
        if (cat) {
            this.blogData.category = { id: cat.id, name: cat.name, slug: cat.slug };
            // Ensure plural is gone
            if (this.blogData.categories) delete this.blogData.categories;
        }

        // Final slug check
        if (!this.blogData.slug && this.blogData.title) {
            this.blogData.slug = this.generateSlug(this.blogData.title);
        }

        const action = this.isEditMode && this.blogId
            ? this.blogService.updateBlog(this.blogId, this.blogData)
            : this.blogService.createBlog(this.blogData);

        action.subscribe({
            next: (res) => {
                this.isLoading = false;
                if (res.success || res._id || res.id) {
                    this.showNotification(this.isEditMode ? 'Đã cập nhật bài viết thành công!' : 'Đã lưu dữ liệu bài viết thành công!', 'success');
                    setTimeout(() => this.goBack(), 1500);
                } else {
                    this.showNotification('Lỗi khi lưu bài viết', 'error');
                }
            },
            error: (err) => {
                this.isLoading = false;
                console.error('Lỗi khi lưu bài viết:', err);
                this.showNotification('Có lỗi xảy ra kết nối server!', 'error');
            }
        });
    }

    goBack() {
        this.router.navigate(['/admin/blogs']);
    }

    likeBlog() {
        this.showNotification('Đã thêm vào danh sách yêu thích!');
    }

    handleKeyboardShortcuts(event: KeyboardEvent): void {
        if (event.ctrlKey || event.metaKey) {
            switch (event.key.toLowerCase()) {
                case 'b':
                    event.preventDefault();
                    this.execCommand('bold');
                    break;
                case 'i':
                    event.preventDefault();
                    this.execCommand('italic');
                    break;
                case 'u':
                    event.preventDefault();
                    this.execCommand('underline');
                    break;
                case 'z':
                    event.preventDefault();
                    if (event.shiftKey) this.redo();
                    else this.undo();
                    break;
                case 'y':
                    event.preventDefault();
                    this.redo();
                    break;
            }
        }
    }

    // Editor Logic
    updateBlogContent(event: Event): void {
        if (!this.contentEditor?.nativeElement || this.isUpdatingContent) return;
        const editor = this.contentEditor.nativeElement;
        this.blogData.descriptionHtml = editor.innerHTML;

        // Clean up some common copy-paste issues
        if (this.historySaveTimeout) clearTimeout(this.historySaveTimeout);
        this.historySaveTimeout = setTimeout(() => {
            this.saveToHistory();
        }, 1000);
    }

    saveToHistory(): void {
        if (!this.contentEditor?.nativeElement) return;
        const editor = this.contentEditor.nativeElement;
        const currentContent = editor.innerHTML;

        // Don't save if content hasn't changed from last history state
        if (this.historyIndex >= 0 && this.editorHistory[this.historyIndex] === currentContent) return;

        // Remove strictly newer history if we're not at the end
        if (this.historyIndex < this.editorHistory.length - 1) {
            this.editorHistory = this.editorHistory.slice(0, this.historyIndex + 1);
        }

        this.editorHistory.push(currentContent);
        this.historyIndex++;
    }

    execCommand(command: string, value: string = ''): void {
        if (!this.contentEditor?.nativeElement) return;
        if (command === 'undo') {
            this.undo();
            return;
        }
        if (command === 'redo') {
            this.redo();
            return;
        }
        const editor = this.contentEditor.nativeElement;
        const selection = window.getSelection();
        let savedRange: Range | null = null;
        if (selection && selection.rangeCount > 0) {
            savedRange = selection.getRangeAt(0).cloneRange();
        }
        editor.focus();
        const beforeContent = editor.innerHTML;
        document.execCommand(command, false, value);
        if (savedRange && selection) {
            try {
                selection.removeAllRanges();
                selection.addRange(savedRange);
            } catch (e) {
                editor.focus();
            }
        }
        if (editor.innerHTML !== beforeContent) {
            if (this.historySaveTimeout) clearTimeout(this.historySaveTimeout);
            this.saveToHistory();
            this.updateBlogContent({ target: editor } as any);
        }
    }

    undo(): void {
        if (!this.contentEditor?.nativeElement || this.historyIndex <= 0) return;
        this.isUpdatingContent = true;
        this.historyIndex--;
        this.contentEditor.nativeElement.innerHTML = this.editorHistory[this.historyIndex];
        requestAnimationFrame(() => {
            this.contentEditor.nativeElement.focus();
            const selection = window.getSelection();
            if (selection) {
                const range = document.createRange();
                range.selectNodeContents(this.contentEditor.nativeElement);
                range.collapse(false);
                selection.removeAllRanges();
                selection.addRange(range);
            }
            this.isUpdatingContent = false;
            this.updateBlogContent({ target: this.contentEditor.nativeElement } as any);
        });
    }

    redo(): void {
        if (!this.contentEditor?.nativeElement || this.historyIndex >= this.editorHistory.length - 1) return;
        this.isUpdatingContent = true;
        this.historyIndex++;
        this.contentEditor.nativeElement.innerHTML = this.editorHistory[this.historyIndex];
        requestAnimationFrame(() => {
            this.contentEditor.nativeElement.focus();
            const selection = window.getSelection();
            if (selection) {
                const range = document.createRange();
                range.selectNodeContents(this.contentEditor.nativeElement);
                range.collapse(false);
                selection.removeAllRanges();
                selection.addRange(range);
            }
            this.isUpdatingContent = false;
            this.updateBlogContent({ target: this.contentEditor.nativeElement } as any);
        });
    }

    getCurrentBlockElement(): HTMLElement | null {
        if (!this.contentEditor?.nativeElement) return null;
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return null;
        const range = selection.getRangeAt(0);
        let element: HTMLElement | null = null;
        if (range.commonAncestorContainer.nodeType === Node.TEXT_NODE) {
            element = range.commonAncestorContainer.parentElement as HTMLElement;
        } else {
            element = range.commonAncestorContainer as HTMLElement;
        }
        while (element && !['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE'].includes(element.tagName)) {
            if (element === this.contentEditor.nativeElement) break;
            element = element.parentElement;
        }
        return element;
    }

    getCurrentFontSize(): number {
        const element = this.getCurrentBlockElement();
        if (!element) return 14;
        const computedStyle = window.getComputedStyle(element);
        const fontSize = computedStyle.fontSize;
        if (fontSize.endsWith('px')) return parseFloat(fontSize);
        if (fontSize.endsWith('pt')) return parseFloat(fontSize) * 1.33;
        if (fontSize.endsWith('em')) {
            const baseSize = parseFloat(window.getComputedStyle(this.contentEditor.nativeElement).fontSize);
            return parseFloat(fontSize) * baseSize;
        }
        return 14;
    }

    updateToolbarDropdowns(): void {
        if (!this.contentEditor?.nativeElement) return;
        const blockElement = this.getCurrentBlockElement();
        if (blockElement && this.formatBlockSelect?.nativeElement) {
            const tagName = blockElement.tagName.toLowerCase();
            const select = this.formatBlockSelect.nativeElement;
            if (['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) {
                select.value = tagName;
            } else {
                select.value = 'p';
            }
        }
        const fontSize = this.getCurrentFontSize();
        if (this.fontSizeSelect?.nativeElement) {
            const select = this.fontSizeSelect.nativeElement;
            let selectedValue = '3';
            if (blockElement) {
                const tagName = blockElement.tagName.toLowerCase();
                if (tagName === 'h1') selectedValue = '7';
                else if (tagName === 'h2') selectedValue = '6';
                else if (tagName === 'h3') selectedValue = '5';
                else if (tagName === 'h4') selectedValue = '4';
                else if (tagName === 'h5') selectedValue = '3';
                else if (tagName === 'h6') selectedValue = '2';
                else {
                    if (fontSize >= 30) selectedValue = '7';
                    else if (fontSize >= 22) selectedValue = '6';
                    else if (fontSize >= 16) selectedValue = '5';
                    else if (fontSize >= 13) selectedValue = '4';
                    else if (fontSize >= 11) selectedValue = '3';
                    else if (fontSize >= 9) selectedValue = '2';
                    else selectedValue = '1';
                }
            }
            select.value = selectedValue;
        }
    }

    formatBlock(event: Event): void {
        if (!this.contentEditor?.nativeElement) return;
        const target = event.target as HTMLSelectElement;
        const value = target.value;
        this.contentEditor.nativeElement.focus();
        document.execCommand('formatBlock', false, value);
        setTimeout(() => {
            this.updateToolbarDropdowns();
        }, 10);
        this.saveToHistory();
        this.updateBlogContent({ target: this.contentEditor.nativeElement } as any);
    }

    insertLink(): void {
        if (!this.contentEditor?.nativeElement) return;
        const editor = this.contentEditor.nativeElement;
        editor.focus();
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0 || selection.toString().trim() === '') {
            this.showNotification('Vui lòng chọn văn bản để thêm liên kết', 'error');
            return;
        }
        const url = prompt('Nhập URL (ví dụ: https://example.com):', 'https://');
        if (url && url.trim()) {
            let finalUrl = url.trim();
            if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
                const confirm = window.confirm('URL không có http:// hoặc https://. Thêm https:// tự động?');
                if (confirm) finalUrl = 'https://' + finalUrl;
            }
            document.execCommand('createLink', false, finalUrl);
            this.saveToHistory();
            this.updateBlogContent({ target: editor } as any);
        }
    }

    insertImage(): void {
        if (!this.contentEditor?.nativeElement) return;
        const editor = this.contentEditor.nativeElement;
        editor.focus();
        const url = prompt('Nhập URL của ảnh (ví dụ: https://example.com/image.jpg):', 'https://');
        if (url && url.trim()) {
            const imageUrl = url.trim();
            if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://') && !imageUrl.startsWith('data:')) {
                this.showNotification('URL không hợp lệ. Vui lòng nhập URL hình ảnh hợp lệ.', 'error');
                return;
            }
            const img = `<img src="${imageUrl}" alt="Ảnh" style="max-width: 100%; height: auto; border-radius: 8px; margin: 16px 0; display: block;">`;
            document.execCommand('insertHTML', false, img);
            this.saveToHistory();
            this.updateBlogContent({ target: editor } as any);
        }
    }

    changeFontFamily(event: Event): void {
        if (!this.contentEditor?.nativeElement) return;
        const target = event.target as HTMLSelectElement;
        const fontFamily = target.value;
        if (fontFamily) {
            this.contentEditor.nativeElement.focus();
            document.execCommand('fontName', false, fontFamily);
            this.saveToHistory();
            this.updateBlogContent({ target: this.contentEditor.nativeElement } as any);
        }
    }

    changeFontSize(event: Event): void {
        if (!this.contentEditor?.nativeElement) return;
        const target = event.target as HTMLSelectElement;
        const sizeValue = target.value;
        const sizeMap: { [key: string]: string } = {
            '1': '8pt', '2': '10pt', '3': '12pt', '4': '14pt', '5': '18pt', '6': '24pt', '7': '36pt'
        };
        const fontSize = sizeMap[sizeValue] || '12pt';
        this.contentEditor.nativeElement.focus();
        const blockElement = this.getCurrentBlockElement();
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            if (blockElement && !range.collapsed) blockElement.style.fontSize = fontSize;
            else if (!range.collapsed) {
                document.execCommand('fontSize', false, sizeValue);
                const selectedElements = range.commonAncestorContainer.parentElement?.querySelectorAll('font[size]');
                if (selectedElements) {
                    selectedElements.forEach((el: any) => {
                        if (el.tagName === 'FONT' && el.hasAttribute('size')) {
                            el.style.fontSize = fontSize;
                            el.removeAttribute('size');
                        }
                    });
                }
            } else {
                if (blockElement) blockElement.style.fontSize = fontSize;
                else document.execCommand('fontSize', false, sizeValue);
            }
        } else {
            if (blockElement) blockElement.style.fontSize = fontSize;
            else document.execCommand('fontSize', false, sizeValue);
        }
        this.saveToHistory();
        this.updateBlogContent({ target: this.contentEditor.nativeElement } as any);
    }

    changeTextColor(event: Event): void {
        if (!this.contentEditor?.nativeElement) return;
        const target = event.target as HTMLInputElement;
        const color = target.value;
        this.contentEditor.nativeElement.focus();
        document.execCommand('foreColor', false, color);
        this.saveToHistory();
        this.updateBlogContent({ target: this.contentEditor.nativeElement } as any);
    }

    onTitleChange() {
        // Luôn tự động tạo slug dựa trên title mới nhất
        this.blogData.slug = this.generateSlug(this.blogData.title);
    }

    generateSlug(title: string): string {
        if (!title) return '';
        let slug = title.toLowerCase();

        // Vietnamese tone normalization
        slug = slug.replace(/[àáạảãâầấậẩẫăằắặẳẵ]/g, "a");
        slug = slug.replace(/[èéẹẻẽêềếệểễ]/g, "e");
        slug = slug.replace(/[ìíịỉĩ]/g, "i");
        slug = slug.replace(/[òóọỏõôồốộổỗơờớợởỡ]/g, "o");
        slug = slug.replace(/[ùúụủũưừứựửữ]/g, "u");
        slug = slug.replace(/[ỳýỵỷỹ]/g, "y");
        slug = slug.replace(/đ/g, "d");

        // Remove accents marks still present if any (using NFD)
        slug = slug.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

        slug = slug.replace(/[^a-z0-9\s-]/g, ''); // Remove other special chars
        slug = slug.replace(/\s+/g, '-'); // Replace space with -
        slug = slug.replace(/-+/g, '-'); // Remove double -
        slug = slug.trim();

        if (slug) return slug + '.html';
        return '';
    }
}
