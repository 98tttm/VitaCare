import { Component, OnInit, Inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { DiseaseService } from '../services/disease.service';
import { AdminMascotLoadingComponent } from '../shared/admin-mascot-loading/admin-mascot-loading.component';

@Component({
    selector: 'app-diseasedetail',
    standalone: true,
    imports: [CommonModule, FormsModule, AdminMascotLoadingComponent],
    providers: [DiseaseService],
    templateUrl: './diseasedetail.html',
    styleUrl: './diseasedetail.css'
})
export class Diseasedetail implements OnInit {
    isEditMode: boolean = false;
    diseaseId: string | null = null;
    isLoading: boolean = false;
    
    isImageLibraryOpen: boolean = false;
    imageLibrary: string[] = [];

    diseaseData: any = {
        name: '',
        headline: '',
        slug: '',
        disease_type: 'Bệnh',
        groupId: '',
        image: { url: '' },
        characteristics: {
            is_infectious: false,
            is_chronic: false,
            is_curable: true,
            is_fetal: false,
            is_common: false
        },
        seo: {
            metaTitle: '',
            metaDescription: ''
        },
        summary: '',
        title: '',
        video_url: '',
        reference_source: '',
        overview: '',
        definition: '',
        cause: '',
        symptoms: '',
        diagnosis: '',
        prevention: '',
        treatment: '',
        is_approved: true,
        categories: [],
        faqs: [],
        content_sections: [],
        reference_source_text: ''
    };

    groups: any[] = [];
    notification = { show: false, message: '', type: 'success' };
    isUploading: boolean = false;

    relatedSearch: string = '';
    relatedSearchResults: any[] = [];
    isSearchingRelated: boolean = false;
    showRelatedDropdown: boolean = false;
    relatedBodyParts: string[] = [];

    constructor(
        private route: ActivatedRoute,
        private router: Router,
        private cdr: ChangeDetectorRef,
        @Inject(DiseaseService) private diseaseService: DiseaseService
    ) { }

    ngOnInit() {
        this.loadGroups();
        this.route.queryParamMap.subscribe(params => {
            this.diseaseId = params.get('id');
            if (this.diseaseId) {
                this.isEditMode = true;
                this.loadDiseaseDetail(this.diseaseId);
            }
        });
    }

    loadGroups() {
        this.diseaseService.getGroups().subscribe({
            next: (res) => {
                if (res && res.success) {
                    this.groups = res.data;
                    this.resolveSelectedGroupId();
                    this.cdr.detectChanges();
                }
            }
        });
    }

    private toIdString(value: any): string {
        if (!value) return '';
        if (typeof value === 'string') return value.trim();
        if (typeof value === 'object') return String(value.$oid || value._id || value.id || '').trim();
        return String(value).trim();
    }

    private resolveSelectedGroupId() {
        if (!this.groups?.length) return;

        const currentGroupId = this.toIdString(this.diseaseData?.groupId);
        if (currentGroupId && this.groups.some(g => this.toIdString(g._id || g.id) === currentGroupId)) {
            this.diseaseData.groupId = currentGroupId;
            return;
        }

        const groupObj = this.diseaseData?.group || {};
        const directCandidates = [
            this.toIdString(groupObj._id),
            this.toIdString(groupObj.id),
            this.toIdString(this.diseaseData?.group?._id),
            this.toIdString(this.diseaseData?.group?.id)
        ].filter(Boolean);

        const directMatch = this.groups.find(g => directCandidates.includes(this.toIdString(g._id || g.id)));
        if (directMatch) {
            this.diseaseData.groupId = this.toIdString(directMatch._id || directMatch.id);
            return;
        }

        const groupName = String(groupObj?.name || '').trim().toLowerCase();
        if (groupName) {
            const nameMatch = this.groups.find(g => String(g?.name || '').trim().toLowerCase() === groupName);
            if (nameMatch) {
                this.diseaseData.groupId = this.toIdString(nameMatch._id || nameMatch.id);
                return;
            }
        }

        const fullPathSlugs = [...(this.diseaseData?.categories || []), ...(this.diseaseData?.subjects || [])]
            .map((c: any) => String(c?.fullPathSlug || c?.full_path_slug || '').trim().toLowerCase())
            .filter(Boolean);
        const slugMatch = this.groups.find(g => {
            const slug = String(g?.slug || '').trim().toLowerCase();
            return slug && fullPathSlugs.some((path: string) => path.includes(`/${slug}`));
        });
        if (slugMatch) {
            this.diseaseData.groupId = this.toIdString(slugMatch._id || slugMatch.id);
        }
    }

    private formatBodyPartLabelFromSlug(slug: string): string {
        const map: Record<string, string> = {
            dau: 'Đầu',
            co: 'Cổ',
            nguc: 'Ngực',
            bung: 'Bụng',
            'sinh-duc': 'Sinh dục',
            'tu-chi': 'Tứ chi',
            da: 'Da'
        };
        return map[slug] || slug.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
    }

    private resolveRelatedBodyParts() {
        const cats = [...(this.diseaseData?.categories || []), ...(this.diseaseData?.subjects || [])];
        const partSlugs = cats
            .map((c: any) => String(c?.fullPathSlug || c?.full_path_slug || '').trim())
            .map((slug: string) => {
                const match = slug.match(/benh\/xem-theo-bo-phan-co-the\/([^/]+)/i);
                return match?.[1] || '';
            })
            .filter(Boolean);

        const uniqueParts = Array.from(new Set(partSlugs)).map((slug: string) => this.formatBodyPartLabelFromSlug(slug));
        this.relatedBodyParts = uniqueParts;

        if (!this.diseaseData.bodyPart && uniqueParts.length > 0) {
            this.diseaseData.bodyPart = uniqueParts.join(', ');
        }
    }

    loadDiseaseDetail(id: string) {
        this.isLoading = true;
        this.diseaseService.getDiseaseById(id).subscribe({
            next: (res) => {
                if (res && res.success) {
                    this.diseaseData = { ...this.diseaseData, ...res.data };
                    
                    // Map groupId from group object if available
                    if (this.diseaseData.group) {
                        this.diseaseData.groupId = this.toIdString(this.diseaseData.group.id || this.diseaseData.group._id || '');
                    }

                    // Extract fields from content_sections if they exist (standard in benh.json)
                    if (res.data.content_sections && Array.isArray(res.data.content_sections)) {
                        res.data.content_sections.forEach((section: any) => {
                            const content = section.text || section.html || '';
                            switch (section.key) {
                                case 'description': this.diseaseData.overview = content; break;
                                case 'symptom': this.diseaseData.symptoms = content; break;
                                case 'aetiologies': this.diseaseData.cause = content; break;
                                case 'living_and_preventive': this.diseaseData.prevention = content; break;
                                case 'diagnose_and_treaty': 
                                    // Often both diagnosis and treatment are here, or separate
                                    if (section.label.includes('Chẩn đoán')) this.diseaseData.diagnosis = content;
                                    if (section.label.includes('điều trị')) this.diseaseData.treatment = content;
                                    // Fallback if label is generic
                                    if (!this.diseaseData.treatment) this.diseaseData.treatment = content;
                                    break;
                            }
                        });
                    }

                    // Map reference source
                    if (res.data.reference_source_text) {
                        this.diseaseData.reference_source = res.data.reference_source_text;
                    }
                    
                    // Ensure nested objects exist
                    if (!this.diseaseData.characteristics) {
                        this.diseaseData.characteristics = { is_infectious: false, is_chronic: false, is_curable: true, is_fetal: false, is_common: false };
                    }
                    if (!this.diseaseData.seo) {
                        this.diseaseData.seo = { metaTitle: res.data.seo?.metaTitle || '', metaDescription: res.data.seo?.metaDescription || '' };
                    }
                    if (!this.diseaseData.image) {
                        this.diseaseData.image = { url: '' };
                    } else if (typeof this.diseaseData.image === 'string') {
                        this.diseaseData.image = { url: this.diseaseData.image };
                    }
                    
                    // Fallback for primary_image
                    if (!this.diseaseData.image?.url && this.diseaseData.primary_image?.url) {
                        this.diseaseData.image = { url: this.diseaseData.primary_image.url };
                    }

                    this.resolveSelectedGroupId();
                    this.resolveRelatedBodyParts();
                    this.cdr.markForCheck();
                    this.cdr.detectChanges();
                }
                setTimeout(() => {
                    this.isLoading = false;
                    this.cdr.detectChanges();
                }, 100);
            },
            error: (err) => {
                console.error('Lỗi tải chi tiết bệnh', err);
                this.isLoading = false;
                this.showNotification('Không tìm thấy dữ liệu bệnh!', 'error');
            }
        });
    }

    onNameChange() {
        if (!this.isEditMode || !this.diseaseData.slug) {
            this.diseaseData.slug = this.generateSlug(this.diseaseData.name);
        }
        if (!this.diseaseData.seo.metaTitle) {
            this.diseaseData.seo.metaTitle = this.diseaseData.name;
        }
    }

    generateSlug(name: string): string {
        if (!name) return '';
        let slug = name.toLowerCase();

        // Vietnamese tone normalization
        slug = slug.replace(/[àáạảãâầấậẩẫăằắặẳẵ]/g, "a");
        slug = slug.replace(/[èéẹẻẽêềếệểễ]/g, "e");
        slug = slug.replace(/[ìíịỉĩ]/g, "i");
        slug = slug.replace(/[òóọỏõôồốộổỗơờớợởỡ]/g, "o");
        slug = slug.replace(/[ùúụủũưừứựửữ]/g, "u");
        slug = slug.replace(/[ỳýỵỷỹ]/g, "y");
        slug = slug.replace(/đ/g, "d");

        // Remove accents marks
        slug = slug.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        slug = slug.replace(/[^a-z0-9\s-]/g, '');
        slug = slug.replace(/\s+/g, '-');
        slug = slug.replace(/-+/g, '-');
        slug = slug.trim();

        if (slug) return 'benh/' + slug + '.html';
        return '';
    }

    searchRelatedDiseases() {
        if (!this.relatedSearch.trim()) {
            this.relatedSearchResults = [];
            this.showRelatedDropdown = false;
            return;
        }
        this.isSearchingRelated = true;
        this.showRelatedDropdown = true;
        this.diseaseService.searchDiseases(this.relatedSearch).subscribe({
            next: (res: any) => {
                if (res?.success) {
                    const existing = (this.diseaseData.related_diseases || []).map((r: any) => String(r._id || r.id));
                    this.relatedSearchResults = (res.data || [])
                        .filter((d: any) => String(d._id) !== String(this.diseaseId) && !existing.includes(String(d._id)))
                        .slice(0, 8);
                }
                this.isSearchingRelated = false;
            },
            error: () => { this.isSearchingRelated = false; }
        });
    }

    addRelatedDisease(d: any) {
        if (!this.diseaseData.related_diseases) this.diseaseData.related_diseases = [];
        if (!this.diseaseData.related_diseases.find((r: any) => String(r._id || r.id) === String(d._id))) {
            this.diseaseData.related_diseases.push({ _id: d._id, name: d.name, slug: d.slug });
        }
        this.relatedSearchResults = this.relatedSearchResults.filter((r: any) => String(r._id) !== String(d._id));
        this.relatedSearch = '';
        this.showRelatedDropdown = false;
        this.cdr.detectChanges();
    }

    removeRelatedDisease(id: string) {
        this.diseaseData.related_diseases = (this.diseaseData.related_diseases || []).filter(
            (r: any) => String(r._id || r.id) !== String(id)
        );
        this.cdr.detectChanges();
    }

    addFaq() {
        if (!this.diseaseData.faqs) this.diseaseData.faqs = [];
        this.diseaseData.faqs.push({ question: '', answer_text: '' });
    }

    removeFaq(index: number) {
        this.diseaseData.faqs.splice(index, 1);
    }

    triggerImageInput() {
        const fileInput = document.getElementById('imageLibraryUpload') as HTMLInputElement;
        if (fileInput) {
            fileInput.value = '';
            fileInput.click();
        }
    }

    triggerPrimaryImageInput() {
        const input = document.getElementById('primaryDiseaseImageUpload') as HTMLInputElement;
        if (!input) return;
        input.value = '';
        input.click();
    }

    onPrimaryImageSelected(event: any) {
        const file = event?.target?.files?.[0];
        if (!file) return;
        event.target.value = '';
        this.isUploading = true;
        const reader = new FileReader();
        reader.onload = (e: any) => {
            const url = e.target?.result || '';
            if (!url) {
                this.isUploading = false;
                this.showNotification('Không đọc được ảnh đã chọn!', 'error');
                return;
            }
            this.imageLibrary.unshift(url);
            if (!this.diseaseData.image) this.diseaseData.image = { url: '' };
            this.diseaseData.image.url = url;
            this.isUploading = false;
            this.cdr.detectChanges();
            this.showNotification('Đã chọn ảnh đại diện từ thiết bị!', 'success');
        };
        reader.onerror = () => {
            this.isUploading = false;
            this.showNotification('Đọc file ảnh thất bại!', 'error');
        };
        reader.readAsDataURL(file);
    }

    onFileSelected(event: any) {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e: any) => {
                const url = e.target.result;
                this.imageLibrary.unshift(url);
                if (!this.diseaseData.image) this.diseaseData.image = { url: '' };
                this.diseaseData.image.url = url;
                this.cdr.detectChanges();
                this.showNotification('Đã tải ảnh lên thành công!');
            };
            reader.readAsDataURL(file);
        }
    }

    openImageLibrary() {
        this.isImageLibraryOpen = true;
    }

    closeImageLibrary() {
        this.isImageLibraryOpen = false;
    }

    selectImageFromLibrary(url: string) {
        if (!this.diseaseData.image) this.diseaseData.image = { url: '' };
        this.diseaseData.image.url = url;
        this.closeImageLibrary();
        this.cdr.detectChanges();
    }

    saveDisease() {
        if (!this.diseaseData.name) {
            this.showNotification('Vui lòng nhập tên bệnh!', 'error');
            return;
        }

        this.isLoading = true;
        
        // Synchronize flat fields back to content_sections for DB consistency
        this.diseaseData.content_sections = [
            { key: 'description', label: 'Tổng quan', text: this.diseaseData.overview },
            { key: 'symptom', label: 'Triệu chứng', text: this.diseaseData.symptoms },
            { key: 'aetiologies', label: 'Nguyên nhân', text: this.diseaseData.cause },
            { key: 'living_and_preventive', label: 'Lối sống & phòng ngừa', text: this.diseaseData.prevention },
            { key: 'diagnose_and_treaty', label: 'Chẩn đoán & điều trị', text: `${this.diseaseData.diagnosis}\n${this.diseaseData.treatment}`.trim() }
        ].filter(s => s.text && s.text.trim() !== '');

        // Sync reference source
        this.diseaseData.reference_source_text = this.diseaseData.reference_source;

        // Find group name
        const group = this.groups.find(g => (g._id || g.id) === this.diseaseData.groupId);
        if (group) {
            this.diseaseData.group = { id: group._id || group.id, name: group.name };
        }

        const action = this.isEditMode && this.diseaseId
            ? this.diseaseService.updateDisease(this.diseaseId, this.diseaseData)
            : this.diseaseService.createDisease(this.diseaseData);

        action.subscribe({
            next: (res) => {
                this.isLoading = false;
                this.showNotification(this.isEditMode ? 'Cập nhật thành công!' : 'Thêm mới thành công!', 'success');
                setTimeout(() => this.goBack(), 1500);
            },
            error: (err) => {
                this.isLoading = false;
                console.error('Lỗi khi lưu bệnh:', err);
                this.showNotification('Có lỗi xảy ra khi kết nối server!', 'error');
            }
        });
    }

    goBack() {
        this.router.navigate(['/admin/diseases']);
    }

    showNotification(message: string, type: 'success' | 'error' = 'success') {
        this.notification = { show: true, message, type };
        setTimeout(() => this.notification.show = false, 3000);
    }
}
