/**
 * VitaCare Icons - TypeScript Constants
 * Định nghĩa paths cho custom icons trong assets
 */

// Base path cho icons
const ICON_BASE_PATH = '/assets/icon/';

/**
 * Custom Icons từ assets/icon
 * Tất cả icons đã có trong thư mục assets
 */
export const VitaCareIcons = {
    // Payment & Financial
    payment: {
        vnpay: `${ICON_BASE_PATH}VNPAY.png`,
        vnpayWebp: `${ICON_BASE_PATH}vnpay.webp`,
        international: `${ICON_BASE_PATH}ThanhToanquocte.png`,
        internationalJpg: `${ICON_BASE_PATH}ThanhToanQuocTe.jpg`,
    },

    // Arrows & Navigation
    arrows: {
        down: `${ICON_BASE_PATH}arrowdown.png`,
        left: `${ICON_BASE_PATH}arrowleft.png`,
        leftCircle: `${ICON_BASE_PATH}arrowleft_circle.png`,
        leftCircleFill: `${ICON_BASE_PATH}arrowleft_circle_fill.png`,
        rightCircle: `${ICON_BASE_PATH}arrowright_circle.png`,
        rightCircleFill: `${ICON_BASE_PATH}arrowright_circle_fill.png`,
        upCircle: `${ICON_BASE_PATH}arrowup_circle.png`,
    },

    // Health & Medical
    health: {
        blood: `${ICON_BASE_PATH}blood.png`,
        blood1: `${ICON_BASE_PATH}blood (1).png`,
        blood2: `${ICON_BASE_PATH}blood (2).png`,
        bloodPressure: `${ICON_BASE_PATH}blood-pressure_3389235.png`,
        fracture: `${ICON_BASE_PATH}fracture_18353001.png`,
        medical: `${ICON_BASE_PATH}medical_16660084.png`,
        pregnant: `${ICON_BASE_PATH}pregnant_1382776.png`,
        waterEnergy: `${ICON_BASE_PATH}water-energy_3274977.png`,
        weightDevice: `${ICON_BASE_PATH}weight-device.png`,
    },

    // Food & Nutrition
    food: {
        chef: `${ICON_BASE_PATH}chef.png`,
        coffee: `${ICON_BASE_PATH}coffee.png`,
        fruit: `${ICON_BASE_PATH}fruit.png`,
        grain: `${ICON_BASE_PATH}grain.png`,
        leaf: `${ICON_BASE_PATH}leaf.png`,
        nutrition: `${ICON_BASE_PATH}nutrition.png`,
        oil: `${ICON_BASE_PATH}oil_7849400.png`,
        seaweed: `${ICON_BASE_PATH}seaweed.png`,
        vegetable: `${ICON_BASE_PATH}vegetable.png`,
        dry: `${ICON_BASE_PATH}dry.png`,
        kcal: `${ICON_BASE_PATH}kcal_7246702.png`,
    },

    // E-commerce & Shopping
    commerce: {
        delivery: `${ICON_BASE_PATH}delivery.png`,
        delivery1: `${ICON_BASE_PATH}delivery(1).png`,
        warehouse: `${ICON_BASE_PATH}warehouse.png`,
        logistic: `${ICON_BASE_PATH}logistic.png`,
        price: `${ICON_BASE_PATH}price.png`,
        sale: `${ICON_BASE_PATH}sale.png`,
        saleOutline: `${ICON_BASE_PATH}sale_outline.png`,
        flashSale: `${ICON_BASE_PATH}flash_sale.png`,
        flashSale2: `${ICON_BASE_PATH}flash_sale2.png`,
        promotion: `${ICON_BASE_PATH}promotion.png`,
        noOrder: `${ICON_BASE_PATH}no-order.png`,
    },

    // User & Account
    user: {
        customer: `${ICON_BASE_PATH}customer.png`,
        androgyne: `${ICON_BASE_PATH}androgyne_6343181.png`,
        transgender: `${ICON_BASE_PATH}transgender_10894616.png`,
        name: `${ICON_BASE_PATH}name.png`,
        vip: `${ICON_BASE_PATH}vip.png`,
    },

    // Actions & Interface
    actions: {
        edit: `${ICON_BASE_PATH}edit.png`,
        filter: `${ICON_BASE_PATH}filter.png`,
        menu: `${ICON_BASE_PATH}menu_447096.png`,
        exchange: `${ICON_BASE_PATH}exchange.png`,
        return: `${ICON_BASE_PATH}return.png`,
        use: `${ICON_BASE_PATH}use.png`,
        multiple: `${ICON_BASE_PATH}multiple.png`,
        shareLink: `${ICON_BASE_PATH}share_link.png`,
    },

    // Time & Calendar
    time: {
        clock: `${ICON_BASE_PATH}clock_16472429.png`,
        time: `${ICON_BASE_PATH}time.png`,
        timeLeft: `${ICON_BASE_PATH}time-left.png`,
        history: `${ICON_BASE_PATH}history.png`,
    },

    // Notifications & Messages
    notifications: {
        bell: `${ICON_BASE_PATH}notification-bell.png`,
        info: `${ICON_BASE_PATH}info.png`,
        note: `${ICON_BASE_PATH}note.png`,
        notebook: `${ICON_BASE_PATH}notebook_702903.png`,
        writing: `${ICON_BASE_PATH}writing_2097728.png`,
    },

    // Social Media
    social: {
        google: `${ICON_BASE_PATH}google.png`,
        tiktok: `${ICON_BASE_PATH}tiktok.png`,
        zalo: `${ICON_BASE_PATH}zalo.png`,
    },

    // Badges & Achievements
    badges: {
        goldMedal: `${ICON_BASE_PATH}gold-medal.png`,
        silverMedal: `${ICON_BASE_PATH}silver-medal.png`,
        bronzeMedal: `${ICON_BASE_PATH}bronze-medal.png`,
    },

    // Misc
    misc: {
        loading: `${ICON_BASE_PATH}loading.png`,
        logout: `${ICON_BASE_PATH}logout.png`,
        moveLocation: `${ICON_BASE_PATH}move location.png`,
        noHeart: `${ICON_BASE_PATH}no_heart.png`,
        quote: `${ICON_BASE_PATH}quote.png`,
        vitabot: `${ICON_BASE_PATH}vitabot.png`,
    },
} as const;

/**
 * Bootstrap Icons - Commonly used icons
 * Full list: https://icons.getbootstrap.com/
 * 
 * Usage in TypeScript:
 * import { VitaCareIcons, BootstrapIcons } from '@/styles/icons';
 */
export const BootstrapIcons = {
    // Navigation
    home: 'bi-house-door',
    menu: 'bi-list',
    close: 'bi-x',
    search: 'bi-search',

    // Arrows
    arrowLeft: 'bi-arrow-left',
    arrowRight: 'bi-arrow-right',
    arrowUp: 'bi-arrow-up',
    arrowDown: 'bi-arrow-down',
    chevronLeft: 'bi-chevron-left',
    chevronRight: 'bi-chevron-right',
    chevronDown: 'bi-chevron-down',
    chevronUp: 'bi-chevron-up',

    // E-commerce
    cart: 'bi-cart',
    cartFill: 'bi-cart-fill',
    bag: 'bi-bag',
    bagFill: 'bi-bag-fill',
    heart: 'bi-heart',
    heartFill: 'bi-heart-fill',
    star: 'bi-star',
    starFill: 'bi-star-fill',

    // User
    person: 'bi-person',
    personFill: 'bi-person-fill',
    personCircle: 'bi-person-circle',
    people: 'bi-people',

    // Communication
    chat: 'bi-chat',
    chatDots: 'bi-chat-dots',
    telephone: 'bi-telephone',
    envelope: 'bi-envelope',

    // Actions
    pencil: 'bi-pencil',
    trash: 'bi-trash',
    plus: 'bi-plus',
    plusCircle: 'bi-plus-circle',
    dash: 'bi-dash',
    check: 'bi-check',
    checkCircle: 'bi-check-circle',
    x: 'bi-x',
    xCircle: 'bi-x-circle',

    // Status
    info: 'bi-info-circle',
    infoFill: 'bi-info-circle-fill',
    warning: 'bi-exclamation-triangle',
    warningFill: 'bi-exclamation-triangle-fill',
    danger: 'bi-x-circle',
    dangerFill: 'bi-x-circle-fill',
    success: 'bi-check-circle',
    successFill: 'bi-check-circle-fill',

    // Loading
    spinner: 'bi-arrow-repeat',

    // Others
    eye: 'bi-eye',
    eyeSlash: 'bi-eye-slash',
    filter: 'bi-filter',
    calendar: 'bi-calendar',
    clock: 'bi-clock',
    bell: 'bi-bell',
    bellFill: 'bi-bell-fill',
    gear: 'bi-gear',
    download: 'bi-download',
    upload: 'bi-upload',
    share: 'bi-share',

    // Medical
    hospital: 'bi-hospital',
    capsule: 'bi-capsule',
    heartPulse: 'bi-heart-pulse',
} as const;

// Helper function to get custom icon path
export function getCustomIcon(category: keyof typeof VitaCareIcons, name: string): string {
    const icons = VitaCareIcons[category] as Record<string, string>;
    return icons[name] || '';
}

// Helper function to get Bootstrap icon class
export function getBootstrapIcon(name: keyof typeof BootstrapIcons): string {
    return `bi ${BootstrapIcons[name]}`;
}

// Type exports
export type CustomIconCategory = keyof typeof VitaCareIcons;
export type BootstrapIconName = keyof typeof BootstrapIcons;
