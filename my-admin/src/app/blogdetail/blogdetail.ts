import { Component, OnInit, Inject, ViewChild, ElementRef, ChangeDetectorRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { BlogService } from '../services/blog.service';
import { AuthService } from '../services/auth.service';
import { AdminMascotLoadingComponent } from '../shared/admin-mascot-loading/admin-mascot-loading.component';

@Component({
    selector: 'app-blogdetail',
    standalone: true,
    imports: [CommonModule, FormsModule, AdminMascotLoadingComponent],
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
        shortDescription: '',
        excerpt: '',
        tags: [],
        author: { fullName: '', email: '' },
        publishedAt: '',
        descriptionHtml: '',
        categoryId: '',
        slug: '',
        primaryImage: { url: '' },
        url: '',
        category: null,
        categories: [],
        parentCategory: null,
        isActive: true,
        isApproved: false,
        approver: null,
        approvedAt: null as string | null
    };

    isImageLibraryOpen: boolean = false;
    imageLibrary: string[] = [];
    currentInsertingType: 'primary' | 'editor' = 'primary';
    isUploading: boolean = false;

    searchTerm: string = '';
    filteredCategoriesList: any[] = [];
    isCategoryDropdownOpen: boolean = false;
    tagsText: string = '';

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
    private readonly backendBaseUrl = 'http://localhost:3000';

    /** Trạng thái duyệt khi mở form (để biết lần đầu dược sĩ duyệt) */
    private previousIsApproved = false;

    constructor(
        private route: ActivatedRoute,
        private router: Router,
        private cdr: ChangeDetectorRef,
        @Inject(BlogService) private blogService: BlogService,
        private auth: AuthService
    ) { }

    ngOnInit() {
        this.loadCategories();
        this.route.queryParamMap.subscribe(params => {
            this.blogId = params.get('id');
            if (this.blogId) {
                this.isEditMode = true;
                this.loadBlogDetail(this.blogId);
            } else {
                this.blogData = this.createEmptyBlog();
                this.filteredCategoriesList = [...this.categories];
                this.syncTagsTextFromData();
                setTimeout(() => this.initEditorContent(), 100);
            }
        });
    }

    @HostListener('document:click', ['$event'])
    onDocumentClick(event: MouseEvent) {
        const target = event.target as HTMLElement;
        if (!target.closest('.category-search-container')) {
            this.isCategoryDropdownOpen = false;
        }
    }

    private createEmptyBlog() {
        return {
            title: '',
            shortDescription: '',
            excerpt: '',
            tags: [],
            author: { fullName: '', email: '' },
            publishedAt: this.formatDateForInput(new Date()),
            descriptionHtml: '',
            categoryId: '',
            slug: '',
            primaryImage: { url: '' },
            url: '',
            category: null,
            categories: [],
            parentCategory: null,
            isActive: true,
            isApproved: false,
            approver: null,
            approvedAt: null as string | null
        };
    }

    private parseDateLike(value: any): string {
        if (!value) return '';
        if (typeof value === 'string' || typeof value === 'number') {
            const d = new Date(value);
            return isNaN(d.getTime()) ? '' : this.formatDateForInput(d);
        }
        // Mongo export style: { $date: ... }
        const v = value?.$date ?? value?.date;
        if (v) {
            const d = new Date(v);
            return isNaN(d.getTime()) ? '' : this.formatDateForInput(d);
        }
        return '';
    }

    private normalizeAuthor(author: any, fallback?: any) {
        if (author && typeof author === 'object') {
            const fullName = author.fullName || author.full_name || author.name || author.displayName || '';
            const email = author.email || author.mail || '';
            return { fullName, email };
        }
        const s = typeof author === 'string' ? author : (typeof fallback === 'string' ? fallback : '');
        return { fullName: s || '', email: '' };
    }

    private normalizeTags(tags: any): any[] {
        if (!tags) return [];
        if (Array.isArray(tags)) {
            return tags
                .map((t: any) => {
                    if (!t) return null;
                    if (typeof t === 'string') {
                        const title = t.trim();
                        return title ? { title, slug: '' } : null;
                    }
                    const title = String(t.title || t.name || t.label || '').trim();
                    const slug = String(t.slug || '').trim();
                    if (!title && !slug) return null;
                    return { title: title || slug, slug };
                })
                .filter(Boolean);
        }
        if (typeof tags === 'string') {
            return tags.split(',').map(s => s.trim()).filter(Boolean).map(title => ({ title, slug: '' }));
        }
        return [];
    }

    private syncTagsTextFromData() {
        const arr = this.normalizeTags(this.blogData?.tags);
        this.blogData.tags = arr;
        this.tagsText = arr.map(t => t?.title).filter(Boolean).join(', ');
    }

    private normalizeImageUrl(url: string): string {
        const value = String(url || '').trim();
        if (!value) return '';
        if (
            value.startsWith('http://') ||
            value.startsWith('https://') ||
            value.startsWith('data:') ||
            value.startsWith('blob:')
        ) {
            return value;
        }
        if (value.startsWith('/')) return `${this.backendBaseUrl}${value}`;
        return `${this.backendBaseUrl}/${value}`;
    }

    private normalizeHtmlImageUrls(html: string): string {
        const raw = String(html || '');
        if (!raw) return '';
        return raw.replace(/src=(['"])(\/uploads\/[^'"]+)\1/gi, (_m, quote, relPath) => {
            return `src=${quote}${this.backendBaseUrl}${relPath}${quote}`;
        });
    }

    onTagsTextChange() {
        const raw = String(this.tagsText || '');
        const titles = raw.split(',').map(s => s.trim()).filter(Boolean);
        this.blogData.tags = titles.map((title: string) => ({ title, slug: '' }));
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
                    this.filteredCategoriesList = [...this.categories];
                }
            },
            error: (err) => console.error('Lỗi tải danh mục', err)
        });
    }

    loadBlogDetail(id: string) {
        this.isLoading = true;
        this.blogService.getBlogById(id).subscribe({
            next: (res) => {
                if (res && res.success && res.data) {
                    const foundBlog = res.data;
                    if (foundBlog) {
                        const b = { ...foundBlog };
                        this.blogData = {
                            ...this.createEmptyBlog(),
                            ...b,
                            author: this.normalizeAuthor(b.author, b.display_author || b.authorName),
                            tags: this.normalizeTags(b.tags),
                            shortDescription: b.shortDescription || b.excerpt || b.description || '',
                            excerpt: b.excerpt || '',
                            url: b.url || b.originalUrl || '',
                            isActive: (typeof b.isActive === 'boolean') ? b.isActive : true,
                            isApproved: (typeof b.isApproved === 'boolean') ? b.isApproved : ((typeof b.is_approved === 'boolean') ? b.is_approved : false),
                        };

                        // Normalize primaryImage
                        if (typeof this.blogData.primaryImage === 'string') {
                            this.blogData.primaryImage = { url: this.blogData.primaryImage };
                        }
                        if (!this.blogData.primaryImage) this.blogData.primaryImage = { url: '' };
                        if (this.blogData.primaryImage && typeof this.blogData.primaryImage === 'object' && typeof this.blogData.primaryImage.url !== 'string') {
                            this.blogData.primaryImage.url = '';
                        }
                        this.blogData.primaryImage.url = this.normalizeImageUrl(this.blogData.primaryImage.url);
                        this.blogData.descriptionHtml = this.normalizeHtmlImageUrls(this.blogData.descriptionHtml || b.descriptionHtml || '');

                        if (!this.blogData.categoryId && this.blogData.category) {
                            this.blogData.categoryId = this.blogData.category.id || this.blogData.category._id;
                        }
                        
                        // Fix for multiple categories & parent category
                        if (!this.blogData.categories) this.blogData.categories = [];
                        
                        this.blogData.publishedAt = this.parseDateLike(this.blogData.publishedAt) || this.parseDateLike(b.published_at) || this.parseDateLike(b.createdAt) || this.parseDateLike(b.created_at);
                        this.syncTagsTextFromData();
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

    /** Tên hiển thị người duyệt (object hoặc chuỗi từ MongoDB). */
    getApproverDisplayName(): string {
        const a = this.blogData?.approver;
        if (a == null) return '';
        if (typeof a === 'string') return String(a).trim();
        return String(
            a.fullName || a.full_name || a.name || a.displayName || ''
        ).trim();
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

    filterCategories() {
        if (!this.searchTerm) {
            this.filteredCategoriesList = [...this.categories];
        } else {
            const term = this.searchTerm.toLowerCase();
            this.filteredCategoriesList = this.categories.filter(c => 
                c.name.toLowerCase().includes(term) || (c.slug && c.slug.toLowerCase().includes(term))
            );
        }
    }

    toggleCategoryDropdown(event?: Event) {
        event?.stopPropagation();
        this.isCategoryDropdownOpen = !this.isCategoryDropdownOpen;
        if (this.isCategoryDropdownOpen) {
            this.filterCategories();
        }
    }

    selectCategory(cat: any) {
        this.blogData.categoryId = cat?.id || '';
        this.searchTerm = '';
        this.filterCategories();
        this.isCategoryDropdownOpen = false;
    }

    get selectedCategoryName(): string {
        const cat = this.categories.find(c => c.id === this.blogData.categoryId);
        return cat?.name || '';
    }

    showNotification(message: string, type: 'success' | 'error' = 'success') {
        this.notification = { show: true, message, type };
        setTimeout(() => {
            if (this.notification.message === message) {
                this.notification.show = false;
            }
        }, 3000);
    }

    triggerImageInput(type: 'primary' | 'editor' = 'primary') {
        this.currentInsertingType = type;
        const fileInput = document.getElementById('imageLibraryUpload') as HTMLInputElement;
        if (fileInput) {
            fileInput.value = '';
            fileInput.click();
        }
    }

    triggerPrimaryImageInput() {
        const input = document.getElementById('primaryImageUpload') as HTMLInputElement;
        if (!input) return;
        input.value = '';
        input.click();
    }

    onPrimaryImageSelected(event: any) {
        const file = event?.target?.files?.[0];
        if (!file) return;
        event.target.value = '';
        this.isUploading = true;
        this.blogService.uploadBlogImage(file).subscribe({
            next: (res) => {
                this.isUploading = false;
                const url = this.normalizeImageUrl(res?.fullUrl || res?.url);
                if (!url) {
                    this.showNotification('Upload ảnh thất bại!', 'error');
                    return;
                }
                if (!this.blogData.primaryImage) this.blogData.primaryImage = { url: '' };
                this.blogData.primaryImage.url = url;
                this.imageLibrary.unshift(url);
                this.cdr.detectChanges();
                this.showNotification('Đã tải ảnh bìa từ thiết bị!', 'success');
            },
            error: (err) => {
                console.error('Upload primary image error', err);
                this.isUploading = false;
                this.showNotification('Upload ảnh thất bại (kiểm tra backend)!', 'error');
            }
        });
    }

    onFileSelected(event: any) {
        const file = event?.target?.files?.[0];
        if (!file) return;
        event.target.value = '';
        this.isUploading = true;
        this.blogService.uploadBlogImage(file).subscribe({
            next: (res) => {
                this.isUploading = false;
                const url = this.normalizeImageUrl(res?.fullUrl || res?.url);
                if (!url) {
                    this.showNotification('Upload ảnh thất bại!', 'error');
                    return;
                }
                this.imageLibrary.unshift(url);
                if (this.currentInsertingType === 'primary') {
                    if (!this.blogData.primaryImage) this.blogData.primaryImage = { url: '' };
                    this.blogData.primaryImage.url = url;
                    this.showNotification('Đã upload ảnh thành công!', 'success');
                } else if (this.currentInsertingType === 'editor') {
                    this.insertImageToEditor(url);
                    this.closeImageLibrary();
                    this.showNotification('Đã chèn ảnh vào nội dung!', 'success');
                }
                this.cdr.detectChanges();
            },
            error: (err) => {
                console.error('Upload image error', err);
                this.isUploading = false;
                this.showNotification('Upload ảnh thất bại (kiểm tra backend)!', 'error');
            }
        });
    }

    openImageLibrary(type: 'primary' | 'editor' = 'primary') {
        this.currentInsertingType = type;
        this.isImageLibraryOpen = true;
    }

    closeImageLibrary() {
        this.isImageLibraryOpen = false;
    }

    selectImageFromLibrary(url: string) {
        if (this.currentInsertingType === 'primary') {
            if (!this.blogData.primaryImage) this.blogData.primaryImage = { url: '' };
            this.blogData.primaryImage.url = url;
        } else {
            this.insertImageToEditor(url);
        }
        this.closeImageLibrary();
    }

    insertImageToEditor(url: string) {
        if (!this.contentEditor?.nativeElement) return;
        const editor = this.contentEditor.nativeElement;
        editor.focus();
        const img = `<img src="${url}" alt="Ảnh" style="max-width: 100%; height: auto; border-radius: 8px; margin: 16px 0; display: block;">`;
        document.execCommand('insertHTML', false, img);
        this.saveToHistory();
        this.updateBlogContent({ target: editor } as any);
    }

    saveBlog() {
        if (!this.blogData.title || !this.blogData.categoryId) {
            this.showNotification('Vui lòng nhập tiêu đề và chọn danh mục!', 'error');
            return;
        }

        this.isLoading = true;

        // Normalize author/tags before saving
        this.blogData.author = this.normalizeAuthor(this.blogData.author);
        this.blogData.tags = this.normalizeTags(this.blogData.tags);
        // If user typed tagsText, prefer it
        if (typeof this.tagsText === 'string' && this.tagsText.trim()) {
            this.onTagsTextChange();
        }

        // Dược sĩ: tác giả khi tạo bài; người duyệt khi bật Duyệt và lưu
        this.applyPharmacistBlogFields();

        // Keep shortDescription as primary excerpt field
        if (!this.blogData.shortDescription && this.blogData.excerpt) {
            this.blogData.shortDescription = this.blogData.excerpt;
        }

        // Find complete category from choices
        const cat = this.categories.find(c => c.id === this.blogData.categoryId);
        if (cat) {
            this.blogData.category = { id: cat.id, name: cat.name, slug: cat.slug };
            // Populate categories array if it's empty
            if (!this.blogData.categories || this.blogData.categories.length === 0) {
                this.blogData.categories = [this.blogData.category];
            }
        }

        // Final slug check
        if (!this.blogData.slug && this.blogData.title) {
            this.blogData.slug = this.generateSlug(this.blogData.title);
        }

        // Đồng bộ field snake_case nếu backend / Mongo dùng
        this.blogData.is_approved = this.blogData.isApproved;

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
        this.openImageLibrary('editor');
    }

    private savedEditorRange: Range | null = null;

    insertImageFromDevice(): void {
        if (this.contentEditor?.nativeElement) {
            this.contentEditor.nativeElement.focus();
            const sel = window.getSelection();
            if (sel && sel.rangeCount > 0) {
                this.savedEditorRange = sel.getRangeAt(0).cloneRange();
            }
        }
        const input = document.getElementById('editorImageUpload') as HTMLInputElement;
        if (!input) return;
        input.value = '';
        input.click();
    }

    onEditorImageSelected(event: any) {
        const file = event?.target?.files?.[0];
        if (!file) return;
        event.target.value = '';
        this.isUploading = true;
        this.cdr.detectChanges();
        this.blogService.uploadBlogImage(file).subscribe({
            next: (res) => {
                this.isUploading = false;
                const url = this.normalizeImageUrl(res?.fullUrl || res?.url);
                if (!url) {
                    this.showNotification('Upload ảnh thất bại!', 'error');
                    return;
                }
                if (this.contentEditor?.nativeElement) {
                    const editor = this.contentEditor.nativeElement;
                    editor.focus();
                    if (this.savedEditorRange) {
                        const sel = window.getSelection();
                        if (sel) {
                            sel.removeAllRanges();
                            sel.addRange(this.savedEditorRange);
                        }
                    }
                    const img = `<img src="${url}" alt="Ảnh" style="max-width: 100%; height: auto; border-radius: 8px; margin: 16px 0; display: block;">`;
                    document.execCommand('insertHTML', false, img);
                    this.saveToHistory();
                    this.updateBlogContent({ target: editor } as any);
                }
                this.showNotification('Đã chèn ảnh vào nội dung!', 'success');
                this.cdr.detectChanges();
            },
            error: (err) => {
                console.error('Upload editor image error', err);
                this.isUploading = false;
                this.showNotification('Upload ảnh thất bại (kiểm tra backend)!', 'error');
            }
        });
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

    /**
     * Gắn author / approver theo session dược sĩ (Quản lý blog — vai trò Pharmacist).
     */
    private applyPharmacistBlogFields(): void {
        if (!this.auth.isPharmacistAccount()) return;
        const authorPh = this.auth.getPharmacistBlogPerson(false);
        const approverPh = this.auth.getPharmacistBlogPerson(true);
        if (!authorPh || !approverPh) return;

        if (!this.isEditMode) {
            this.blogData.author = { ...authorPh };
            if (this.blogData.isApproved) {
                this.blogData.approver = { ...approverPh };
                this.blogData.approvedAt = new Date().toISOString();
            }
            return;
        }

        if (this.blogData.isApproved && !this.previousIsApproved) {
            this.blogData.approver = { ...approverPh };
            this.blogData.approvedAt = new Date().toISOString();
        } else if (this.blogData.isApproved && !this.blogData.approver) {
            this.blogData.approver = { ...approverPh };
            if (!this.blogData.approvedAt) {
                this.blogData.approvedAt = new Date().toISOString();
            }
        }
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
