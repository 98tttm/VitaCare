import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-filter',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './filter.html',
  styleUrl: './filter.css',
})
export class Filter {
  @Input() hierarchy: any = null;
  @Input() activeCategorySlug: string = '';
  @Input() brands: string[] = [];
  @Input() priceRanges: any[] = [];
  @Input() activeFilters: any = {};

  @Output() filterChanged = new EventEmitter<any>();
  @Output() categorySelected = new EventEmitter<any>();

  // Section Collapsed State (true = collapsed, false = expanded)
  // Default: Audience, Price, Flavor are expanded (false); others collapsed (true)
  sectionCollapsed: any = {
    audience: false,
    price: false,
    flavor: false,
    country: true,
    indication: true,
    brand: true,
    origin: true
  };

  // Limits
  limitAudience = 5;
  limitFlavor = 5;
  limitCountry = 5;
  limitIndication = 5;
  limitBrand = 5;

  // Search Queries
  searchQueries: any = {
    audience: '',
    flavor: '',
    country: '',
    indication: '',
    brand: '',
    origin: ''
  };

  getFilteredList(type: string, list: string[]): string[] {
    const query = this.searchQueries[type]?.toLowerCase() || '';
    if (!query) return list;
    return list.filter(item => item.toLowerCase().includes(query));
  }

  // Data Lists
  audienceList = [
    'Tất cả', 'Trẻ em', 'Người trưởng thành', 'Người lớn', 'Phụ nữ có thai', 'Phụ nữ cho con bú', 'Người cao tuổi',
    'Phụ nữ chuẩn bị mang thai', 'Phụ nữ tuổi tiền mãn kinh và mãn kinh', 'Phụ nữ', 'Phụ nữ sau sinh', 'Thanh thiếu niên',
    'Trẻ sơ sinh', 'Nam giới trưởng thành', 'Người bị tiểu đường', 'Người lớn bị loãng xương', 'Trẻ em trên 2 tuổi',
    'Người bị mỡ máu', 'Người có nguy cơ hình thành cục máu đông', 'Người có nhu cầu bổ sung calci',
    'Người sau tai biến mạch máu não do tắc mạch', 'Người thiếu năng tuần hoàn não', 'Phụ nữ sảy thai',
    'Phụ nữ trong thời kỳ kinh nguyệt'
  ];

  flavorList = [
    'Tất cả', 'Vani', 'Vị Cam', 'Hương cam', 'Hương chanh', 'Hương dưa hấu', 'Vị Dâu', 'Vị Vanila'
  ];

  countryList = [
    'Tất cả', 'Việt Nam', 'Hoa Kỳ', 'Nhật Bản', 'Úc', 'Ý', 'Pháp', 'Anh', 'Thụy Điển', 'Singapore', 'Đức', 'Đan Mạch',
    'Ba Lan', 'New Zealand', 'Tây Ban Nha', 'Hàn Quốc', 'Slovenia', 'Thụy Sĩ', 'Canada', 'Thái Lan', 'Bulgaria',
    'Malaysia', 'Thổ Nhĩ Kỳ', 'Brazil', 'Hà Lan', 'Indonesia', 'Ấn Độ', 'Cộng hòa Séc', 'Hồng Kông', 'Slovakia', 'Sri Lanka', 'Áo'
  ];

  indicationList = [
    'Tất cả', 'Rối loạn tiêu hóa', 'Thoái hóa khớp', 'Táo bón', 'Viêm họng', 'Viêm khớp', 'Biếng ăn', 'Khó tiêu', 'Mất ngủ',
    'Ho', 'Ho có đàm', 'Hội chứng tiền mãn kinh', 'Suy giảm hệ miễn dịch', 'Tiêu chảy', 'Đi ngoài phân sống', 'Cholesterol máu cao',
    'Cảm lạnh', 'Giãn tĩnh mạch', 'Ho khan', 'Lão hóa da', 'Mãn kinh nữ', 'Stress', 'Suy dinh dưỡng', 'Suy giảm trí nhớ',
    'Xơ vữa động mạch', 'Đau lưng', 'Chậm tăng trưởng', 'Gan nhiễm mỡ', 'Mệt mỏi', 'Mỏi gối', 'Rát họng', 'Yếu sinh lý',
    'Đi tiểu nhiều', 'Đầy hơi', 'Ho gió', 'Mỡ máu', 'Nổi mẩn ngứa', 'Rối loạn chức năng gan', 'Suy giảm tuần hoàn máu',
    'Suy nhược cơ thể', 'Trào ngược dạ dày', 'Tê chân', 'Viêm đại tràng co thắt', 'Xơ gan', 'Đau khớp', 'Đau đầu', 'Bệnh tim mạch',
    'Các rối loạn tiểu tiện (đái dầm, tiểu đêm, tiểu són)', 'Còi xương', 'Hoa mắt chóng mặt', 'Lo âu', 'Men gan cao', 'Mề đay',
    'Nám sạm', 'Suy giảm nội tiết tố', 'Sạm da', 'Sổ mũi', 'Tiểu đêm', 'Trĩ', 'Tê tay', 'U xơ tuyến tiền liệt', 'Viêm dạ dày',
    'Viêm gan', 'Viêm khớp dạng thấp', 'Viêm phế quản', 'Đái tháo đường (Tiểu đường)', 'Bệnh gan do rượu', 'Bệnh mạch vành',
    'Bỏng mắt', 'Cao huyết áp', 'Chán ăn', 'Chướng bụng', 'Giãn tĩnh mạch chi dưới', 'Gút', 'Khô âm đạo', 'Kém hấp thu',
    'Loãng xương', 'Loét dạ dày tá tràng', 'Nhức mỏi mắt', 'Rối loạn giấc ngủ', 'Rối loạn tiền đình', 'Rụng tóc',
    'Suy nhược thần kinh', 'Sỏi mật', 'Tai biến mạch máu não', 'Thiếu canxi', 'Thoái hóa khớp gối', 'Thoái hóa điểm vàng',
    'Viêm thị thần kinh', 'Viêm đại tràng', 'Đau dạ dày', 'Đau bụng', 'Đau nửa đầu', 'Đau thần kinh tọa', 'Đi tiểu thường xuyên',
    'Ợ chua', 'Alzheimer', 'Béo phì', 'Chuột rút co cứng', 'Chứng khó ngủ', 'Da khô – mất ẩm'
  ];

  brandList = [
    'Tất cả', 'Jpanwell', 'Kingphar', 'Thái Minh', 'Vitamins For Life', 'OMEXXEL', 'Abbott', 'Ecogreen', 'Nam Dược', 'Vitabiotics',
    'Á Âu', 'Traphaco', 'KENKO', 'NEW NORDIC', 'OCAVILL', 'Royal Care', 'VITADAIRY', 'Brauer', 'FITOBIMBI', 'Nature\'s Bounty',
    'Sanofi', 'Tuệ Linh', 'Tâm Bình', 'Hải Thượng Vương', 'Nature\'s Way', 'Blackmores', 'Dhg', 'ORIHIRO', 'Vinh Gia', 'Buona',
    'CVI Pharma', 'DAO Nordic Health', 'GINKID', 'Good Health', 'Hatro', 'Hdpharma', 'MEGA We care', 'Nestlé', 'Pediakid',
    'Pharmekal', 'Soki', 'Thành Công', 'Vitatree', 'Đông Tây', 'Botania', 'KUDOS', 'Livespo', 'NPJ', 'NUTIFOOD', 'Naturecare',
    'OSTELIN', 'Pharma World', 'Vesta', 'proMUM', 'Anlene', 'BIOAMICUS', 'Biogaia', 'Doppelherz', 'ERGOPHARMA', 'KenKan',
    'Lab Well', 'Morningkids', 'NUTRIMED', 'Nhãn khác', 'Trung Mỹ', 'Tw3', 'Tất Thành', 'Appeton', 'BIOCHEMPHA', 'Bayer', 'Botafarma'
  ];

  toggleLimit(type: string) {
    if (type === 'audience') {
      this.limitAudience = this.limitAudience >= this.audienceList.length ? 5 : this.limitAudience + 5;
    }
    if (type === 'flavor') {
      this.limitFlavor = this.limitFlavor >= this.flavorList.length ? 5 : this.limitFlavor + 5;
    }
    if (type === 'country') {
      this.limitCountry = this.limitCountry >= this.countryList.length ? 5 : this.limitCountry + 5;
    }
    if (type === 'indication') {
      this.limitIndication = this.limitIndication >= this.indicationList.length ? 5 : this.limitIndication + 5;
    }
    if (type === 'brand') {
      this.limitBrand = this.limitBrand >= this.brandList.length ? 5 : this.limitBrand + 5;
    }
  }

  toggleCollapse(section: string) {
    if (this.sectionCollapsed[section] !== undefined) {
      this.sectionCollapsed[section] = !this.sectionCollapsed[section];
    }
  }

  onCategoryClick(category: any) {
    this.categorySelected.emit(category);
  }

  isCategoryActive(slug: string): boolean {
    return this.activeCategorySlug === slug;
  }

  onBrandChange(brand: string, event: any) {
    this.filterChanged.emit({
      type: 'brand',
      value: brand,
      checked: event.target.checked
    });
    // updating activeFilters locally for UI ref logic if needed, 
    // but usually parent updates input.
  }

  onPriceChangeBtn(range: any) {
    if (this.activeFilters.minPrice == range.min && this.activeFilters.maxPrice == range.max) {
      // Toggle off if already active (use loose comparison for string params)
      this.filterChanged.emit({
        type: 'price',
        value: { min: null, max: null }
      });
    } else {
      this.filterChanged.emit({
        type: 'price',
        value: range
      });
    }
  }

  onPriceChange(range: any, event: any) {
    if (event.target.checked) {
      this.filterChanged.emit({
        type: 'price',
        value: range
      });
    } else {
      // If unchecking, usually means reset or remove. 
      // For radio behavior (single select price), unchecking might not be common UI,
      // but if it's checkboxes, we handle differently.
      // Assuming radio-like behavior for price ranges typically.
      this.filterChanged.emit({
        type: 'price',
        value: { min: null, max: null } // reset
      });
    }
  }

  // Helper for "All" or other filters
  onFilterChange(type: string, value: any, event: any) {
    this.filterChanged.emit({
      type: type,
      value: value,
      checked: event.target.checked
    });
  }
}
